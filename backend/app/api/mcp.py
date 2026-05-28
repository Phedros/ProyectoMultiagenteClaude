"""
MCP Server management API.

CRUD endpoints for MCP server configurations + a test-connection endpoint.
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
import uuid

from app.database import SessionLocal
from app.models.mcp_server import MCPServer
from app.core.mcp_client import list_mcp_tools, mcp_available

router = APIRouter(prefix="/mcp-servers", tags=["mcp"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class MCPServerBase(BaseModel):
    name: str
    transport: str = "stdio"          # "stdio" | "sse"
    command: Optional[str] = None
    args: List[str] = []
    env_vars: dict = {}
    url: Optional[str] = None


class MCPServerCreate(MCPServerBase):
    pass


class MCPServerUpdate(BaseModel):
    name: Optional[str] = None
    transport: Optional[str] = None
    command: Optional[str] = None
    args: Optional[List[str]] = None
    env_vars: Optional[dict] = None
    url: Optional[str] = None


class MCPServerResponse(MCPServerBase):
    id: str
    created_at: str

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# DB dependency
# ---------------------------------------------------------------------------

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

@router.get("/", response_model=List[MCPServerResponse])
def list_servers(db: Session = Depends(get_db)):
    servers = db.query(MCPServer).order_by(MCPServer.created_at).all()
    return [_to_response(s) for s in servers]


@router.post("/", response_model=MCPServerResponse, status_code=201)
def create_server(payload: MCPServerCreate, db: Session = Depends(get_db)):
    _validate(payload)
    existing = db.query(MCPServer).filter(MCPServer.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Server '{payload.name}' already exists")

    server = MCPServer(
        id=str(uuid.uuid4()),
        name=payload.name,
        transport=payload.transport,
        command=payload.command,
        args=payload.args or [],
        env_vars=payload.env_vars or {},
        url=payload.url,
    )
    db.add(server)
    db.commit()
    db.refresh(server)
    return _to_response(server)


@router.put("/{server_id}", response_model=MCPServerResponse)
def update_server(server_id: str, payload: MCPServerUpdate, db: Session = Depends(get_db)):
    server = _get_or_404(server_id, db)
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(server, field, value)
    db.commit()
    db.refresh(server)
    return _to_response(server)


@router.delete("/{server_id}", status_code=204)
def delete_server(server_id: str, db: Session = Depends(get_db)):
    server = _get_or_404(server_id, db)
    db.delete(server)
    db.commit()


@router.post("/{server_id}/test")
async def test_connection(server_id: str, db: Session = Depends(get_db)):
    """
    Attempt to connect to the MCP server and list its tools.
    Returns tool count and names on success, error message on failure.
    """
    if not mcp_available():
        raise HTTPException(
            status_code=503,
            detail="MCP package not installed on server. Run: pip install mcp",
        )

    server = _get_or_404(server_id, db)
    config = _server_to_config(server)

    tools = await list_mcp_tools(config)
    if tools:
        return {
            "ok": True,
            "tool_count": len(tools),
            "tools": [t["function"]["name"].split("__")[-1] for t in tools],
        }
    else:
        return {
            "ok": False,
            "error": "Could not connect or server returned no tools",
        }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_or_404(server_id: str, db: Session) -> MCPServer:
    server = db.query(MCPServer).filter(MCPServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="MCP server not found")
    return server


def _validate(payload: MCPServerBase) -> None:
    if payload.transport == "stdio" and not payload.command:
        raise HTTPException(status_code=400, detail="stdio transport requires a command")
    if payload.transport == "sse" and not payload.url:
        raise HTTPException(status_code=400, detail="sse transport requires a url")


def _to_response(server: MCPServer) -> dict:
    return {
        "id": server.id,
        "name": server.name,
        "transport": server.transport,
        "command": server.command,
        "args": server.args or [],
        "env_vars": server.env_vars or {},
        "url": server.url,
        "created_at": server.created_at.isoformat() if server.created_at else "",
    }


def _server_to_config(server: MCPServer) -> dict:
    return {
        "name": server.name,
        "transport": server.transport,
        "command": server.command,
        "args": server.args or [],
        "env_vars": server.env_vars or {},
        "url": server.url,
    }
