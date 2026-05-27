import asyncio
from typing import AsyncGenerator, List, Dict, Any
from app.core.engine.base import AgentConfig, ExecutionEvent
from app.core.llm import run_agent_turn


async def _collect_agent_output(
    agent: AgentConfig, input_text: str
) -> tuple[AgentConfig, str, list[ExecutionEvent]]:
    """
    Run a single agent to completion, collecting all events.
    Returns (agent, final_text, internal_events).
    internal_events = token + tool_call + tool_result events (NOT agent_start/end).
    """
    internal_events: list[ExecutionEvent] = []
    tokens: list[str] = []

    async for event in run_agent_turn(
        system_prompt=agent.system_prompt,
        user_message=input_text,
        model=agent.model,
        temperature=agent.temperature,
        enabled_tools=agent.tools,
        agent_id=agent.id,
        agent_name=agent.name,
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
) -> AsyncGenerator[ExecutionEvent, None]:
    """
    Scatter-gather: fans out input to all agent nodes simultaneously,
    then aggregates all results into a final combined output.
    Each agent can optionally use tools.
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

    # Signal all agents are starting
    for agent in agents:
        yield ExecutionEvent(
            type="agent_start", agent_id=agent.id, agent_name=agent.name, content=initial_input
        )

    # Run all agents concurrently
    tasks = [_collect_agent_output(agent, initial_input) for agent in agents]
    results = await asyncio.gather(*tasks)

    aggregated_parts = []
    for agent, output, internal_events in results:
        # Replay internal events (tool calls, tokens, etc.)
        for ev in internal_events:
            yield ev
        yield ExecutionEvent(type="agent_end", agent_id=agent.id, agent_name=agent.name, content=output)
        aggregated_parts.append(f"[{agent.name}]:\n{output}")

    final_output = "\n\n---\n\n".join(aggregated_parts)
    yield ExecutionEvent(type="flow_end", content=final_output)
