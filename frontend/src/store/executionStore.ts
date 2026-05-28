import { create } from 'zustand'

export type ExecutionEventType =
  | 'flow_start' | 'agent_start' | 'token' | 'tool_call' | 'tool_result'
  | 'agent_end' | 'condition_eval' | 'loop_iter' | 'loop_exit'
  | 'flow_end' | 'error' | 'step_pause' | 'usage'
  | 'human_input_request' | 'human_input_received'

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
  humanInputPrompt: string | null   // non-null = flow is waiting for human input

  setDebugMode: (enabled: boolean) => void
  startExecution: (flowId: string, inputText: string) => void
  stopExecution: () => void
  continueStep: () => void
  submitHumanInput: (text: string) => void
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
  humanInputPrompt: null,

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

      // Handle human_input_request — show input prompt, don't push as event
      if (raw.type === 'human_input_request') {
        set({ humanInputPrompt: raw.content || 'Please enter your input:' })
        return
      }

      const event: ExecutionEvent = { ...raw, timestamp: Date.now() }

      set((s) => {
        const events = [...s.events, event]
        let activeAgentId = s.activeAgentId
        let isRunning = s.isRunning
        let finalOutput = s.finalOutput
        let humanInputPrompt = s.humanInputPrompt

        if (event.type === 'agent_start') activeAgentId = event.agentId
        if (event.type === 'agent_end')   activeAgentId = null
        if (event.type === 'human_input_received') humanInputPrompt = null
        if (event.type === 'flow_end') {
          isRunning = false
          finalOutput = event.content
          humanInputPrompt = null
        }
        if (event.type === 'error') {
          isRunning = false
          humanInputPrompt = null
        }

        return { events, activeAgentId, isRunning, finalOutput, humanInputPrompt }
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
      set((s) => ({ isRunning: s.isRunning ? false : s.isRunning, ws: null, isPaused: false, humanInputPrompt: null }))
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

  submitHumanInput: (text) => {
    const { ws } = get()
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'human_input', content: text }))
      set({ humanInputPrompt: null })
    }
  },

  stopExecution: () => {
    const { ws, isPaused, humanInputPrompt } = get()
    if (ws) {
      if ((isPaused || humanInputPrompt) && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'stop' }))
      }
      ws.close()
    }
    set({ isRunning: false, ws: null, isPaused: false, pausedAgentName: '', humanInputPrompt: null })
  },

  clearEvents: () => set({ events: [], finalOutput: '', activeAgentId: null, isPaused: false, humanInputPrompt: null }),
}))
