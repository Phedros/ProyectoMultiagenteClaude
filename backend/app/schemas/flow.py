from pydantic import BaseModel
from typing import Optional, List, Any, Dict
from datetime import datetime


class FlowNode(BaseModel):
    id: str
    type: str
    position: Dict[str, float]
    data: Dict[str, Any]


class FlowEdge(BaseModel):
    id: str
    source: str
    target: str
    sourceHandle: Optional[str] = None
    targetHandle: Optional[str] = None


class FlowBase(BaseModel):
    name: str
    description: str = ""
    topology: str = "pipeline"
    nodes: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []


class FlowCreate(FlowBase):
    pass


class FlowUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    topology: Optional[str] = None
    nodes: Optional[List[Dict[str, Any]]] = None
    edges: Optional[List[Dict[str, Any]]] = None


class FlowResponse(FlowBase):
    id: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ExecutionRequest(BaseModel):
    input_text: str
