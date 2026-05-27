from typing import AsyncGenerator, List, Dict, Any, Optional
from app.core.engine.base import AgentConfig, ExecutionEvent, topological_sort
from app.core.llm import run_agent_turn


async def run_pipeline(
    nodes: List[Dict[str, Any]],
    edges: List[Dict[str, Any]],
    agents_by_id: Dict[str, AgentConfig],
    initial_input: str,
    history: Optional[List[Dict]] = None,
) -> AsyncGenerator[ExecutionEvent, None]:
    """
    Pipeline: output of agent N becomes input of agent N+1.
    The FIRST agent receives the conversation history for context.
    Subsequent agents process the chain output normally.
    """
    node_to_agent: Dict[str, AgentConfig] = {}
    for node in nodes:
        if node.get("type") != "agentNode":
            continue
        agent_id = node["data"].get("agentId")
        if agent_id and agent_id in agents_by_id:
            node_to_agent[node["id"]] = agents_by_id[agent_id]

    if not node_to_agent:
        yield ExecutionEvent(type="error", content="No agent nodes found in flow")
        return

    try:
        ordered_node_ids = topological_sort(list(node_to_agent.keys()), edges)
    except ValueError as e:
        yield ExecutionEvent(type="error", content=str(e))
        return

    yield ExecutionEvent(type="flow_start", content=f"Starting pipeline with {len(ordered_node_ids)} agents")

    current_input = initial_input
    is_first = True

    for node_id in ordered_node_ids:
        agent = node_to_agent[node_id]

        yield ExecutionEvent(
            type="agent_start",
            agent_id=agent.id,
            agent_name=agent.name,
            content=current_input,
        )

        accumulated_tokens: list[str] = []

        async for event in run_agent_turn(
            system_prompt=agent.system_prompt,
            user_message=current_input,
            model=agent.model,
            temperature=agent.temperature,
            enabled_tools=agent.tools,
            agent_id=agent.id,
            agent_name=agent.name,
            history=history if is_first else None,  # only first agent sees conversation history
        ):
            if event.type == "token":
                accumulated_tokens.append(event.content)
            yield event

        full_output = "".join(accumulated_tokens)
        yield ExecutionEvent(
            type="agent_end",
            agent_id=agent.id,
            agent_name=agent.name,
            content=full_output,
        )

        current_input = full_output
        is_first = False

    yield ExecutionEvent(type="flow_end", content=current_input)
