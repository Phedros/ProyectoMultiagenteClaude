from typing import AsyncGenerator, List, Dict, Any
from app.core.engine.base import AgentConfig, ExecutionEvent, topological_sort
from app.core.llm import call_agent


async def run_pipeline(
    nodes: List[Dict[str, Any]],
    edges: List[Dict[str, Any]],
    agents_by_id: Dict[str, AgentConfig],
    initial_input: str,
) -> AsyncGenerator[ExecutionEvent, None]:
    """
    Executes a pipeline topology: output of agent N becomes input of agent N+1.
    Resolves execution order via topological sort of the DAG.
    """
    # Map React Flow node IDs to agent configs
    node_ids = [n["id"] for n in nodes if n.get("type") == "agentNode"]
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

    # Topological sort gives us the execution order
    try:
        ordered_node_ids = topological_sort(list(node_to_agent.keys()), edges)
    except ValueError as e:
        yield ExecutionEvent(type="error", content=str(e))
        return

    yield ExecutionEvent(type="flow_start", content=f"Starting pipeline with {len(ordered_node_ids)} agents")

    current_input = initial_input

    for node_id in ordered_node_ids:
        agent = node_to_agent[node_id]

        yield ExecutionEvent(
            type="agent_start",
            agent_id=agent.id,
            agent_name=agent.name,
            content=current_input,
        )

        accumulated_output = []
        async for token in call_agent(
            system_prompt=agent.system_prompt,
            user_message=current_input,
            model=agent.model,
            temperature=agent.temperature,
        ):
            accumulated_output.append(token)
            yield ExecutionEvent(
                type="token",
                agent_id=agent.id,
                agent_name=agent.name,
                content=token,
            )

        full_output = "".join(accumulated_output)
        yield ExecutionEvent(
            type="agent_end",
            agent_id=agent.id,
            agent_name=agent.name,
            content=full_output,
        )

        # Pass this agent's output as next agent's input
        current_input = full_output

    yield ExecutionEvent(type="flow_end", content=current_input)
