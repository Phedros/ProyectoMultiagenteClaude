import { create } from 'zustand'

export type ExecutionEventType =
  | 'flow_start' | 'agent_start' | 'token' | 'tool_call' | 'tool_result'
  | 'agent_end' | 'condition_eval' | 'loop_iter' | 'loop_exit'
  | 'flow_end' | 'error' | 'step_pause' | 'usage'

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
  debugMode: boolean
  isPaused: boolean
  pausedAgentName: string

  setDebugMode: (enabled: boolean) => void
  startExecution: (flowId: string, inputText: string) => void
  stopExecution: () => void
  continueStep: () => void
  clearEvents: () => void
}

export const useExecutionStore = create<ExecutionStore>((set, get) => ({
  events: [],
  isRunning: false,
  activeAgentId: null,
  finalOutput: '',
  ws: null,
  debugMode: false,
  isPaused: false,
  pausedAgentName: '',

  setDebugMode: (enabled) => set({ debugMode: enabled }),

  startExecution: (flowId, inputText) => {
    const { ws: existing, debugMode } = get()
    if (existing) existing.close()

    set({ events: [], isRunning: true, activeAgentId: null, finalOutput: '', isPaused: false, pausedAgentName: '' })

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/api/ws/flows/${flowId}/execute`
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      ws.send(JSON.stringify({ input_text: inputText, debug: debugMode }))
    }

    ws.onmessage = (msg) => {
      const raw = JSON.parse(msg.data)

      // Handle step_pause separately — don't push as normal event
      if (raw.type === 'step_pause') {
        set({ isPaused: true, pausedAgentName: raw.agentName || '' })
        return
      }

      const event: ExecutionEvent = { ...raw, timestamp: Date.now() }

      set((s) => {
        const events = [...s.events, event]
        let activeAgentId = s.activeAgentId
        let isRunning = s.isRunning
        let finalOutput = s.finalOutput

        if (event.type === 'agent_start') activeAgentId = event.agentId
        if (event.type === 'agent_end')   activeAgentId = null
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
        events: [
          ...s.events,
          {
            type: 'error' as ExecutionEventType,
            agentId: '',
            agentName: '',
            content: 'WebSocket connection error',
            timestamp: Date.now(),
          },
        ],
        isRunning: false,
        isPaused: false,
      }))
    }

    ws.onclose = () => {
      set((s) => ({ isRunning: s.isRunning ? false : s.isRunning, ws: null, isPaused: false }))
    }

    set({ ws })
  },

  continueStep: () => {
    const { ws } = get()
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'continue' }))
      set({ isPaused: false, pausedAgentName: '' })
    }
  },

  stopExecution: () => {
    const { ws, isPaused } = get()
    if (ws) {
      if (isPaused && ws.readyState === WebSocket.OPEN) {
        // Send stop signal so backend can break out of the pause wait
        ws.send(JSON.stringify({ type: 'stop' }))
      }
      ws.close()
    }
    set({ isRunning: false, ws: null, isPaused: false, pausedAgentName: '' })
  },

  clearEvents: () => set({ events: [], finalOutput: '', activeAgentId: null, isPaused: false }),
}))
