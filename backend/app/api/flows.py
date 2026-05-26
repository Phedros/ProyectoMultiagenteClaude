from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.flow import Flow
from app.schemas.flow import FlowCreate, FlowUpdate, FlowResponse

router = APIRouter(prefix="/flows", tags=["flows"])


@router.get("/", response_model=List[FlowResponse])
def list_flows(db: Session = Depends(get_db)):
    return db.query(Flow).all()


@router.post("/", response_model=FlowResponse, status_code=201)
def create_flow(flow: FlowCreate, db: Session = Depends(get_db)):
    db_flow = Flow(**flow.model_dump())
    db.add(db_flow)
    db.commit()
    db.refresh(db_flow)
    return db_flow


@router.get("/{flow_id}", response_model=FlowResponse)
def get_flow(flow_id: str, db: Session = Depends(get_db)):
    flow = db.query(Flow).filter(Flow.id == flow_id).first()
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
    return flow


@router.put("/{flow_id}", response_model=FlowResponse)
def update_flow(flow_id: str, flow_update: FlowUpdate, db: Session = Depends(get_db)):
    flow = db.query(Flow).filter(Flow.id == flow_id).first()
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
    for field, value in flow_update.model_dump(exclude_none=True).items():
        setattr(flow, field, value)
    db.commit()
    db.refresh(flow)
    return flow


@router.delete("/{flow_id}", status_code=204)
def delete_flow(flow_id: str, db: Session = Depends(get_db)):
    flow = db.query(Flow).filter(Flow.id == flow_id).first()
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
    db.delete(flow)
    db.commit()
