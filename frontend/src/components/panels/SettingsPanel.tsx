import { useState, useEffect } from 'react'
import {
  settingsApi, ProviderKeys, SetKeysPayload,
  mcpApi, MCPServer, MCPServerCreate,
} from '../../services/api'
import {
  CheckCircle, Circle, Eye, EyeOff, Save,
  Plus, Trash2, Zap, ChevronDown, ChevronUp, Loader2, X,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Provider keys section
// ---------------------------------------------------------------------------

interface ProviderConfig {
  id: keyof SetKeysPayload
  label: string
  placeholder: string
  docs: string
  color: string
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    placeholder: 'sk-...',
    docs: 'https://platform.openai.com/api-keys',
    color: 'text-emerald-400',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    placeholder: 'sk-ant-...',
    docs: 'https://console.anthropic.com/settings/keys',
    color: 'text-orange-400',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    placeholder: 'AIza...',
    docs: 'https://aistudio.google.com/app/apikey',
    color: 'text-blue-400',
  },
  {
    id: 'groq',
    label: 'Groq',
    placeholder: 'gsk_...',
    docs: 'https://console.groq.com/keys',
    color: 'text-purple-400',
  },
]

// ---------------------------------------------------------------------------
// MCP form state (new / edit)
// ---------------------------------------------------------------------------

interface MCPFormState {
  name: string
  transport: 'stdio' | 'sse'
  command: string
  args: string           // space-separated, split on save
  env_vars: string       // KEY=VALUE one per line
  url: string
}

const emptyMCPForm = (): MCPFormState => ({
  name: '',
  transport: 'stdio',
  command: '',
  args: '',
  env_vars: '',
  url: '',
})

