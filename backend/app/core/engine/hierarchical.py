import asyncio
import json
from typing import AsyncGenerator, List, Dict, Any
from app.core.engine.base import AgentConfig, ExecutionEvent
from app.core.llm import run_agent_turn, call_agent, get_client


async def _collect_output(
    agent: AgentConfig, input_text: str
) -> tuple[AgentConfig, str, list[ExecutionEvent]]:
    """Run an agent to completion, collecting events and final text."""
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


async def run_hierarchical(
    nodes: List[Dict[str, Any]],
    edges: List[Dict[str, Any]],
    agents_by_id: Dict[str, AgentConfig],
    initial_input: str,
) -> AsyncGenerator[ExecutionEvent, None]:
    """
    Hierarchical execution:
      1. Supervisor (first node) decomposes the task into N sub-tasks
      2. Workers execute their sub-tasks in parallel (with optional tool use)
      3. Supervisor consolidates all results into a final answer (with optional tool use)

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

    # ── Step 1: Supervisor decomposes the task (plain call, structured JSON output) ──
    worker_names = [w.name for w in workers]
    decomposition_prompt = (
        f"You are a supervisor. Break the following task into exactly {len(workers)} sub-tasks, "
        f"one for each worker: {', '.join(worker_names)}. "
        f"Respond ONLY with a JSON array of strings, one per worker, in that exact order.\n\n"
        f"Task: {initial_input}"
    )

    yield ExecutionEvent(
        type="agent_start", agent_id=supervisor.id, agent_name=supervisor.name, content=initial_input
    )

    # Decomposition uses a direct non-streaming call (needs structured JSON)
    client = get_client()
    decomp_resp = await client.chat.completions.create(
        model=supervisor.model,
        temperature=0.3,
        messages=[
            {"role": "system", "content": supervisor.system_prompt},
            {"role": "user", "content": decomposition_prompt},
        ],
    )
    raw_decomp = decomp_resp.choices[0].message.content or "[]"

    yield ExecutionEvent(
        type="agent_end", agent_id=supervisor.id, agent_name=supervisor.name, content=raw_decomp
    )

    try:
        sub_tasks = json.loads(raw_decomp)
        if not isinstance(sub_tasks, list):
            sub_tasks = [initial_input] * len(workers)
    except json.JSONDecodeError:
        sub_tasks = [initial_input] * len(workers)

    # Pad / trim to match worker count
    while len(sub_tasks) < len(workers):
        sub_tasks.append(initial_input)
    sub_tasks = sub_tasks[: len(workers)]

    # ── Step 2: Workers execute in parallel (with tool support) ──
    for worker, task in zip(workers, sub_tasks):
        yield ExecutionEvent(
            type="agent_start", agent_id=worker.id, agent_name=worker.name, content=task
        )

    gather_tasks = [_collect_output(worker, task) for worker, task in zip(workers, sub_tasks)]
    worker_results = await asyncio.gather(*gather_tasks)

    worker_outputs: Dict[str, str] = {}
    for worker, output, internal_events in worker_results:
        for ev in internal_events:
            yield ev
        yield ExecutionEvent(type="agent_end", agent_id=worker.id, agent_name=worker.name, content=output)
        worker_outputs[worker.name] = output

    # ── Step 3: Supervisor consolidates results (with tool support) ──
    consolidation_input = "\n\n".join(
        [f"[{name}]:\n{output}" for name, output in worker_outputs.items()]
    )
    consolidation_prompt = (
        f"Original task: {initial_input}\n\n"
        f"Results from workers:\n{consolidation_input}\n\n"
        f"Synthesize all results into a single, coherent final answer."
    )

    yield ExecutionEvent(
        type="agent_start",
        agent_id=supervisor.id,
        agent_name=f"{supervisor.name} (consolidation)",
        content=consolidation_input,
    )

    tokens: list[str] = []
    async for event in run_agent_turn(
        system_prompt=supervisor.system_prompt,
        user_message=consolidation_prompt,
        model=supervisor.model,
        temperature=supervisor.temperature,
        enabled_tools=supervisor.tools,
        agent_id=supervisor.id,
        agent_name=supervisor.name,
    ):
        if event.type == "token":
            tokens.append(event.content)
        yield event

    final_output = "".join(tokens)
    yield ExecutionEvent(
        type="agent_end",
        agent_id=supervisor.id,
        agent_name=f"{supervisor.name} (consolidation)",
        content=final_output,
    )
    yield ExecutionEvent(type="flow_end", content=final_output)
