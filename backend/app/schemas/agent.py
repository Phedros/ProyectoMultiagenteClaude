from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class AgentBase(BaseModel):
    name: str
    system_prompt: str
    model: str = "gpt-4o-mini"
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    tools: List[str] = Field(default_factory=list)
    mcp_servers: List[str] = Field(default_factory=list)  # list of MCPServer ids


class AgentCreate(AgentBase):
    pass


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    system_prompt: Optional[str] = None
    model: Optional[str] = None
    temperature: Optional[float] = Field(default=None, ge=0.0, le=2.0)
    tools: Optional[List[str]] = None
    mcp_servers: Optional[List[str]] = None


class AgentResponse(AgentBase):
    id: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
