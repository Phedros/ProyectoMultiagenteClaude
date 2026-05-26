import uuid
from sqlalchemy import Column, String, Float, DateTime, Text
from sqlalchemy.sql import func
from app.database import Base


class Agent(Base):
    __tablename__ = "agents"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    system_prompt = Column(Text, nullable=False)
    model = Column(String, nullable=False, default="gpt-4o-mini")
    temperature = Column(Float, nullable=False, default=0.7)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
