import asyncio
import json
from typing import AsyncGenerator, List, Dict, Any
from app.core.engine.base import AgentConfig, ExecutionEvent
from app.core.llm import call_agent, get_client


async def _collect_output(agent: AgentConfig, input_text: str) -> tuple[AgentConfig, str]:
    tokens = []
    async for token in call_agent(
        system_prompt=agent.system_prompt,
        user_message=input_text,
        model=agent.model,
        temperature=agent.temperature,
    ):
        tokens.append(token)
    return agent, "".join(tokens)


async def run_hierarchical(
    nodes: List[Dict[str, Any]],
    edges: List[Dict[str, Any]],
    agents_by_id: Dict[str, AgentConfig],
    initial_input: str,
) -> AsyncGenerator[ExecutionEvent, None]:
    """
    Hierarchical execution: first node (supervisor) decomposes the task into
    sub-tasks, delegates each sub-task to a worker agent, then consolidates.
    Requires at least 2 agent nodes: 1 supervisor + N workers.
    """
    agent_nodes = [n for n in nodes if n.get("type") == "agentNode"]
    if len(agent_nodes) < 2:
        yield ExecutionEvent(type="error", content="Hierarchical topology requires at least 2 agent nodes")
        return

    # First node in the list is the supervisor
    supervisor_node = agent_nodes[0]
    worker_nodes = agent_nodes[1:]

    supervisor_id = supervisor_node["data"].get("agentId")
    supervisor = agents_by_id.get(supervisor_id)
    if not supervisor:
        yield ExecutionEvent(type="error", content="Supervisor agent not found")
        return

    workers: List[AgentConfig] = []
    for node in worker_nodes:
        agent_id = node["data"].get("agentId")
        if agent_id and agent_id in agents_by_id:
            workers.append(agents_by_id[agent_id])

    yield ExecutionEvent(type="flow_start", content=f"Supervisor: {supervisor.name} | Workers: {len(workers)}")

    # Step 1: Supervisor decomposes the task
    worker_names = [w.name for w in workers]
    decomposition_prompt = (
        f"You are a supervisor. Break the following task into exactly {len(workers)} sub-tasks, "
        f"one for each worker: {', '.join(worker_names)}. "
        f"Respond ONLY with a JSON array of strings, one per worker, in that exact order.\n\n"
        f"Task: {initial_input}"
    )

    yield ExecutionEvent(type="agent_start", agent_id=supervisor.id, agent_name=supervisor.name, content=initial_input)

    client = get_client()
    decomposition_response = await client.chat.completions.create(
        model=supervisor.model,
        temperature=0.3,
        messages=[
            {"role": "system", "content": supervisor.system_prompt},
            {"role": "user", "content": decomposition_prompt},
        ],
    )
    raw_decomposition = decomposition_response.choices[0].message.content or "[]"

    yield ExecutionEvent(type="agent_end", agent_id=supervisor.id, agent_name=supervisor.name, content=raw_decomposition)

    try:
        sub_tasks = json.loads(raw_decomposition)
        if not isinstance(sub_tasks, list):
            sub_tasks = [initial_input] * len(workers)
    except json.JSONDecodeError:
        sub_tasks = [initial_input] * len(workers)

    # Pad or trim to match worker count
    while len(sub_tasks) < len(workers):
        sub_tasks.append(initial_input)
    sub_tasks = sub_tasks[: len(workers)]

    # Step 2: Workers execute their sub-tasks in parallel
    for worker, task in zip(workers, sub_tasks):
        yield ExecutionEvent(type="agent_start", agent_id=worker.id, agent_name=worker.name, content=task)

    tasks = [_collect_output(worker, task) for worker, task in zip(workers, sub_tasks)]
    worker_results = await asyncio.gather(*tasks)

    worker_outputs: Dict[str, str] = {}
    for worker, output in worker_results:
        yield ExecutionEvent(type="agent_end", agent_id=worker.id, agent_name=worker.name, content=output)
        worker_outputs[worker.name] = output

    # Step 3: Supervisor consolidates results
    consolidation_input = "\n\n".join(
        [f"[{name}]:\n{output}" for name, output in worker_outputs.items()]
    )
    consolidation_prompt = (
        f"Original task: {initial_input}\n\n"
        f"Results from workers:\n{consolidation_input}\n\n"
        f"Synthesize all results into a single, coherent final answer."
    )

    yield ExecutionEvent(type="agent_start", agent_id=supervisor.id, agent_name=f"{supervisor.name} (consolidation)", content=consolidation_input)

    tokens = []
    async for token in call_agent(
        system_prompt=supervisor.system_prompt,
        user_message=consolidation_prompt,
        model=supervisor.model,
        temperature=supervisor.temperature,
    ):
        tokens.append(token)
        yield ExecutionEvent(type="token", agent_id=supervisor.id, agent_name=supervisor.name, content=token)

    final_output = "".join(tokens)
    yield ExecutionEvent(type="agent_end", agent_id=supervisor.id, agent_name=f"{supervisor.name} (consolidation)", content=final_output)
    yield ExecutionEvent(type="flow_end", content=final_output)
