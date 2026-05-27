import uuid
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Index
from sqlalchemy.sql import func
from app.database import Base


class FlowMessage(Base):
    __tablename__ = "flow_messages"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    flow_id = Column(String, ForeignKey("flows.id", ondelete="CASCADE"), nullable=False)
    role = Column(String, nullable=False)   # "user" | "assistant"
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_flow_messages_flow_id", "flow_id"),
    )
