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
from typing import AsyncGenerator
from app.core.engine.base import ExecutionEvent
from app.core.tools import get_tool_schemas, execute_tool

# Drop unsupported params (e.g. temperature on some models, tools on basic Ollama)
litellm.drop_params = True
# Suppress litellm's own logging noise
litellm.set_verbose = False

import logging
logging.getLogger("LiteLLM").setLevel(logging.ERROR)


async def run_agent_turn(
    system_prompt: str,
    user_message: str,
    model: str,
    temperature: float,
    enabled_tools: list[str],
    agent_id: str = "",
    agent_name: str = "",
    history: list[dict] | None = None,
) -> AsyncGenerator[ExecutionEvent, None]:
    """
    Run a complete agent turn with optional tool use and conversation history.
    Works with any LiteLLM-supported provider.

    history: list of {"role": "user"|"assistant", "content": str} messages
             from previous flow executions. Injected between system prompt
             and the current user message.

    Yields ExecutionEvent objects:
      - type="token"       — a streamed text chunk from the model
      - type="tool_call"   — the model is invoking a tool
      - type="tool_result" — the tool result
    """
    schemas = get_tool_schemas(enabled_tools)

    messages: list[dict] = [{"role": "system", "content": system_prompt}]

    # Inject conversation history so the agent has context of past runs
    if history:
        messages.extend(history)

    messages.append({"role": "user", "content": user_message})

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
            **kwargs,
        )

        content_acc: list[str] = []
        tool_calls_acc: dict[int, dict] = {}
        finish_reason: str | None = None

        async for chunk in stream:
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
