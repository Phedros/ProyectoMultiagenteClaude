"""
MCP (Model Context Protocol) client utilities.

Gracefully handles the case where the `mcp` package is not installed —
all functions return empty results instead of crashing.
"""
from __future__ import annotations
from contextlib import asynccontextmanager, AsyncExitStack
import re

try:
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client
    _MCP_OK = True
except ImportError:
    _MCP_OK = False


def mcp_available() -> bool:
    return _MCP_OK


def _safe_name(text: str) -> str:
    """Return a string safe for use as part of an OpenAI function name."""
    return re.sub(r"[^a-zA-Z0-9_]", "_", text)


# ---------------------------------------------------------------------------
# Session context manager
# ---------------------------------------------------------------------------

@asynccontextmanager
async def open_mcp_session(config: dict):
    """Open an MCP session and yield it. Raises on connection failure."""
    if not _MCP_OK:
        raise RuntimeError(
            "MCP package not installed. Run:  pip install mcp"
        )

    transport = config.get("transport", "stdio")

    async with AsyncExitStack() as stack:
        if transport == "stdio":
            params = StdioServerParameters(
                command=config["command"],
                args=config.get("args") or [],
                env=config.get("env_vars") or None,
            )
            read, write = await stack.enter_async_context(stdio_client(params))
        elif transport == "sse":
            from mcp.client.sse import sse_client  # lazy import
            url = config.get("url") or ""
            if not url:
                raise ValueError("SSE transport requires a URL")
            read, write = await stack.enter_async_context(sse_client(url))
        else:
            raise ValueError(f"Unknown MCP transport: {transport!r}")

        session = await stack.enter_async_context(ClientSession(read, write))
        await session.initialize()
        yield session


# ---------------------------------------------------------------------------
# Tool discovery
# ---------------------------------------------------------------------------

async def list_mcp_tools(config: dict) -> list[dict]:
    """
    Connect to an MCP server and return OpenAI-format tool schemas.
    The tool names are prefixed as  mcp__<server_safe_name>__<tool_name>
    so they can be routed back to the right server during execution.

    Returns [] on any failure (server not running, package not installed…).
    """
    if not _MCP_OK:
        return []

    prefix = f"mcp__{_safe_name(config.get('name', 'server')[:20])}"
    try:
        async with open_mcp_session(config) as session:
            resp  = await session.list_tools()
            return [
                {
                    "type": "function",
                    "function": {
                        "name":        f"{prefix}__{t.name}",
                        "description": t.description or "",
                        "parameters":  t.inputSchema or {"type": "object", "properties": {}},
                    },
                }
                for t in resp.tools
            ]
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Tool execution
# ---------------------------------------------------------------------------

async def call_mcp_tool(config: dict, tool_name: str, args: dict) -> str:
    """
    Execute *tool_name* on the MCP server described by *config*.
    *tool_name* should be the bare tool name (no mcp__ prefix).
    """
    if not _MCP_OK:
        return "MCP package not installed (pip install mcp)"

    try:
        async with open_mcp_session(config) as session:
            result = await session.call_tool(tool_name, arguments=args)
            if result.content:
                parts = []
                for item in result.content:
                    text = getattr(item, "text", None) or str(item)
                    parts.append(text)
                return "\n".join(parts)
            return "(no output)"
    except Exception as exc:
        return f"MCP tool error: {exc}"
