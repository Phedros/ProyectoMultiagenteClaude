import re
from collections import defaultdict, deque
from typing import AsyncGenerator, List, Dict, Any, Optional, Set
from app.core.engine.base import AgentConfig, ExecutionEvent
from app.core.llm import run_agent_turn
from app.core.prompt_utils import render_prompt


# ---------------------------------------------------------------------------
# Condition evaluation  (shared by conditionNode and loopNode exit_condition)
# ---------------------------------------------------------------------------

def evaluate_condition(condition: str, text: str) -> bool:
    """
    Evaluate a simple text condition against *text*.  Returns True/False.

    Supported syntax:
        contains:word          not_contains:word
        starts_with:prefix     ends_with:suffix
        regex:pattern          (re.IGNORECASE applied)
        length_gt:N            length_lt:N
    """
    condition = condition.strip()
    if ":" not in condition:
        return False

    op, _, value = condition.partition(":")
    op = op.strip().lower()
    value = value.strip()

    if op == "contains":       return value.lower() in text.lower()
    if op == "not_contains":   return value.lower() not in text.lower()
    if op == "starts_with":    return text.lower().startswith(value.lower())
    if op == "ends_with":      return text.lower().endswith(value.lower())
    if op == "regex":
        try:   return bool(re.search(value, text, re.IGNORECASE))
        except re.error: return False
    if op == "length_gt":
        try:   return len(text) > int(value)
        except ValueError: return False
    if op == "length_lt":
        try:   return len(text) < int(value)
        except ValueError: return False

    return False


# ---------------------------------------------------------------------------
# Helper: collect all descendants of a set of nodes (BFS, bounded by allowed set)
# ---------------------------------------------------------------------------

def _descendants(
    start_ids: List[str],
    adj: Dict[str, List[tuple]],
    stop_at: Set[str] | None = None,
) -> Set[str]:
    """Return all nodes reachable from start_ids via adj, not crossing stop_at."""
    visited: Set[str] = set()
    q: deque = deque(start_ids)
    while q:
        nid = q.popleft()
        if nid in visited:
            continue
        if stop_at and nid in stop_at:
            continue
        visited.add(nid)
        for succ_id, _ in adj.get(nid, []):
            q.append(succ_id)
    return visited


# ---------------------------------------------------------------------------
# Core BFS: run a (sub-)graph, yielding ExecutionEvents
# ---------------------------------------------------------------------------

