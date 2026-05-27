import uuid
from sqlalchemy import Column, String, Text, Integer, DateTime, ForeignKey, Index
from sqlalchemy.sql import func
from app.database import Base


class ExecutionRun(Base):
    __tablename__ = "execution_runs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    flow_id = Column(String, ForeignKey("flows.id", ondelete="CASCADE"), nullable=False)
    flow_name = Column(String, nullable=False, default="")
    topology = Column(String, nullable=False, default="pipeline")
    input_text = Column(Text, nullable=False)
    output_text = Column(Text, nullable=False, default="")
    status = Column(String, nullable=False, default="completed")   # completed | error | stopped
    error_message = Column(Text, nullable=True)
    duration_ms = Column(Integer, nullable=False, default=0)
    agent_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_execution_runs_flow_id", "flow_id"),
    )
