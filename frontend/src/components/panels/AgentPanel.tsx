import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, Edit2, X, Check, ChevronDown, Wrench, Plug, FlaskConical, Square, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAgentStore } from '../../store/agentStore'
import { Agent, mcpApi, MCPServer } from '../../services/api'

// Grouped model list — value is the exact LiteLLM model string
const MODEL_GROUPS = [
  {
    provider: 'OpenAI',
    color: 'text-emerald-400',
    models: [
      { value: 'gpt-4o',       label: 'GPT-4o' },
      { value: 'gpt-4o-mini',  label: 'GPT-4o mini  (fast)' },
      { value: 'gpt-3.5-turbo',label: 'GPT-3.5 Turbo  (cheap)' },
    ],
  },
  {
    provider: 'Anthropic',
    color: 'text-orange-400',
    models: [
      { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
      { value: 'claude-3-5-haiku-20241022',  label: 'Claude 3.5 Haiku  (fast)' },
      { value: 'claude-3-opus-20240229',     label: 'Claude 3 Opus' },
    ],
  },
  {
    provider: 'Google Gemini',
    color: 'text-blue-400',
    models: [
      { value: 'gemini/gemini-2.0-flash',  label: 'Gemini 2.0 Flash  (fast)' },
      { value: 'gemini/gemini-1.5-pro',    label: 'Gemini 1.5 Pro' },
    ],
  },
  {
    provider: 'Groq  (fast · free tier)',
    color: 'text-purple-400',
    models: [
      { value: 'groq/llama-3.1-70b-versatile', label: 'Llama 3.1 70B' },
      { value: 'groq/mixtral-8x7b-32768',       label: 'Mixtral 8x7B' },
      { value: 'groq/gemma2-9b-it',             label: 'Gemma 2 9B' },
    ],
  },
  {
    provider: 'Ollama  (local)',
    color: 'text-slate-400',
    models: [
      { value: 'ollama/llama3',    label: 'Llama 3' },
      { value: 'ollama/mistral',   label: 'Mistral' },
      { value: 'ollama/codellama', label: 'Code Llama' },
      { value: 'ollama/phi3',      label: 'Phi-3' },
    ],
  },
]

// Flat map for label lookup
const ALL_MODELS = MODEL_GROUPS.flatMap((g) => g.models)

const AVAILABLE_TOOLS = [
  { id: 'web_search', label: 'Web Search', icon: '🔍' },
  { id: 'http_get',   label: 'HTTP GET',   icon: '🌐' },
  { id: 'python_exec',label: 'Python',     icon: '💻' },
  { id: 'get_datetime',label: 'Date/Time', icon: '🕐' },
]

interface FormState {
  name: string
  system_prompt: string
  model: string
  temperature: number
  tools: string[]
  mcp_servers: string[]
}

const DEFAULT_FORM: FormState = {
  name: '',
  system_prompt: 'You are a helpful assistant.',
  model: 'gpt-4o-mini',
  temperature: 0.7,
  tools: [],
  mcp_servers: [],
}

function toggleTool(tools: string[], toolId: string): string[] {
  return tools.includes(toolId) ? tools.filter((t) => t !== toolId) : [...tools, toolId]
}

// ---------------------------------------------------------------------------
// Inline agent test panel
// ---------------------------------------------------------------------------

function AgentTestPanel({ agentId, agentName, onClose }: {
  agentId: string
  agentName: string
  onClose: () => void
}) {
  const [prompt, setPrompt] = useState('')
  const [output, setOutput] = useState('')
  const [streaming, setStreaming] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [streaming, output])

  const handleRun = () => {
    if (!prompt.trim() || isRunning) return
    setOutput('')
    setStreaming('')
    setIsRunning(true)

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/agents/${agentId}/test`)
    wsRef.current = ws

    ws.onopen = () => ws.send(JSON.stringify({ prompt }))

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'token') {
        setStreaming((s) => s + msg.content)
      } else if (msg.type === 'flow_end') {
        setOutput(msg.content)
        setStreaming('')
        setIsRunning(false)
      } else if (msg.type === 'error') {
        toast.error(`Test error: ${msg.content}`)
        setIsRunning(false)
      }
    }

    ws.onerror = () => { toast.error('WebSocket error'); setIsRunning(false) }
    ws.onclose = () => setIsRunning(false)
  }

  const handleStop = () => {
    wsRef.current?.close()
    setIsRunning(false)
  }

  return (
    <div className="border-t border-[#2d3148] bg-[#0d0f19] p-2.5 space-y-2">
      <div className="flex items-center gap-1.5">
        <FlaskConical className="h-3 w-3 text-indigo-400" />
        <span className="text-xs font-semibold text-indigo-300">Test {agentName}</span>
        <button onClick={onClose} className="ml-auto text-slate-600 hover:text-slate-400">
          <X className="h-3 w-3" />
        </button>
      </div>

      <div className="flex gap-1.5">
        <input
          className="flex-1 rounded-lg border border-[#2d3148] bg-[#141624] px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
          placeholder="Enter a test prompt…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={isRunning}
          onKeyDown={(e) => { if (e.key === 'Enter') handleRun() }}
        />
        {isRunning ? (
          <button
            onClick={handleStop}
            className="flex items-center gap-1 rounded-lg border border-red-500/40 px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Square className="h-3 w-3" />
          </button>
        ) : (
          <button
            onClick={handleRun}
            disabled={!prompt.trim()}
            className="flex items-center gap-1 rounded-lg bg-indigo-600 px-2 py-1 text-xs text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors"
          >
            <FlaskConical className="h-3 w-3" />
            Run
          </button>
        )}
      </div>

      {(isRunning || output || streaming) && (
        <div className="rounded-lg border border-[#2d3148] bg-[#141624] p-2 max-h-40 overflow-y-auto">
          {isRunning && !streaming && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
            </div>
          )}
          {(streaming || output) && (
            <pre className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed font-mono">
              {streaming || output}
            </pre>
          )}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  )
}

export default function AgentPanel() {
  const { agents, fetchAgents, createAgent, updateAgent, deleteAgent } = useAgentStore()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [testingAgentId, setTestingAgentId] = useState<string | null>(null)
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([])

  useEffect(() => { fetchAgents() }, [fetchAgents])
  useEffect(() => {
    mcpApi.list().then(setMcpServers).catch(() => {})
  }, [])

  const handleSubmit = async () => {
    if (!form.name.trim()) return
    try {
      if (editingId) {
        await updateAgent(editingId, form)
        setEditingId(null)
        toast.success(`Agent "${form.name}" updated`)
      } else {
        await createAgent(form)
        toast.success(`Agent "${form.name}" created`)
      }
      setForm(DEFAULT_FORM)
      setShowForm(false)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save agent')
    }
  }

  const startEdit = (agent: Agent) => {
    setForm({
      name: agent.name,
      system_prompt: agent.system_prompt,
      model: agent.model,
      temperature: agent.temperature,
      tools: agent.tools ?? [],
      mcp_servers: agent.mcp_servers ?? [],
    })
    setEditingId(agent.id)
    setShowForm(true)
  }

  const cancelForm = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(DEFAULT_FORM)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[#2d3148] px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-200">Agents</h2>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setForm(DEFAULT_FORM) }}
          className="flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          New
        </button>
      </div>

      {showForm && (
        <div className="border-b border-[#2d3148] bg-[#141624] p-4 space-y-3">
          {/* Name */}
          <input
            className="w-full rounded-lg border border-[#2d3148] bg-[#0f1117] px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            placeholder="Agent name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />

          {/* System prompt */}
          <textarea
            className="w-full rounded-lg border border-[#2d3148] bg-[#0f1117] px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none resize-none"
            placeholder="System prompt..."
            rows={3}
            value={form.system_prompt}
            onChange={(e) => setForm((f) => ({ ...f, system_prompt: e.target.value }))}
          />

          {/* Model — quick pick + free-text */}
          <div className="space-y-1.5">
            <select
              className="w-full rounded-lg border border-[#2d3148] bg-[#0f1117] px-3 py-2 text-sm text-slate-400 focus:border-indigo-500 focus:outline-none"
              value={ALL_MODELS.some((m) => m.value === form.model) ? form.model : ''}
              onChange={(e) => {
                if (e.target.value) setForm((f) => ({ ...f, model: e.target.value }))
              }}
            >
              <option value="">— Quick pick —</option>
              {MODEL_GROUPS.map((group) => (
                <optgroup key={group.provider} label={`── ${group.provider}`}>
                  {group.models.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <input
              className="w-full rounded-lg border border-[#2d3148] bg-[#0f1117] px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none font-mono"
              placeholder="or type any model string…"
              value={form.model}
              onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
            />
          </div>

          {/* Temperature */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-slate-400 whitespace-nowrap">Temp: {form.temperature}</label>
            <input
              type="range" min={0} max={2} step={0.1}
              value={form.temperature}
              onChange={(e) => setForm((f) => ({ ...f, temperature: parseFloat(e.target.value) }))}
              className="flex-1 accent-indigo-500"
            />
          </div>

          {/* Tools */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Wrench className="h-3 w-3 text-slate-400" />
              <span className="text-xs text-slate-400 font-medium">Tools</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {AVAILABLE_TOOLS.map((tool) => {
                const active = form.tools.includes(tool.id)
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, tools: toggleTool(f.tools, tool.id) }))}
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                      active
                        ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300'
                        : 'border-[#2d3148] bg-[#0f1117] text-slate-400 hover:border-[#3d4168] hover:text-slate-300'
                    }`}
                  >
                    <span>{tool.icon}</span>
                    {tool.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* MCP Servers */}
          {mcpServers.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Plug className="h-3 w-3 text-slate-400" />
                <span className="text-xs text-slate-400 font-medium">MCP Servers</span>
              </div>
              <div className="space-y-1">
                {mcpServers.map((s) => {
                  const active = form.mcp_servers.includes(s.id)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          mcp_servers: active
                            ? f.mcp_servers.filter((id) => id !== s.id)
                            : [...f.mcp_servers, s.id],
                        }))
                      }
                      className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors text-left ${
                        active
                          ? 'border-cyan-500 bg-cyan-500/15 text-cyan-300'
                          : 'border-[#2d3148] bg-[#0f1117] text-slate-400 hover:border-[#3d4168] hover:text-slate-300'
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${active ? 'bg-cyan-400' : 'bg-slate-600'}`} />
                      <span className="font-medium truncate">{s.name}</span>
                      <span className="ml-auto text-[10px] text-slate-600 flex-shrink-0">{s.transport}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={handleSubmit} className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 transition-colors">
              <Check className="h-3.5 w-3.5" /> {editingId ? 'Update' : 'Create'}
            </button>
            <button onClick={cancelForm} className="flex items-center gap-1 rounded-lg border border-[#2d3148] px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors">
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {agents.length === 0 && (
          <p className="p-4 text-center text-xs text-slate-500">No agents yet. Create one above.</p>
        )}
        {agents.map((agent) => (
          <div
            key={agent.id}
            className="rounded-lg border border-[#2d3148] bg-[#141624] overflow-hidden"
          >
            <div
              className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-[#1a1d2e] transition-colors"
              onClick={() => setExpandedId(expandedId === agent.id ? null : agent.id)}
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-100 truncate">{agent.name}</div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>{ALL_MODELS.find((m) => m.value === agent.model)?.label ?? agent.model}</span>
                  {agent.tools && agent.tools.length > 0 && (
                    <span className="flex items-center gap-0.5 text-amber-400">
                      <Wrench className="h-2.5 w-2.5" />
                      {agent.tools.length}
                    </span>
                  )}
                  {agent.mcp_servers && agent.mcp_servers.length > 0 && (
                    <span className="flex items-center gap-0.5 text-cyan-400">
                      <Plug className="h-2.5 w-2.5" />
                      {agent.mcp_servers.length}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setTestingAgentId(testingAgentId === agent.id ? null : agent.id)
                  }}
                  title="Test agent"
                  className={`rounded p-1 transition-colors ${testingAgentId === agent.id ? 'text-indigo-400' : 'text-slate-500 hover:text-indigo-400'}`}
                >
                  <FlaskConical className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); startEdit(agent) }}
                  className="rounded p-1 text-slate-500 hover:text-indigo-400 transition-colors"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={async (e) => {
                    e.stopPropagation()
                    await deleteAgent(agent.id)
                    toast.success(`Agent "${agent.name}" deleted`)
                  }}
                  className="rounded p-1 text-slate-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <ChevronDown className={`h-3.5 w-3.5 text-slate-500 transition-transform ${expandedId === agent.id ? 'rotate-180' : ''}`} />
              </div>
            </div>

            {expandedId === agent.id && (
              <div className="border-t border-[#2d3148] px-3 py-2 space-y-1.5">
                <p className="text-xs text-slate-400 leading-relaxed line-clamp-4">{agent.system_prompt}</p>
                <p className="text-xs text-slate-500">Temperature: {agent.temperature}</p>
                {agent.tools && agent.tools.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {agent.tools.map((t) => {
                      const meta = AVAILABLE_TOOLS.find((at) => at.id === t)
                      return (
                        <span key={t} className="flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-300">
                          {meta?.icon} {meta?.label ?? t}
                        </span>
                      )
                    })}
                  </div>
                )}
                {agent.mcp_servers && agent.mcp_servers.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {agent.mcp_servers.map((sid) => {
                      const s = mcpServers.find((x) => x.id === sid)
                      return (
                        <span key={sid} className="flex items-center gap-1 rounded bg-cyan-500/10 px-1.5 py-0.5 text-xs text-cyan-300">
                          <Plug className="h-2.5 w-2.5" />
                          {s?.name ?? sid.slice(0, 8)}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Drag handle */}
            <div
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/agent-id', agent.id)
                e.dataTransfer.setData('application/agent-name', agent.name)
                e.dataTransfer.effectAllowed = 'copy'
              }}
              className="border-t border-[#2d3148] px-3 py-1.5 text-center text-xs text-slate-600 cursor-grab hover:text-slate-400 hover:bg-[#1a1d2e] transition-colors select-none"
            >
              ⠿ Drag to canvas
            </div>

            {/* Inline test panel */}
            {testingAgentId === agent.id && (
              <AgentTestPanel
                agentId={agent.id}
                agentName={agent.name}
                onClose={() => setTestingAgentId(null)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
