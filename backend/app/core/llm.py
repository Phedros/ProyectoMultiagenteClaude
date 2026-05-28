"""
LLM interface: unified agent runner using LiteLLM for multi-provider support.

Supported providers (configure via env vars):
  OpenAI    → OPENAI_API_KEY
  Anthropic → ANTHROPIC_API_KEY
  Gemini    → GEMINI_API_KEY
  Groq      → GROQ_API_KEY
  Ollama    → no key needed (must be running locally)
"""
import json
import litellm
from contextlib import AsyncExitStack
from typing import AsyncGenerator
from app.core.engine.base import ExecutionEvent
from app.core.tools import get_tool_schemas, execute_tool
from app.core.mcp_client import list_mcp_tools, call_mcp_tool, mcp_available

# Drop unsupported params (e.g. temperature on some models, tools on basic Ollama)
litellm.drop_params = True
# Suppress litellm's own logging noise
litellm.set_verbose = False

import logging
logging.getLogger("LiteLLM").setLevel(logging.ERROR)

# ---------------------------------------------------------------------------
# Pricing table (USD per 1M tokens)  prompt / completion
# ---------------------------------------------------------------------------
_PRICE: dict[str, tuple[float, float]] = {
    "gpt-4o":                         (2.50,  10.00),
    "gpt-4o-mini":                    (0.15,   0.60),
    "gpt-4-turbo":                    (10.00, 30.00),
    "gpt-3.5-turbo":                  (0.50,   1.50),
    "claude-3-5-sonnet-20241022":     (3.00,  15.00),
    "claude-3-5-haiku-20241022":      (0.80,   4.00),
    "claude-3-opus-20240229":         (15.00, 75.00),
    "claude-3-haiku-20240307":        (0.25,   1.25),
    "gemini/gemini-2.0-flash":        (0.075,  0.30),
    "gemini/gemini-1.5-pro":          (3.50,  10.50),
    "gemini/gemini-1.5-flash":        (0.075,  0.30),
    "groq/llama-3.1-70b-versatile":   (0.59,   0.79),
    "groq/llama-3.1-8b-instant":      (0.05,   0.08),
    "groq/mixtral-8x7b-32768":        (0.27,   0.27),
    "groq/gemma2-9b-it":              (0.20,   0.20),
    # Ollama / local — free
}


