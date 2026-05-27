import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from sqlalchemy import text, inspect as sa_inspect
from app.database import engine, Base
from app.models import agent, flow, flow_message, execution_run  # noqa: F401
from app.api import agents, flows, execution, memory, runs

load_dotenv(override=True)


def _run_migrations() -> None:
    """Add new columns to existing tables without Alembic."""
    inspector = sa_inspect(engine)
    table_names = inspector.get_table_names()

    if "agents" in table_names:
        existing_cols = {c["name"] for c in inspector.get_columns("agents")}
        with engine.connect() as conn:
            if "tools" not in existing_cols:
                conn.execute(text("ALTER TABLE agents ADD COLUMN tools TEXT DEFAULT '[]'"))
                conn.commit()


_run_migrations()
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
app.include_router(memory.router, prefix="/api")
app.include_router(runs.router, prefix="/api")


@app.get("/health")
async def health():
    providers = []
    if os.getenv("OPENAI_API_KEY"):
        providers.append("openai")
    if os.getenv("ANTHROPIC_API_KEY"):
        providers.append("anthropic")
    if os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"):
        providers.append("gemini")
    if os.getenv("GROQ_API_KEY"):
        providers.append("groq")
    # Ollama doesn't need a key — always listed as optional
    providers.append("ollama (local)")
    return {
        "status": "ok",
        "configured_providers": providers,
    }


@app.get("/api/providers")
async def list_providers():
    """Returns which LLM providers are currently configured via env vars."""
    return {
        "openai":    bool(os.getenv("OPENAI_API_KEY")),
        "anthropic": bool(os.getenv("ANTHROPIC_API_KEY")),
        "gemini":    bool(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")),
        "groq":      bool(os.getenv("GROQ_API_KEY")),
        "ollama":    True,  # local, no key needed
    }
