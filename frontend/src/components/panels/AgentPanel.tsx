import { useState, useEffect } from 'react'
import { Plus, Trash2, Edit2, X, Check, ChevronDown, Wrench } from 'lucide-react'
import { useAgentStore } from '../../store/agentStore'
import { Agent } from '../../services/api'

const MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-3.5-turbo',
]

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
}

const DEFAULT_FORM: FormState = {
  name: '',
  system_prompt: 'You are a helpful assistant.',
  model: 'gpt-4o-mini',
  temperature: 0.7,
  tools: [],
}

function toggleTool(tools: string[], toolId: string): string[] {
  return tools.includes(toolId) ? tools.filter((t) => t !== toolId) : [...tools, toolId]
}

export default function AgentPanel() {
  const { agents, fetchAgents, createAgent, updateAgent, deleteAgent } = useAgentStore()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => { fetchAgents() }, [fetchAgents])

  const handleSubmit = async () => {
    if (!form.name.trim()) return
    if (editingId) {
      await updateAgent(editingId, form)
      setEditingId(null)
    } else {
      await createAgent(form)
    }
    setForm(DEFAULT_FORM)
    setShowForm(false)
  }

  const startEdit = (agent: Agent) => {
    setForm({
      name: agent.name,
      system_prompt: agent.system_prompt,
      model: agent.model,
      temperature: agent.temperature,
      tools: agent.tools ?? [],
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

          {/* Model */}
          <select
            className="w-full rounded-lg border border-[#2d3148] bg-[#0f1117] px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
            value={form.model}
            onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
          >
            {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>

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
                  <span>{agent.model}</span>
                  {agent.tools && agent.tools.length > 0 && (
                    <span className="flex items-center gap-0.5 text-amber-400">
                      <Wrench className="h-2.5 w-2.5" />
                      {agent.tools.length}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); startEdit(agent) }}
                  className="rounded p-1 text-slate-500 hover:text-indigo-400 transition-colors"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteAgent(agent.id) }}
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
          </div>
        ))}
      </div>
    </div>
  )
}
