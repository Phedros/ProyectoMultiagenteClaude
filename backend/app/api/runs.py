from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from app.database import get_db
from app.models.flow import Flow
from app.models.execution_run import ExecutionRun

router = APIRouter(tags=["runs"])


class RunSummary(BaseModel):
    id: str
    flow_id: str
    flow_name: str
    topology: str
    input_text: str
    output_text: str
    status: str
    error_message: Optional[str]
    duration_ms: int
    agent_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("/flows/{flow_id}/runs", response_model=List[RunSummary])
def list_runs(flow_id: str, limit: int = 50, db: Session = Depends(get_db)):
    flow = db.query(Flow).filter(Flow.id == flow_id).first()
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")

    runs = (
        db.query(ExecutionRun)
        .filter(ExecutionRun.flow_id == flow_id)
        .order_by(ExecutionRun.created_at.desc())
        .limit(limit)
        .all()
    )
    return runs


@router.delete("/runs/{run_id}", status_code=204)
def delete_run(run_id: str, db: Session = Depends(get_db)):
    run = db.query(ExecutionRun).filter(ExecutionRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    db.delete(run)
    db.commit()
