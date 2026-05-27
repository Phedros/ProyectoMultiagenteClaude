const BASE_URL = '/api'

export interface Agent {
  id: string
  name: string
  system_prompt: string
  model: string
  temperature: number
  tools: string[]
  created_at: string
  updated_at: string | null
}

export interface AgentCreate {
  name: string
  system_prompt: string
  model: string
  temperature: number
  tools: string[]
}

export interface Flow {
  id: string
  name: string
  description: string
  topology: string
  nodes: FlowNode[]
  edges: FlowEdge[]
  created_at: string
  updated_at: string | null
}

export interface FlowNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: Record<string, unknown>
}

export interface FlowEdge {
  id: string
  source: string
  target: string
}

export interface FlowCreate {
  name: string
  description?: string
  topology: string
  nodes: FlowNode[]
  edges: FlowEdge[]
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const agentsApi = {
  list: () => request<Agent[]>('/agents/'),
  create: (data: AgentCreate) => request<Agent>('/agents/', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<AgentCreate>) =>
    request<Agent>(`/agents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/agents/${id}`, { method: 'DELETE' }),
}

export const flowsApi = {
  list: () => request<Flow[]>('/flows/'),
  get: (id: string) => request<Flow>(`/flows/${id}`),
  create: (data: FlowCreate) => request<Flow>('/flows/', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<FlowCreate>) =>
    request<Flow>(`/flows/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/flows/${id}`, { method: 'DELETE' }),
}
