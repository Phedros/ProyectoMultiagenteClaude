"""
LLM interface: unified agent runner that handles plain LLM calls
and the full tool-calling loop (tool_calls → execute → continue).
"""
import json
from typing import AsyncGenerator
import os
from openai import AsyncOpenAI
from app.core.engine.base import ExecutionEvent
from app.core.tools import get_tool_schemas, execute_tool

_client: AsyncOpenAI | None = None


def get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY not set in environment")
        _client = AsyncOpenAI(api_key=api_key)
    return _client


async def run_agent_turn(
    system_prompt: str,
    user_message: str,
    model: str,
    temperature: float,
    enabled_tools: list[str],
    agent_id: str = "",
    agent_name: str = "",
) -> AsyncGenerator[ExecutionEvent, None]:
    """
    Run a complete agent turn with optional tool use.

    Yields ExecutionEvent objects:
      - type="token"       — a streamed text chunk from the model
      - type="tool_call"   — the model is invoking a tool (content = JSON with tool + args)
      - type="tool_result" — the tool returned a result (content = result string)

    The caller (engine) is responsible for emitting agent_start / agent_end events.
    """
    client = get_client()
    schemas = get_tool_schemas(enabled_tools)

    messages: list[dict] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]

    while True:
        # Build kwargs — only add tools if there are any enabled
        kwargs: dict = {}
        if schemas:
            kwargs["tools"] = schemas
            kwargs["tool_choice"] = "auto"

        stream = await client.chat.completions.create(
            model=model,
            temperature=temperature,
            messages=messages,
            stream=True,
            **kwargs,
        )

        content_acc: list[str] = []
        tool_calls_acc: dict[int, dict] = {}
        finish_reason: str | None = None

        async for chunk in stream:
            choice = chunk.choices[0]
            if choice.finish_reason:
                finish_reason = choice.finish_reason

            delta = choice.delta

            # Stream text tokens
            if delta.content:
                content_acc.append(delta.content)
                yield ExecutionEvent(
                    type="token",
                    agent_id=agent_id,
                    agent_name=agent_name,
                    content=delta.content,
                )

            # Accumulate tool call deltas
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

        # ── Handle finish reason ──────────────────────────────────────────
        if finish_reason == "tool_calls":
            # Build the assistant message with the tool_calls field
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

            # Execute each tool and append the result
            for tc in (tool_calls_acc[i] for i in sorted(tool_calls_acc)):
                tool_name = tc["name"]
                try:
                    args = json.loads(tc["arguments"]) if tc["arguments"] else {}
                except json.JSONDecodeError:
                    args = {}

                # Emit tool_call event
                yield ExecutionEvent(
                    type="tool_call",
                    agent_id=agent_id,
                    agent_name=agent_name,
                    content=json.dumps({"tool": tool_name, "args": args}),
                )

                # Run the tool
                result = await execute_tool(tool_name, args)

                # Emit tool_result event
                yield ExecutionEvent(
                    type="tool_result",
                    agent_id=agent_id,
                    agent_name=agent_name,
                    content=result,
                )

                # Append tool result to messages for next LLM call
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": result,
                })

            # Loop back — model will continue with the tool results
            continue

        else:
            # finish_reason == "stop" (or None / other) — we're done
            break


# ── Backwards-compat helper used by hierarchical engine directly ──────────
async def call_agent(
    system_prompt: str,
    user_message: str,
    model: str = "gpt-4o-mini",
    temperature: float = 0.7,
) -> AsyncGenerator[str, None]:
    """
    Simple streaming call without tool support.
    Kept for the hierarchical decomposition step which needs plain text output.
    """
    client = get_client()
    stream = await client.chat.completions.create(
        model=model,
        temperature=temperature,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        stream=True,
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta
