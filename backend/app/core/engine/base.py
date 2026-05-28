from typing import AsyncGenerator, List, Dict, Any
from dataclasses import dataclass, field


@dataclass
class AgentConfig:
    id: str
    name: str
    system_prompt: str
    model: str
    temperature: float
    tools: list[str] = field(default_factory=list)


@dataclass
class ExecutionEvent:
    type: str  # "flow_start"|"agent_start"|"token"|"tool_call"|"tool_result"|"agent_end"|"condition_eval"|"flow_end"|"error"
    agent_id: str = ""
    agent_name: str = ""
    content: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.type,
            "agentId": self.agent_id,
            "agentName": self.agent_name,
            "content": self.content,
        }


def topological_sort(nodes: List[str], edges: List[Dict]) -> List[str]:
    """Kahn's algorithm for topological sort of DAG nodes."""
    adjacency: Dict[str, List[str]] = {n: [] for n in nodes}
    in_degree: Dict[str, int] = {n: 0 for n in nodes}

    for edge in edges:
        src, tgt = edge["source"], edge["target"]
        if src in adjacency and tgt in in_degree:
            adjacency[src].append(tgt)
            in_degree[tgt] += 1

    queue = [n for n in nodes if in_degree[n] == 0]
    result: List[str] = []

    while queue:
        node = queue.pop(0)
        result.append(node)
        for neighbor in adjacency[node]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    if len(result) != len(nodes):
        raise ValueError("Flow contains a cycle — not a valid DAG")

    return result
