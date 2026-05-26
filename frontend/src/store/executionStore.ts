import { create } from 'zustand'

export type ExecutionEventType = 'flow_start' | 'agent_start' | 'token' | 'agent_end' | 'flow_end' | 'error'

export interface ExecutionEvent {
  type: ExecutionEventType
  agentId: string
  agentName: string
  content: string
  timestamp: number
}

interface ExecutionStore {
  events: ExecutionEvent[]
  isRunning: boolean
  activeAgentId: string | null
  finalOutput: string
  ws: WebSocket | null

  startExecution: (flowId: string, inputText: string) => void
  stopExecution: () => void
  clearEvents: () => void
}

export const useExecutionStore = create<ExecutionStore>((set, get) => ({
  events: [],
  isRunning: false,
  activeAgentId: null,
  finalOutput: '',
  ws: null,

  startExecution: (flowId, inputText) => {
    const { ws: existing } = get()
    if (existing) existing.close()

    set({ events: [], isRunning: true, activeAgentId: null, finalOutput: '' })

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/api/ws/flows/${flowId}/execute`
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      ws.send(JSON.stringify({ input_text: inputText }))
    }

    ws.onmessage = (msg) => {
      const event: ExecutionEvent = { ...JSON.parse(msg.data), timestamp: Date.now() }

      set((s) => {
        const events = [...s.events, event]
        let activeAgentId = s.activeAgentId
        let isRunning = s.isRunning
        let finalOutput = s.finalOutput

        if (event.type === 'agent_start') activeAgentId = event.agentId
        if (event.type === 'agent_end') activeAgentId = null
        if (event.type === 'flow_end') {
          isRunning = false
          finalOutput = event.content
        }
        if (event.type === 'error') isRunning = false

        return { events, activeAgentId, isRunning, finalOutput }
      })
    }

    ws.onerror = () => {
      set((s) => ({
        events: [...s.events, { type: 'error', agentId: '', agentName: '', content: 'WebSocket connection error', timestamp: Date.now() }],
        isRunning: false,
      }))
    }

    ws.onclose = () => {
      set((s) => ({ isRunning: s.isRunning ? false : s.isRunning, ws: null }))
    }

    set({ ws })
  },

  stopExecution: () => {
    const { ws } = get()
    if (ws) ws.close()
    set({ isRunning: false, ws: null })
  },

  clearEvents: () => set({ events: [], finalOutput: '', activeAgentId: null }),
}))
