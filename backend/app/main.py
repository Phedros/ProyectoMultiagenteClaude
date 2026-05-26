import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from app.database import engine, Base
from app.models import agent, flow  # noqa: F401 — registers models with Base
from app.api import agents, flows, execution

load_dotenv(override=True)

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Agent Orchestrator API",
    description="Visual multi-agent orchestration platform",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agents.router, prefix="/api")
app.include_router(flows.router, prefix="/api")
app.include_router(execution.router, prefix="/api")


@app.get("/health")
async def health():
    key = os.getenv("OPENAI_API_KEY", "")
    return {
        "status": "ok",
        "api_key_prefix": key[:12] + "..." if key else "NOT SET",
    }
