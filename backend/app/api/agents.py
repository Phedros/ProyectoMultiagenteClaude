import json
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db, SessionLocal
from app.models.agent import Agent
from app.models.mcp_server import MCPServer
from app.schemas.agent import AgentCreate, AgentUpdate, AgentResponse
from app.core.engine.base import AgentConfig
from app.core.llm import run_agent_turn

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("/", response_model=List[AgentResponse])
def list_agents(db: Session = Depends(get_db)):
    return db.query(Agent).all()


@router.post("/", response_model=AgentResponse, status_code=201)
def create_agent(agent: AgentCreate, db: Session = Depends(get_db)):
    db_agent = Agent(**agent.model_dump())
    db.add(db_agent)
    db.commit()
    db.refresh(db_agent)
    return db_agent


@router.get("/{agent_id}", response_model=AgentResponse)
def get_agent(agent_id: str, db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.put("/{agent_id}", response_model=AgentResponse)
def update_agent(agent_id: str, agent_update: AgentUpdate, db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    for field, value in agent_update.model_dump(exclude_none=True).items():
        setattr(agent, field, value)
    db.commit()
    db.refresh(agent)
    return agent


@router.delete("/{agent_id}", status_code=204)
def delete_agent(agent_id: str, db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    db.delete(agent)
    db.commit()


# ---------------------------------------------------------------------------
# WebSocket: test a single agent with a free-text prompt
# ---------------------------------------------------------------------------

@router.websocket("/{agent_id}/test")
async def test_agent(websocket: WebSocket, agent_id: str):
    """
    Stream a single agent turn over WebSocket for quick in-panel testing.

    Client sends: { "prompt": "hello" }
    Server streams ExecutionEvent JSON until flow_end or error.
    """
    await websocket.accept()
    db = SessionLocal()

    try:
        agent = db.query(Agent).filter(Agent.id == agent_id).first()
        if not agent:
            await websocket.send_text(json.dumps({"type": "error", "content": "Agent not found"}))
            return

        data = await websocket.receive_text()
        payload = json.loads(data)
        prompt = payload.get("prompt", "").strip()
        if not prompt:
            await websocket.send_text(json.dumps({"type": "error", "content": "prompt is required"}))
            return

        # Resolve MCP configs
        mcp_configs: list[dict] = []
        if agent.mcp_servers:
            servers = db.query(MCPServer).filter(MCPServer.id.in_(agent.mcp_servers)).all()
            mcp_configs = [
                {"name": s.name, "transport": s.transport, "command": s.command,
                 "args": s.args or [], "env_vars": s.env_vars or {}, "url": s.url}
                for s in servers
            ]

        accumulated: list[str] = []
        async for event in run_agent_turn(
            system_prompt=agent.system_prompt,
            user_message=prompt,
            model=agent.model,
            temperature=agent.temperature,
            enabled_tools=agent.tools or [],
            agent_id=agent.id,
            agent_name=agent.name,
            mcp_configs=mcp_configs or None,
        ):
            await websocket.send_text(json.dumps(event.to_dict()))
            if event.type == "token":
                accumulated.append(event.content)

        # Send a synthetic flow_end with the full output
        await websocket.send_text(json.dumps({
            "type": "flow_end",
            "agentId": agent.id,
            "agentName": agent.name,
            "content": "".join(accumulated),
        }))

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        try:
            await websocket.send_text(json.dumps({"type": "error", "content": str(exc)}))
        except Exception:
            pass
    finally:
        db.close()
        try:
            await websocket.close()
        except Exception:
            pass