async def _run_bfs(
    start_ids: List[str],
    allowed_ids: Set[str] | None,           # None = unrestricted (main graph)
    node_map: Dict[str, Dict[str, Any]],
    adj: Dict[str, List[tuple]],
    agents_by_id: Dict[str, AgentConfig],
    initial_text: str,
    history: Optional[List[Dict]],
    first_agent_done: list,                 # mutable box so caller can track it
    final_output_box: list,                 # mutable box: [current_final_output]
    flow_input: str = "",                   # original top-level input for {{flow_input}}
    iteration: int = 1,                     # loop iteration number for {{iteration}}
) -> AsyncGenerator[ExecutionEvent, None]:
    """
    Generic BFS traversal used by both the outer pipeline and the loop body.

    *allowed_ids* — if not None, BFS skips any node not in this set (used to
    restrict the body of a loop to its own sub-graph).

    *first_agent_done* / *final_output_box* — single-element lists used as
    mutable boxes so callers can share state across recursive calls.

    *flow_input* / *iteration* — passed to render_prompt for {{variable}} interpolation.
    """

    # Queue: (node_id, current_text, previous_output)
    queue: deque = deque((nid, initial_text, "") for nid in start_ids)

    while queue:
        node_id, current_text, prev_output = queue.popleft()

        # Respect allowed-node boundary
        if allowed_ids is not None and node_id not in allowed_ids:
            continue

        node = node_map.get(node_id)
        if node is None:
            continue

        node_type = node.get("type")

        # ── Agent node ───────────────────────────────────────────────────────
        if node_type == "agentNode":
            agent_id = node["data"].get("agentId", "")
            agent    = agents_by_id.get(agent_id)
            if agent is None:
                yield ExecutionEvent(type="error", content=f"Agent {agent_id!r} not found")
                continue

            use_history = (not first_agent_done[0]) and bool(history)
            first_agent_done[0] = True

            # Interpolate {{variables}} in system prompt
            resolved_prompt = render_prompt(
                agent.system_prompt,
                flow_input=flow_input or initial_text,
                previous_output=prev_output,
                agent_name=agent.name,
                iteration=iteration,
            )

            yield ExecutionEvent(
                type="agent_start",
                agent_id=agent.id,
                agent_name=agent.name,
                content=current_text,
            )

            accumulated: list[str] = []
            async for event in run_agent_turn(
                system_prompt=resolved_prompt,
                user_message=current_text,
                model=agent.model,
                temperature=agent.temperature,
                enabled_tools=agent.tools,
                agent_id=agent.id,
                agent_name=agent.name,
                history=history if use_history else None,
                mcp_configs=agent.mcp_servers or None,
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

            final_output_box[0] = output

            for (succ_id, _handle) in adj.get(node_id, []):
                if allowed_ids is None or succ_id in allowed_ids:
                    queue.append((succ_id, output, output))

        # ── Condition node ────────────────────────────────────────────────────
        elif node_type == "conditionNode":
            condition = node["data"].get("condition", "")
            label     = node["data"].get("label", "Condition")
            result    = evaluate_condition(condition, current_text)
            chosen    = "true" if result else "false"

            yield ExecutionEvent(
                type="condition_eval",
                agent_name=label,
                content=f"[{condition}] → {chosen.upper()}",
            )

            for (succ_id, handle) in adj.get(node_id, []):
                if handle == chosen:
                    if allowed_ids is None or succ_id in allowed_ids:
                        queue.append((succ_id, current_text, prev_output))

        # ── Loop node ────────────────────────────────────────────────────────
        elif node_type == "loopNode":
            max_iter   = min(max(int(node["data"].get("max_iterations", 3)), 1), 20)
            exit_cond  = (node["data"].get("exit_condition") or "").strip()
            label      = node["data"].get("label", "Loop")

            body_starts = [t for t, h in adj.get(node_id, []) if h == "body"]
            exit_starts = [t for t, h in adj.get(node_id, []) if h == "exit"]

            if not body_starts:
                # Empty loop body — pass through to exit
                for exit_id in exit_starts:
                    queue.append((exit_id, current_text, prev_output))
                continue

            # Compute the body sub-graph: descendants of body_starts
            # (stop at loop node itself to avoid accidental re-entry)
            body_ids = _descendants(
                body_starts,
                adj,
                stop_at={node_id} | set(exit_starts),
            )

            loop_text = current_text

            for loop_iter in range(max_iter):
                yield ExecutionEvent(
                    type="loop_iter",
                    agent_name=label,
                    content=f"Iteration {loop_iter + 1} / {max_iter}",
                )

                # Run the body sub-graph for this iteration
                body_output_box = [loop_text]
                async for event in _run_bfs(
                    start_ids=body_starts,
                    allowed_ids=body_ids,
                    node_map=node_map,
                    adj=adj,
                    agents_by_id=agents_by_id,
                    initial_text=loop_text,
                    history=None,              # no history inside loop body
                    first_agent_done=[True],   # don't inject history inside loop
                    final_output_box=body_output_box,
                    flow_input=flow_input,
                    iteration=loop_iter + 1,
                ):
                    yield event

                loop_text = body_output_box[0]
                final_output_box[0] = loop_text

                # Check exit condition
                if exit_cond and evaluate_condition(exit_cond, loop_text):
                    yield ExecutionEvent(
                        type="loop_exit",
                        agent_name=label,
                        content=f"Exit condition met after iteration {loop_iter + 1}",
                    )
                    break

            # Continue to exit successors with final loop output
            for exit_id in exit_starts:
                queue.append((exit_id, loop_text, loop_text))


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def run_pipeline(
    nodes: List[Dict[str, Any]],
    edges: List[Dict[str, Any]],
    agents_by_id: Dict[str, AgentConfig],
    initial_input: str,
    history: Optional[List[Dict]] = None,
) -> AsyncGenerator[ExecutionEvent, None]:
    """
    Pipeline topology with BFS traversal.

    Supported node types:
      - agentNode     : run an LLM agent; pass output downstream
      - conditionNode : evaluate text condition; route to "true" or "false" edge
      - loopNode      : repeat body sub-graph up to N times (or until exit_condition)
    """

    valid_types = {"agentNode", "conditionNode", "loopNode"}
    node_map: Dict[str, Dict[str, Any]] = {
        n["id"]: n for n in nodes if n.get("type") in valid_types
    }

    if not node_map:
        yield ExecutionEvent(type="error", content="No nodes found in flow")
        return

    # Build adjacency: node_id -> [(target_id, source_handle)]
    adj: Dict[str, List[tuple]] = defaultdict(list)
    in_degree: Dict[str, int]   = defaultdict(int)

    for e in edges:
        src, tgt = e.get("source", ""), e.get("target", "")
        if src in node_map and tgt in node_map:
            handle = e.get("sourceHandle") or None
            adj[src].append((tgt, handle))
            in_degree[tgt] += 1

    roots = [nid for nid in node_map if in_degree.get(nid, 0) == 0]
    if not roots:
        yield ExecutionEvent(
            type="error",
            content="Flow has no starting node (possible cycle at the top level?)",
        )
        return

    agent_count = sum(1 for n in node_map.values() if n.get("type") == "agentNode")
    loop_count  = sum(1 for n in node_map.values() if n.get("type") == "loopNode")
    extras = f", {loop_count} loop(s)" if loop_count else ""
    yield ExecutionEvent(
        type="flow_start",
        content=f"Starting pipeline with {agent_count} agent(s){extras}",
    )

    first_agent_done = [False]
    final_output_box = [initial_input]

    async for event in _run_bfs(
        start_ids=roots,
        allowed_ids=None,
        node_map=node_map,
        adj=adj,
        agents_by_id=agents_by_id,
        initial_text=initial_input,
        history=history,
        first_agent_done=first_agent_done,
        final_output_box=final_output_box,
        flow_input=initial_input,
        iteration=1,
    ):
        yield event

    yield ExecutionEvent(type="flow_end", content=final_output_box[0])