def _estimate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Return estimated cost in USD (0.0 for unknown/local models)."""
    prices = _PRICE.get(model, (0.0, 0.0))
    return round((prompt_tokens * prices[0] + completion_tokens * prices[1]) / 1_000_000, 8)


async def run_agent_turn(
    system_prompt: str,
    user_message: str,
    model: str,
    temperature: float,
    enabled_tools: list[str],
    agent_id: str = "",
    agent_name: str = "",
    history: list[dict] | None = None,
    mcp_configs: list[dict] | None = None,
) -> AsyncGenerator[ExecutionEvent, None]:
    """
    Run a complete agent turn with optional tool use and conversation history.
    Works with any LiteLLM-supported provider.

    history: list of {"role": "user"|"assistant", "content": str} messages
             from previous flow executions. Injected between system prompt
             and the current user message.

    mcp_configs: list of MCP server config dicts. Tools from these servers are
                 discovered at the start of the turn and injected alongside
                 the agent's normal tools.

    Yields ExecutionEvent objects:
      - type="token"       — a streamed text chunk from the model
      - type="tool_call"   — the model is invoking a tool
      - type="tool_result" — the tool result
    """
    schemas = get_tool_schemas(enabled_tools)

    # Discover MCP tools (if any servers configured)
    # Build a lookup: prefixed_tool_name → server config for routing
    mcp_tool_map: dict[str, dict] = {}  # "mcp__server__tool" → config dict
    if mcp_configs and mcp_available():
        for cfg in mcp_configs:
            mcp_schemas = await list_mcp_tools(cfg)
            for schema in mcp_schemas:
                fname = schema["function"]["name"]
                mcp_tool_map[fname] = cfg
            schemas.extend(mcp_schemas)

    messages: list[dict] = [{"role": "system", "content": system_prompt}]

    # Inject conversation history so the agent has context of past runs
    if history:
        messages.extend(history)

    messages.append({"role": "user", "content": user_message})

    # Accumulate usage across all iterations (including tool-call loops)
    total_prompt_tokens: int = 0
    total_completion_tokens: int = 0

    while True:
        kwargs: dict = {}
        if schemas:
            kwargs["tools"] = schemas
            kwargs["tool_choice"] = "auto"

        stream = await litellm.acompletion(
            model=model,
            temperature=temperature,
            messages=messages,
            stream=True,
            stream_options={"include_usage": True},
            **kwargs,
        )

        content_acc: list[str] = []
        tool_calls_acc: dict[int, dict] = {}
        finish_reason: str | None = None

        async for chunk in stream:
            # Collect usage from the last chunk (when stream_options supported)
            if hasattr(chunk, "usage") and chunk.usage:
                total_prompt_tokens    += getattr(chunk.usage, "prompt_tokens", 0) or 0
                total_completion_tokens += getattr(chunk.usage, "completion_tokens", 0) or 0

            if not chunk.choices:
                continue
            choice = chunk.choices[0]
            if choice.finish_reason:
                finish_reason = choice.finish_reason

            delta = choice.delta

            if delta.content:
                content_acc.append(delta.content)
                yield ExecutionEvent(
                    type="token",
                    agent_id=agent_id,
                    agent_name=agent_name,
                    content=delta.content,
                )

            if delta.tool_calls:
                for tc_delta in delta.tool_calls:
                    idx = tc_delta.index
                    if idx not in tool_calls_acc:
                        tool_calls_acc[idx] = {"id": "", "name": "", "arguments": ""}
                    if tc_delta.id:
                        tool_calls_acc[idx]["id"] = tc_delta.id
                    if tc_delta.function:
                        if tc_delta.function.name:
                            tool_calls_acc[idx]["name"] += tc_delta.function.name
                        if tc_delta.function.arguments:
                            tool_calls_acc[idx]["arguments"] += tc_delta.function.arguments

        if finish_reason == "tool_calls":
            tool_calls_list = [
                {
                    "id": tc["id"],
                    "type": "function",
                    "function": {"name": tc["name"], "arguments": tc["arguments"]},
                }
                for tc in (tool_calls_acc[i] for i in sorted(tool_calls_acc))
            ]
            messages.append({
                "role": "assistant",
                "content": "".join(content_acc) or None,
                "tool_calls": tool_calls_list,
            })

            for tc in (tool_calls_acc[i] for i in sorted(tool_calls_acc)):
                tool_name = tc["name"]
                try:
                    args = json.loads(tc["arguments"]) if tc["arguments"] else {}
                except json.JSONDecodeError:
                    args = {}

                yield ExecutionEvent(
                    type="tool_call",
                    agent_id=agent_id,
                    agent_name=agent_name,
                    content=json.dumps({"tool": tool_name, "args": args}),
                )

                # Route to MCP server if the tool name has the mcp__ prefix
                if tool_name in mcp_tool_map:
                    # Strip the mcp__<server>__ prefix to get the bare tool name
                    bare_name = "__".join(tool_name.split("__")[2:])
                    result = await call_mcp_tool(mcp_tool_map[tool_name], bare_name, args)
                else:
                    result = await execute_tool(tool_name, args)

                yield ExecutionEvent(
                    type="tool_result",
                    agent_id=agent_id,
                    agent_name=agent_name,
                    content=result,
                )

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": result,
                })

            continue
        else:
            break

    # Emit a usage summary event so consumers can aggregate cost
    estimated_cost = _estimate_cost(model, total_prompt_tokens, total_completion_tokens)
    yield ExecutionEvent(
        type="usage",
        agent_id=agent_id,
        agent_name=agent_name,
        content=json.dumps({
            "prompt_tokens":     total_prompt_tokens,
            "completion_tokens": total_completion_tokens,
            "total_tokens":      total_prompt_tokens + total_completion_tokens,
            "estimated_cost_usd": estimated_cost,
            "model": model,
        }),
    )


async def call_agent_non_streaming(
    system_prompt: str,
    user_message: str,
    model: str,
    temperature: float = 0.3,
    history: list[dict] | None = None,
) -> str:
    """
    Non-streaming single call — used for structured outputs
    (e.g. hierarchical supervisor decomposition step).
    """
    messages: list[dict] = [{"role": "system", "content": system_prompt}]
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": user_message})

    response = await litellm.acompletion(
        model=model,
        temperature=temperature,
        messages=messages,
        stream=False,
    )
    return response.choices[0].message.content or ""
