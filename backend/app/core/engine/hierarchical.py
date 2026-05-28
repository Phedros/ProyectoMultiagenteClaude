import asyncio
import json
from typing import AsyncGenerator, List, Dict, Any, Optional
from app.core.engine.base import AgentConfig, ExecutionEvent
from app.core.llm import run_agent_turn, call_agent_non_streaming
from app.core.prompt_utils import render_prompt


async def _collect_output(
    agent: AgentConfig,
    input_text: str,
    flow_input: str = "",
) -> tuple[AgentConfig, str, list[ExecutionEvent]]:
    """Run a worker agent to completion, collecting events and final text."""
    internal_events: list[ExecutionEvent] = []
    tokens: list[str] = []

    resolved_prompt = render_prompt(
        agent.system_prompt,
        flow_input=flow_input or input_text,
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
        mcp_configs=agent.mcp_servers or None,
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
    history: Optional[List[Dict]] = None,
) -> AsyncGenerator[ExecutionEvent, None]:
    """
    Hierarchical execution:
      1. Supervisor decomposes the task (sees conversation history)
      2. Workers execute sub-tasks in parallel (no history — focused on sub-task)
      3. Supervisor consolidates results (sees history for coherent final answer)
    """
    agent_nodes = [n for n in nodes if n.get("type") == "agentNode"]
    if len(agent_nodes) < 2:
        yield ExecutionEvent(type="error", content="Hierarchical topology requires at least 2 agent nodes")
        return

    # ── Determine supervisor via graph structure (in-degree = 0) ───────────
    agent_ids_set = {n["id"] for n in agent_nodes}
    in_deg: dict[str, int] = {nid: 0 for nid in agent_ids_set}
    out_deg: dict[str, int] = {nid: 0 for nid in agent_ids_set}

    for edge in edges:
        src, tgt = edge.get("source", ""), edge.get("target", "")
        if src in agent_ids_set and tgt in agent_ids_set:
            in_deg[tgt] += 1
            out_deg[src] += 1

    roots = [n for n in agent_nodes if in_deg[n["id"]] == 0]

    if len(roots) == 1:
        supervisor_node = roots[0]
    elif len(roots) > 1:
        # Among multiple roots pick the one connected to the most workers
        supervisor_node = max(roots, key=lambda n: out_deg[n["id"]])
    else:
        # All nodes have incoming edges (unusual) — fall back to list order
        supervisor_node = agent_nodes[0]

    worker_nodes = [n for n in agent_nodes if n["id"] != supervisor_node["id"]]

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

    # ── Step 1: Supervisor decomposes (non-streaming, structured JSON) ──
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

    raw_decomp = await call_agent_non_streaming(
        system_prompt=supervisor.system_prompt,
        user_message=decomposition_prompt,
        model=supervisor.model,
        temperature=0.3,
        history=history,  # supervisor sees conversation history for context
    )

    yield ExecutionEvent(
        type="agent_end", agent_id=supervisor.id, agent_name=supervisor.name, content=raw_decomp
    )

    try:
        sub_tasks = json.loads(raw_decomp)
        if not isinstance(sub_tasks, list):
            sub_tasks = [initial_input] * len(workers)
    except json.JSONDecodeError:
        sub_tasks = [initial_input] * len(workers)

    while len(sub_tasks) < len(workers):
        sub_tasks.append(initial_input)
    sub_tasks = sub_tasks[: len(workers)]

    # ── Step 2: Workers in parallel (no history — focused on their sub-task) ──
    for worker, task in zip(workers, sub_tasks):
        yield ExecutionEvent(
            type="agent_start", agent_id=worker.id, agent_name=worker.name, content=task
        )

    gather_tasks = [_collect_output(worker, task, flow_input=initial_input) for worker, task in zip(workers, sub_tasks)]
    worker_results = await asyncio.gather(*gather_tasks)

    worker_outputs: Dict[str, str] = {}
    for worker, output, internal_events in worker_results:
        for ev in internal_events:
            yield ev
        yield ExecutionEvent(type="agent_end", agent_id=worker.id, agent_name=worker.name, content=output)
        worker_outputs[worker.name] = output

    # ── Step 3: Supervisor consolidates (with history for coherence) ──
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

    supervisor_consolidation_prompt = render_prompt(
        supervisor.system_prompt,
        flow_input=initial_input,
        previous_output=consolidation_input,
        agent_name=supervisor.name,
    )

    tokens: list[str] = []
    async for event in run_agent_turn(
        system_prompt=supervisor_consolidation_prompt,
        user_message=consolidation_prompt,
        model=supervisor.model,
        temperature=supervisor.temperature,
        enabled_tools=supervisor.tools,
        agent_id=supervisor.id,
        agent_name=supervisor.name,
        history=history,  # supervisor sees history for a coherent final answer
        mcp_configs=supervisor.mcp_servers or None,
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
