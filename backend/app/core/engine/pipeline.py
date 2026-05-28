import re
from collections import defaultdict, deque
from typing import AsyncGenerator, List, Dict, Any, Optional
from app.core.engine.base import AgentConfig, ExecutionEvent
from app.core.llm import run_agent_turn


# ---------------------------------------------------------------------------
# Condition evaluation
# ---------------------------------------------------------------------------

CONDITION_HELP = (
    "Syntax: <op>:<value>  —  ops: contains, not_contains, starts_with, "
    "ends_with, regex, length_gt, length_lt"
)


def evaluate_condition(condition: str, text: str) -> bool:
    """
    Evaluate a simple text condition against *text*.  Returns True/False.

    Supported syntax (all case-insensitive for the value part):
        contains:word
        not_contains:word
        starts_with:prefix
        ends_with:suffix
        regex:pattern          (re.IGNORECASE applied)
        length_gt:N
        length_lt:N
    """
    condition = condition.strip()
    if ":" not in condition:
        return False

    op, _, value = condition.partition(":")
    op = op.strip().lower()
    value = value.strip()

    if op == "contains":
        return value.lower() in text.lower()
    if op == "not_contains":
        return value.lower() not in text.lower()
    if op == "starts_with":
        return text.lower().startswith(value.lower())
    if op == "ends_with":
        return text.lower().endswith(value.lower())
    if op == "regex":
        try:
            return bool(re.search(value, text, re.IGNORECASE))
        except re.error:
            return False
    if op == "length_gt":
        try:
            return len(text) > int(value)
        except ValueError:
            return False
    if op == "length_lt":
        try:
            return len(text) < int(value)
        except ValueError:
            return False

    return False


# ---------------------------------------------------------------------------
# Pipeline runner
# ---------------------------------------------------------------------------

async def run_pipeline(
    nodes: List[Dict[str, Any]],
    edges: List[Dict[str, Any]],
    agents_by_id: Dict[str, AgentConfig],
    initial_input: str,
    history: Optional[List[Dict]] = None,
) -> AsyncGenerator[ExecutionEvent, None]:
    """
    Pipeline: output of agent N becomes input of agent N+1.

    Supports two node types:
      - agentNode  : runs the associated LLM agent
      - conditionNode : evaluates a text condition and routes to the "true"
                        or "false" outgoing edge (identified by sourceHandle)

    The FIRST agent to execute receives the full conversation history.
    Subsequent agents receive no history (they work on the chain output).
    """

    # --- build full node map ------------------------------------------------
    valid_types = {"agentNode", "conditionNode"}
    node_map: Dict[str, Dict[str, Any]] = {}
    for n in nodes:
        if n.get("type") in valid_types:
            node_map[n["id"]] = n

    if not node_map:
        yield ExecutionEvent(type="error", content="No nodes found in flow")
        return

    # --- build adjacency: node_id -> [(target_id, source_handle)] -----------
    # source_handle is "true"/"false" for condition nodes, or None for agent→agent
    adj: Dict[str, List[tuple]] = defaultdict(list)
    in_degree: Dict[str, int] = defaultdict(int)

    for e in edges:
        src, tgt = e.get("source", ""), e.get("target", "")
        if src in node_map and tgt in node_map:
            handle = e.get("sourceHandle") or None
            adj[src].append((tgt, handle))
            in_degree[tgt] += 1

    # --- find root nodes (in-degree 0) --------------------------------------
    roots = [nid for nid in node_map if in_degree.get(nid, 0) == 0]
    if not roots:
        yield ExecutionEvent(type="error", content="Flow has no starting node (cycle detected?)")
        return

    agent_count = sum(1 for n in node_map.values() if n.get("type") == "agentNode")
    yield ExecutionEvent(
        type="flow_start",
        content=f"Starting pipeline with {agent_count} agent(s)",
    )

    # --- BFS traversal -------------------------------------------------------
    # Queue items: (node_id, current_text, is_first_agent)
    queue: deque = deque((root, initial_input, True) for root in roots)
    first_agent_done = False
    final_output = initial_input

    while queue:
        node_id, current_text, is_first = queue.popleft()
        node = node_map.get(node_id)
        if node is None:
            continue

        node_type = node.get("type")

        # ── Agent node ──────────────────────────────────────────────────────
        if node_type == "agentNode":
            agent_id = node["data"].get("agentId", "")
            agent = agents_by_id.get(agent_id)
            if agent is None:
                yield ExecutionEvent(type="error", content=f"Agent {agent_id!r} not found")
                continue

            use_history = (not first_agent_done) and bool(history)
            first_agent_done = True

            yield ExecutionEvent(
                type="agent_start",
                agent_id=agent.id,
                agent_name=agent.name,
                content=current_text,
            )

            accumulated: list[str] = []
            async for event in run_agent_turn(
                system_prompt=agent.system_prompt,
                user_message=current_text,
                model=agent.model,
                temperature=agent.temperature,
                enabled_tools=agent.tools,
                agent_id=agent.id,
                agent_name=agent.name,
                history=history if use_history else None,
            ):
                if event.type == "token":
                    accumulated.append(event.content)
                yield event

            output = "".join(accumulated)
            yield ExecutionEvent(
                type="agent_end",
                agent_id=agent.id,
                agent_name=agent.name,
                content=output,
            )

            final_output = output

            for (succ_id, handle) in adj[node_id]:
                queue.append((succ_id, output, False))

        # ── Condition node ───────────────────────────────────────────────────
        elif node_type == "conditionNode":
            condition = node["data"].get("condition", "")
            label = node["data"].get("label", "Condition")
            result = evaluate_condition(condition, current_text)
            chosen = "true" if result else "false"

            yield ExecutionEvent(
                type="condition_eval",
                agent_name=label,
                content=f"[{condition}] → {chosen.upper()}",
            )

            for (succ_id, handle) in adj[node_id]:
                if handle == chosen:
                    queue.append((succ_id, current_text, is_first))

    yield ExecutionEvent(type="flow_end", content=final_output)
