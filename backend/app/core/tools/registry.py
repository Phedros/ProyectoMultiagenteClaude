"""
Tool registry: defines available tools, their OpenAI function schemas,
and their async executor functions.
"""
import json
import asyncio
import subprocess
from datetime import datetime
from typing import Any


# ---------------------------------------------------------------------------
# Executors
# ---------------------------------------------------------------------------

async def execute_web_search(query: str) -> str:
    """DuckDuckGo search — no API key required."""
    def _sync_search():
        from duckduckgo_search import DDGS
        with DDGS() as ddgs:
            return list(ddgs.text(query, max_results=5))

    try:
        results = await asyncio.to_thread(_sync_search)
        if not results:
            return "No results found."
        parts = []
        for i, r in enumerate(results, 1):
            title = r.get("title", "No title")
            href = r.get("href", "")
            body = r.get("body", "")[:300]
            parts.append(f"{i}. {title}\n   {href}\n   {body}")
        return "\n\n".join(parts)
    except Exception as e:
        return f"Search error: {str(e)}"


async def execute_http_get(url: str) -> str:
    """Fetch the content of a URL (truncated to 3000 chars)."""
    try:
        import httpx
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            response = await client.get(
                url, headers={"User-Agent": "Mozilla/5.0 (compatible; AgentBot/1.0)"}
            )
            text = response.text[:3000]
            return f"HTTP {response.status_code}\n\n{text}"
    except Exception as e:
        return f"HTTP error: {str(e)}"


async def execute_python(code: str) -> str:
    """Execute Python code in a subprocess with a 10-second timeout."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "python", "-c", code,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10.0)
        except asyncio.TimeoutError:
            proc.kill()
            return "Error: execution timed out (10 s limit)"

        out = stdout.decode("utf-8", errors="replace").strip()
        err = stderr.decode("utf-8", errors="replace").strip()
        if out and err:
            return f"{out}\n\nSTDERR:\n{err}"
        return out or err or "(no output)"
    except Exception as e:
        return f"Execution error: {str(e)}"


async def execute_get_datetime() -> str:
    """Return the current date and time."""
    now = datetime.now()
    return (
        f"Date: {now.strftime('%Y-%m-%d')}\n"
        f"Time: {now.strftime('%H:%M:%S')}\n"
        f"Day:  {now.strftime('%A')}"
    )


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

AVAILABLE_TOOLS: dict[str, dict[str, Any]] = {
    "web_search": {
        "label": "Web Search",
        "description": "Search the web with DuckDuckGo",
        "executor": execute_web_search,
        "schema": {
            "type": "function",
            "function": {
                "name": "web_search",
                "description": (
                    "Search the web for up-to-date information, facts, news, "
                    "or any topic. Returns a list of results with titles, URLs, and snippets."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "The search query",
                        }
                    },
                    "required": ["query"],
                },
            },
        },
    },
    "http_get": {
        "label": "HTTP GET",
        "description": "Fetch the content of any URL",
        "executor": execute_http_get,
        "schema": {
            "type": "function",
            "function": {
                "name": "http_get",
                "description": "Fetch the raw content of a URL (HTML, JSON, plain text). Useful for reading web pages or APIs.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "url": {
                            "type": "string",
                            "description": "The full URL to fetch (including https://)",
                        }
                    },
                    "required": ["url"],
                },
            },
        },
    },
    "python_exec": {
        "label": "Python",
        "description": "Execute Python code",
        "executor": execute_python,
        "schema": {
            "type": "function",
            "function": {
                "name": "python_exec",
                "description": (
                    "Execute Python 3 code and return stdout/stderr. "
                    "Useful for calculations, data processing, or generating structured output. "
                    "10-second timeout. No persistent state between calls."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "code": {
                            "type": "string",
                            "description": "The Python code to execute",
                        }
                    },
                    "required": ["code"],
                },
            },
        },
    },
    "get_datetime": {
        "label": "Date/Time",
        "description": "Get the current date and time",
        "executor": execute_get_datetime,
        "schema": {
            "type": "function",
            "function": {
                "name": "get_datetime",
                "description": "Get the current local date and time. Call this whenever you need to know today's date or current time.",
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
            },
        },
    },
}


def get_tool_schemas(enabled_tools: list[str]) -> list[dict]:
    """Return OpenAI-compatible tool schemas for the given tool names."""
    return [
        AVAILABLE_TOOLS[name]["schema"]
        for name in enabled_tools
        if name in AVAILABLE_TOOLS
    ]


async def execute_tool(tool_name: str, args: dict) -> str:
    """Execute a tool by name with the given arguments. Always returns a string."""
    tool = AVAILABLE_TOOLS.get(tool_name)
    if not tool:
        return f"Unknown tool: '{tool_name}'"
    try:
        result = await tool["executor"](**args)
        return str(result)
    except TypeError as e:
        return f"Invalid arguments for {tool_name}: {str(e)}"
    except Exception as e:
        return f"Tool error ({tool_name}): {str(e)}"
