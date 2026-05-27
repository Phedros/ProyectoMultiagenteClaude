import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db, SessionLocal
from app.models.flow import Flow
from app.models.agent import Agent
from app.core.engine.base import AgentConfig
from app.core.engine.pipeline import run_pipeline
from app.core.engine.parallel import run_parallel
from app.core.engine.hierarchical import run_hierarchical

router = APIRouter(tags=["execution"])


def _build_agent_map(agent_ids: list[str], db: Session) -> dict[str, AgentConfig]:
    agents = db.query(Agent).filter(Agent.id.in_(agent_ids)).all()
    return {
        a.id: AgentConfig(
            id=a.id,
            name=a.name,
            system_prompt=a.system_prompt,
            model=a.model,
            temperature=a.temperature,
            tools=a.tools or [],
        )
        for a in agents
    }


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

        # Receive input from client
        data = await websocket.receive_text()
        payload = json.loads(data)
        input_text = payload.get("input_text", "")

        if not input_text.strip():
            await websocket.send_text(json.dumps({"type": "error", "content": "input_text is required"}))
            await websocket.close()
            return

        # Collect all agent IDs referenced in nodes
        agent_ids = [
            n["data"]["agentId"]
            for n in flow.nodes
            if n.get("type") == "agentNode" and n.get("data", {}).get("agentId")
        ]
        agents_by_id = _build_agent_map(agent_ids, db)

        # Select the right engine based on topology
        topology = flow.topology
        if topology == "pipeline":
            runner = run_pipeline(flow.nodes, flow.edges, agents_by_id, input_text)
        elif topology == "parallel":
            runner = run_parallel(flow.nodes, flow.edges, agents_by_id, input_text)
        elif topology == "hierarchical":
            runner = run_hierarchical(flow.nodes, flow.edges, agents_by_id, input_text)
        else:
            await websocket.send_text(json.dumps({"type": "error", "content": f"Unknown topology: {topology}"}))
            await websocket.close()
            return

        async for event in runner:
            await websocket.send_text(json.dumps(event.to_dict()))

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
