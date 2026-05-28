import uuid
from sqlalchemy import Column, String, Text, JSON, DateTime
from sqlalchemy.sql import func
from app.database import Base


class MCPServer(Base):
    __tablename__ = "mcp_servers"

    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name        = Column(String, nullable=False, unique=True)
    transport   = Column(String, nullable=False, default="stdio")   # "stdio" | "sse"
    # stdio fields
    command     = Column(String, nullable=True)
    args        = Column(JSON,   nullable=False, default=list)
    env_vars    = Column(JSON,   nullable=False, default=dict)
    # sse field
    url         = Column(Text,   nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
