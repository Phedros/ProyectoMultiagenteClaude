"""
Runtime API-key management.

Keys are written to os.environ (in-memory only — they survive the process
lifetime but are lost on server restart).  Values are never echoed back to
the client; only a boolean "is set" indicator is returned.
"""
import os
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/settings", tags=["settings"])

_PROVIDER_ENV: dict[str, list[str]] = {
    "openai":    ["OPENAI_API_KEY"],
    "anthropic": ["ANTHROPIC_API_KEY"],
    "gemini":    ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    "groq":      ["GROQ_API_KEY"],
}


def _is_set(provider: str) -> bool:
    for var in _PROVIDER_ENV.get(provider, []):
        if os.getenv(var):
            return True
    return False


@router.get("/keys")
async def get_keys():
    """Return which providers currently have an API key configured."""
    return {p: _is_set(p) for p in _PROVIDER_ENV} | {"ollama": True}


class KeysPayload(BaseModel):
    openai:    Optional[str] = None
    anthropic: Optional[str] = None
    gemini:    Optional[str] = None
    groq:      Optional[str] = None


@router.post("/keys", status_code=204)
async def set_keys(payload: KeysPayload):
    """Set (or update) API keys in the server's environment at runtime."""
    mapping = {
        "openai":    "OPENAI_API_KEY",
        "anthropic": "ANTHROPIC_API_KEY",
        "gemini":    "GEMINI_API_KEY",
        "groq":      "GROQ_API_KEY",
    }
    data = payload.model_dump(exclude_none=True)
    for provider, env_var in mapping.items():
        value = data.get(provider, "").strip()
        if value:
            os.environ[env_var] = value
