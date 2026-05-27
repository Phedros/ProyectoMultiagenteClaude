from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
from datetime import datetime
from app.database import get_db
from app.models.flow import Flow
from app.models.flow_message import FlowMessage

router = APIRouter(prefix="/flows", tags=["memory"])

MEMORY_WINDOW = 20  # max messages (= 10 conversation turns) returned to client


class MemoryMessage(BaseModel):
    id: str
    role: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("/{flow_id}/memory", response_model=List[MemoryMessage])
def get_memory(flow_id: str, db: Session = Depends(get_db)):
    flow = db.query(Flow).filter(Flow.id == flow_id).first()
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")

    messages = (
        db.query(FlowMessage)
        .filter(FlowMessage.flow_id == flow_id)
        .order_by(FlowMessage.created_at.asc())
        .all()
    )
    # Return at most MEMORY_WINDOW messages (most recent)
    return messages[-MEMORY_WINDOW:]


@router.delete("/{flow_id}/memory", status_code=204)
def clear_memory(flow_id: str, db: Session = Depends(get_db)):
    flow = db.query(Flow).filter(Flow.id == flow_id).first()
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")

    db.query(FlowMessage).filter(FlowMessage.flow_id == flow_id).delete()
    db.commit()
