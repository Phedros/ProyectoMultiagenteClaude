import { create } from 'zustand'
import { Agent, AgentCreate, agentsApi } from '../services/api'

interface AgentStore {
  agents: Agent[]
  loading: boolean
  fetchAgents: () => Promise<void>
  createAgent: (data: AgentCreate) => Promise<Agent>
  updateAgent: (id: string, data: Partial<AgentCreate>) => Promise<void>
  deleteAgent: (id: string) => Promise<void>
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  agents: [],
  loading: false,

  fetchAgents: async () => {
    set({ loading: true })
    try {
      const agents = await agentsApi.list()
      set({ agents })
    } finally {
      set({ loading: false })
    }
  },

  createAgent: async (data) => {
    const agent = await agentsApi.create(data)
    set((s) => ({ agents: [...s.agents, agent] }))
    return agent
  },

  updateAgent: async (id, data) => {
    const updated = await agentsApi.update(id, data)
    set((s) => ({ agents: s.agents.map((a) => (a.id === id ? updated : a)) }))
  },

  deleteAgent: async (id) => {
    await agentsApi.delete(id)
    set((s) => ({ agents: s.agents.filter((a) => a.id !== id) }))
  },
}))