function parseMCPForm(form: MCPFormState): MCPServerCreate {
  const args = form.args.trim() ? form.args.trim().split(/\s+/) : []
  const env_vars: Record<string, string> = {}
  for (const line of form.env_vars.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || !trimmed.includes('=')) continue
    const idx = trimmed.indexOf('=')
    env_vars[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim()
  }
  return {
    name: form.name.trim(),
    transport: form.transport,
    command: form.transport === 'stdio' ? form.command.trim() || undefined : undefined,
    args: form.transport === 'stdio' ? args : [],
    env_vars,
    url: form.transport === 'sse' ? form.url.trim() || undefined : undefined,
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SettingsPanel() {
  // ── API keys ───────────────────────────────────────────────────────────────
  const [configured, setConfigured] = useState<ProviderKeys | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [show, setShow] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState(false)

  // ── MCP servers ────────────────────────────────────────────────────────────
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([])
  const [showMCPForm, setShowMCPForm] = useState(false)
  const [mcpForm, setMcpForm] = useState<MCPFormState>(emptyMCPForm())
  const [mcpSaving, setMcpSaving] = useState(false)
  const [mcpError, setMcpError] = useState('')
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; msg: string }>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const loadKeys = async () => {
    try { setConfigured(await settingsApi.getKeys()) } catch { /* not up yet */ }
  }

  const loadMCP = async () => {
    try { setMcpServers(await mcpApi.list()) } catch { /* ignore */ }
  }

  useEffect(() => {
    loadKeys()
    loadMCP()
  }, [])

  // ── Save API keys ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    const payload: SetKeysPayload = {}
    for (const p of PROVIDERS) {
      const v = values[p.id]?.trim()
      if (v) (payload as Record<string, string>)[p.id] = v
    }
    if (Object.keys(payload).length === 0) return
    setSaving(true)
    try {
      await settingsApi.setKeys(payload)
      setValues({})
      await loadKeys()
      setSavedMsg(true)
      setTimeout(() => setSavedMsg(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  // ── MCP server CRUD ────────────────────────────────────────────────────────
  const handleMCPCreate = async () => {
    setMcpError('')
    if (!mcpForm.name.trim()) { setMcpError('Name is required'); return }
    if (mcpForm.transport === 'stdio' && !mcpForm.command.trim()) {
      setMcpError('Command is required for stdio transport'); return
    }
    if (mcpForm.transport === 'sse' && !mcpForm.url.trim()) {
      setMcpError('URL is required for SSE transport'); return
    }
    setMcpSaving(true)
    try {
      await mcpApi.create(parseMCPForm(mcpForm))
      await loadMCP()
      setShowMCPForm(false)
      setMcpForm(emptyMCPForm())
    } catch (e: unknown) {
      setMcpError(e instanceof Error ? e.message : 'Failed to create server')
    } finally {
      setMcpSaving(false)
    }
  }

  const handleMCPDelete = async (id: string) => {
    await mcpApi.delete(id)
    setMcpServers((s) => s.filter((x) => x.id !== id))
    setTestResults((r) => { const copy = { ...r }; delete copy[id]; return copy })
  }

  const handleMCPTest = async (id: string) => {
    setTestingId(id)
    try {
      const result = await mcpApi.test(id)
      setTestResults((r) => ({
        ...r,
        [id]: result.ok
          ? { ok: true, msg: `${result.tool_count} tool(s): ${result.tools?.join(', ')}` }
          : { ok: false, msg: result.error || 'Connection failed' },
      }))
    } catch (e: unknown) {
      setTestResults((r) => ({
        ...r,
        [id]: { ok: false, msg: e instanceof Error ? e.message : 'Error' },
      }))
    } finally {
      setTestingId(null)
    }
  }

  const hasAnyValue = PROVIDERS.some((p) => values[p.id]?.trim())

  return (
    <div className="flex flex-col gap-0 overflow-y-auto">
      {/* ── API Keys header ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 border-b border-[#2d3148] bg-[#141624] px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">API Keys</h2>
        <p className="mt-0.5 text-[11px] text-slate-600 leading-snug">
          Keys are kept in server memory only — not written to disk.
        </p>
      </div>

      <div className="space-y-1 px-3 py-3">
        {PROVIDERS.map((p) => {
          const isSet = configured?.[p.id] ?? false
          const isVisible = show[p.id]
          return (
            <div key={p.id} className="rounded-xl border border-[#2d3148] bg-[#0f1117] p-3 space-y-2">
              <div className="flex items-center gap-2">
                {isSet ? (
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                ) : (
                  <Circle className="h-3.5 w-3.5 text-slate-600 flex-shrink-0" />
                )}
                <span className={`text-sm font-semibold ${p.color}`}>{p.label}</span>
                <span className={`ml-auto text-xs ${isSet ? 'text-emerald-400' : 'text-slate-600'}`}>
                  {isSet ? 'configured' : 'not set'}
                </span>
              </div>
              <div className="relative">
                <input
                  type={isVisible ? 'text' : 'password'}
                  className="w-full rounded-lg border border-[#2d3148] bg-[#141624] px-3 py-1.5 pr-8 text-xs text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none font-mono"
                  placeholder={isSet ? '••••••  (enter new value to update)' : p.placeholder}
                  value={values[p.id] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [p.id]: e.target.value }))}
                  autoComplete="off"
                />
                <button
                  tabIndex={-1}
                  onClick={() => setShow((s) => ({ ...s, [p.id]: !s[p.id] }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400"
                >
                  {isVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              <a
                href={p.docs}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-slate-600 hover:text-indigo-400 transition-colors"
              >
                Get API key →
              </a>
            </div>
          )
        })}

        {/* Ollama note */}
        <div className="rounded-xl border border-[#2d3148] bg-[#0f1117] p-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-sm font-semibold text-slate-300">Ollama</span>
            <span className="ml-auto text-xs text-emerald-400">local — no key needed</span>
          </div>
          <p className="mt-1.5 text-[10px] text-slate-600 leading-snug">
            Make sure Ollama is running on{' '}
            <span className="font-mono text-slate-500">http://localhost:11434</span> and
            has the desired model pulled.
          </p>
        </div>
      </div>

      {/* Save button */}
      <div className="border-t border-[#2d3148] bg-[#141624] px-3 py-3">
        {savedMsg && (
          <p className="mb-2 text-center text-xs text-emerald-400">✓ Keys saved to server memory</p>
        )}
        <button
          onClick={handleSave}
          disabled={saving || !hasAnyValue}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? 'Saving…' : 'Save Keys'}
        </button>
      </div>

      {/* ── MCP Servers section ──────────────────────────────────────────────── */}
      <div className="border-t border-[#2d3148]">
        <div className="flex items-center gap-2 px-4 py-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">MCP Servers</h2>
            <p className="mt-0.5 text-[11px] text-slate-600 leading-snug">
              Connect to Model Context Protocol servers to give agents external tools.
            </p>
          </div>
          <button
            onClick={() => { setShowMCPForm((v) => !v); setMcpError('') }}
            className="ml-auto flex items-center gap-1 rounded-lg bg-indigo-600/20 px-2 py-1 text-xs text-indigo-400 hover:bg-indigo-600/40 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>

        {/* Add form */}
        {showMCPForm && (
          <div className="mx-3 mb-3 rounded-xl border border-indigo-500/30 bg-[#0f1117] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-indigo-400">New MCP Server</span>
              <button onClick={() => setShowMCPForm(false)} className="text-slate-600 hover:text-slate-400">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Name */}
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">Name</label>
              <input
                className="mt-0.5 w-full rounded-lg border border-[#2d3148] bg-[#141624] px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
                placeholder="my-filesystem-server"
                value={mcpForm.name}
                onChange={(e) => setMcpForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            {/* Transport toggle */}
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">Transport</label>
              <div className="mt-0.5 flex rounded-lg border border-[#2d3148] overflow-hidden">
                {(['stdio', 'sse'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setMcpForm((f) => ({ ...f, transport: t }))}
                    className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                      mcpForm.transport === t
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* stdio fields */}
            {mcpForm.transport === 'stdio' && (
              <>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider">Command</label>
                  <input
                    className="mt-0.5 w-full rounded-lg border border-[#2d3148] bg-[#141624] px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none font-mono"
                    placeholder="npx"
                    value={mcpForm.command}
                    onChange={(e) => setMcpForm((f) => ({ ...f, command: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider">
                    Args <span className="normal-case text-slate-600">(space-separated)</span>
                  </label>
                  <input
                    className="mt-0.5 w-full rounded-lg border border-[#2d3148] bg-[#141624] px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none font-mono"
                    placeholder="-y @modelcontextprotocol/server-filesystem /path"
                    value={mcpForm.args}
                    onChange={(e) => setMcpForm((f) => ({ ...f, args: e.target.value }))}
                  />
                </div>
              </>
            )}

            {/* sse field */}
            {mcpForm.transport === 'sse' && (
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider">URL</label>
                <input
                  className="mt-0.5 w-full rounded-lg border border-[#2d3148] bg-[#141624] px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none font-mono"
                  placeholder="http://localhost:3000/sse"
                  value={mcpForm.url}
                  onChange={(e) => setMcpForm((f) => ({ ...f, url: e.target.value }))}
                />
              </div>
            )}

            {/* Env vars */}
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">
                Env vars <span className="normal-case text-slate-600">(KEY=VALUE, one per line)</span>
              </label>
              <textarea
                rows={2}
                className="mt-0.5 w-full rounded-lg border border-[#2d3148] bg-[#141624] px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none font-mono resize-none"
                placeholder={"API_KEY=abc123\nANOTHER=value"}
                value={mcpForm.env_vars}
                onChange={(e) => setMcpForm((f) => ({ ...f, env_vars: e.target.value }))}
              />
            </div>

            {mcpError && <p className="text-[10px] text-red-400">{mcpError}</p>}

            <button
              onClick={handleMCPCreate}
              disabled={mcpSaving}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors"
            >
              {mcpSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              {mcpSaving ? 'Creating…' : 'Create Server'}
            </button>
          </div>
        )}

        {/* Server list */}
        <div className="space-y-1.5 px-3 pb-4">
          {mcpServers.length === 0 && (
            <p className="text-center text-[11px] text-slate-600 py-3">
              No MCP servers configured yet.
            </p>
          )}
          {mcpServers.map((s) => {
            const tr = testResults[s.id]
            const expanded = expandedId === s.id
            return (
              <div key={s.id} className="rounded-xl border border-[#2d3148] bg-[#0f1117] overflow-hidden">
                {/* Header row */}
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <span className={`h-2 w-2 rounded-full flex-shrink-0 ${
                    tr ? (tr.ok ? 'bg-emerald-400' : 'bg-red-400') : 'bg-slate-600'
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-200 truncate">{s.name}</p>
                    <p className="text-[10px] text-slate-600 font-mono truncate">
                      {s.transport === 'stdio'
                        ? `${s.command} ${s.args?.join(' ')}`
                        : s.url}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Test button */}
                    <button
                      onClick={() => handleMCPTest(s.id)}
                      disabled={testingId === s.id}
                      title="Test connection"
                      className="rounded p-1 text-slate-500 hover:text-yellow-400 transition-colors disabled:opacity-40"
                    >
                      {testingId === s.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Zap className="h-3.5 w-3.5" />}
                    </button>
                    {/* Expand */}
                    <button
                      onClick={() => setExpandedId(expanded ? null : s.id)}
                      className="rounded p-1 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {expanded
                        ? <ChevronUp className="h-3.5 w-3.5" />
                        : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                    {/* Delete */}
                    <button
                      onClick={() => handleMCPDelete(s.id)}
                      title="Delete server"
                      className="rounded p-1 text-slate-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Test result */}
                {tr && (
                  <div className={`px-3 pb-1.5 text-[10px] ${tr.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                    {tr.ok ? '✓ ' : '✗ '}{tr.msg}
                  </div>
                )}

                {/* Expanded details */}
                {expanded && (
                  <div className="border-t border-[#2d3148] px-3 py-2 space-y-1 text-[10px] text-slate-500 font-mono">
                    <p><span className="text-slate-600">transport:</span> {s.transport}</p>
                    {s.command && <p><span className="text-slate-600">command:</span> {s.command}</p>}
                    {s.args?.length > 0 && <p><span className="text-slate-600">args:</span> {s.args.join(' ')}</p>}
                    {s.url && <p><span className="text-slate-600">url:</span> {s.url}</p>}
                    {s.env_vars && Object.keys(s.env_vars).length > 0 && (
                      <p><span className="text-slate-600">env:</span>{' '}
                        {Object.keys(s.env_vars).join(', ')}
                      </p>
                    )}
                    <p><span className="text-slate-600">id:</span> {s.id}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
