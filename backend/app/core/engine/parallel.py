import asyncio
from typing import AsyncGenerator, List, Dict, Any, Optional
from app.core.engine.base import AgentConfig, ExecutionEvent
from app.core.llm import run_agent_turn
from app.core.prompt_utils import render_prompt


async def _collect_agent_output(
    agent: AgentConfig,
    input_text: str,
    history: Optional[List[Dict]] = None,
) -> tuple[AgentConfig, str, list[ExecutionEvent]]:
    internal_events: list[ExecutionEvent] = []
    tokens: list[str] = []

    resolved_prompt = render_prompt(
        agent.system_prompt,
        flow_input=input_text,
        previous_output="",
        agent_name=agent.name,
    )

    async for event in run_agent_turn(
        system_prompt=resolved_prompt,
        user_message=input_text,
        model=agent.model,
        temperature=agent.temperature,
        enabled_tools=agent.tools,
        agent_id=agent.id,
        agent_name=agent.name,
        history=history,
        mcp_configs=agent.mcp_servers or None,
    ):
        internal_events.append(event)
        if event.type == "token":
            tokens.append(event.content)

    return agent, "".join(tokens), internal_events


async def run_parallel(
    nodes: List[Dict[str, Any]],
    edges: List[Dict[str, Any]],
    agents_by_id: Dict[str, AgentConfig],
    initial_input: str,
    history: Optional[List[Dict]] = None,
) -> AsyncGenerator[ExecutionEvent, None]:
    """
    Scatter-gather: all agents receive the same input in parallel.
    All agents see the conversation history (they share the same context).
    """
    agent_nodes = [n for n in nodes if n.get("type") == "agentNode"]
    agents: List[AgentConfig] = []
    for node in agent_nodes:
        agent_id = node["data"].get("agentId")
        if agent_id and agent_id in agents_by_id:
            agents.append(agents_by_id[agent_id])

    if not agents:
        yield ExecutionEvent(type="error", content="No agent nodes found in flow")
        return

    yield ExecutionEvent(
        type="flow_start",
        content=f"Launching {len(agents)} agents in parallel",
    )

    for agent in agents:
        yield ExecutionEvent(
            type="agent_start", agent_id=agent.id, agent_name=agent.name, content=initial_input
        )

    tasks = [_collect_agent_output(agent, initial_input, history) for agent in agents]
    results = await asyncio.gather(*tasks)

    aggregated_parts = []
    for agent, output, internal_events in results:
        for ev in internal_events:
            yield ev
        yield ExecutionEvent(type="agent_end", agent_id=agent.id, agent_name=agent.name, content=output)
        aggregated_parts.append(f"[{agent.name}]:\n{output}")

    final_output = "\n\n---\n\n".join(aggregated_parts)
    yield ExecutionEvent(type="flow_end", content=final_output)
