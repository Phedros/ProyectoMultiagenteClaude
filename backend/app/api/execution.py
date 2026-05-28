import json
import time
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.flow import Flow
from app.models.agent import Agent
from app.models.flow_message import FlowMessage
from app.models.execution_run import ExecutionRun
from app.models.mcp_server import MCPServer
from app.core.engine.base import AgentConfig
from app.core.engine.pipeline import run_pipeline
from app.core.engine.parallel import run_parallel
from app.core.engine.hierarchical import run_hierarchical

router = APIRouter(tags=["execution"])

HISTORY_WINDOW = 10  # conversation turns to include as context


def _build_agent_map(agent_ids: list[str], db: Session) -> dict[str, AgentConfig]:
    agents = db.query(Agent).filter(Agent.id.in_(agent_ids)).all()

    # Collect all MCP server ids referenced by any agent in this flow
    all_mcp_ids: set[str] = set()
    for a in agents:
        for sid in (a.mcp_servers or []):
            all_mcp_ids.add(sid)

    # Bulk-load MCP server configs once
    mcp_configs_by_id: dict[str, dict] = {}
    if all_mcp_ids:
        servers = db.query(MCPServer).filter(MCPServer.id.in_(list(all_mcp_ids))).all()
        for s in servers:
            mcp_configs_by_id[s.id] = {
                "name": s.name,
                "transport": s.transport,
                "command": s.command,
                "args": s.args or [],
                "env_vars": s.env_vars or {},
                "url": s.url,
            }

    return {
        a.id: AgentConfig(
            id=a.id,
            name=a.name,
            system_prompt=a.system_prompt,
            model=a.model,
            temperature=a.temperature,
            tools=a.tools or [],
            mcp_servers=[
                mcp_configs_by_id[sid]
                for sid in (a.mcp_servers or [])
                if sid in mcp_configs_by_id
            ],
        )
        for a in agents
    }


def _load_history(flow_id: str, db: Session) -> list[dict]:
    messages = (
        db.query(FlowMessage)
        .filter(FlowMessage.flow_id == flow_id)
        .order_by(FlowMessage.created_at.asc())
        .all()
    )
    recent = messages[-(HISTORY_WINDOW * 2):]
    return [{"role": m.role, "content": m.content} for m in recent]


def _save_to_memory(flow_id: str, user_input: str, assistant_output: str, db: Session) -> None:
    db.add(FlowMessage(flow_id=flow_id, role="user", content=user_input))
    db.add(FlowMessage(flow_id=flow_id, role="assistant", content=assistant_output))
    db.commit()


def _save_run(
    flow: Flow,
    input_text: str,
    output_text: str,
    status: str,
    duration_ms: int,
    agent_count: int,
    error_message: str | None,
    db: Session,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    estimated_cost_usd: float = 0.0,
) -> None:
    db.add(ExecutionRun(
        flow_id=flow.id,
        flow_name=flow.name,
        topology=flow.topology,
        input_text=input_text,
        output_text=output_text,
        status=status,
        error_message=error_message,
        duration_ms=duration_ms,
        agent_count=agent_count,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        estimated_cost_usd=estimated_cost_usd,
    ))
    db.commit()


@router.websocket("/ws/flows/{flow_id}/execute")
async def execute_flow(websocket: WebSocket, flow_id: str):
    await websocket.accept()
    db = SessionLocal()

    try:
        flow = db.query(Flow).filter(Flow.id == flow_id).first()
        if not flow:
            await websocket.send_text(json.dumps({"type": "error", "content": "Flow not found"}))
            await websocket.close()
            return

        data = await websocket.receive_text()
        payload = json.loads(data)
        input_text = payload.get("input_text", "")

        if not input_text.strip():
            await websocket.send_text(json.dumps({"type": "error", "content": "input_text is required"}))
            await websocket.close()
            return

        history = _load_history(flow_id, db)

        agent_ids = [
            n["data"]["agentId"]
            for n in flow.nodes
            if n.get("type") == "agentNode" and n.get("data", {}).get("agentId")
        ]
        agents_by_id = _build_agent_map(agent_ids, db)

        topology = flow.topology
        if topology == "pipeline":
            runner = run_pipeline(flow.nodes, flow.edges, agents_by_id, input_text, history=history)
        elif topology == "parallel":
            runner = run_parallel(flow.nodes, flow.edges, agents_by_id, input_text, history=history)
        elif topology == "hierarchical":
            runner = run_hierarchical(flow.nodes, flow.edges, agents_by_id, input_text, history=history)
        else:
            await websocket.send_text(json.dumps({"type": "error", "content": f"Unknown topology: {topology}"}))
            await websocket.close()
            return

        start_ms = time.monotonic()
        final_output = ""
        error_msg = None
        status = "completed"
        total_prompt_tokens = 0
        total_completion_tokens = 0
        total_cost_usd = 0.0

        async for event in runner:
            await websocket.send_text(json.dumps(event.to_dict()))
            if event.type == "flow_end":
                final_output = event.content
            elif event.type == "error":
                error_msg = event.content
                status = "error"
            elif event.type == "usage":
                try:
                    usage = json.loads(event.content)
                    total_prompt_tokens     += usage.get("prompt_tokens", 0)
                    total_completion_tokens += usage.get("completion_tokens", 0)
                    total_cost_usd          += usage.get("estimated_cost_usd", 0.0)
                except Exception:
                    pass

        duration_ms = int((time.monotonic() - start_ms) * 1000)

        # Persist run to history
        _save_run(
            flow=flow,
            input_text=input_text,
            output_text=final_output,
            status=status,
            duration_ms=duration_ms,
            agent_count=len(agent_ids),
            error_message=error_msg,
            db=db,
            prompt_tokens=total_prompt_tokens,
            completion_tokens=total_completion_tokens,
            estimated_cost_usd=round(total_cost_usd, 8),
        )

        # Persist exchange to conversation memory
        if final_output:
            _save_to_memory(flow_id, input_text, final_output, db)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_text(json.dumps({"type": "error", "content": str(e)}))
        except Exception:
            pass
    finally:
        db.close()
        try:
            await websocket.close()
        except Exception:
            pass
