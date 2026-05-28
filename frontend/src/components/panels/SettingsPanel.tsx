import { useState, useEffect } from 'react'
import { settingsApi, ProviderKeys, SetKeysPayload } from '../../services/api'
import { CheckCircle, Circle, Eye, EyeOff, Save } from 'lucide-react'

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

export default function SettingsPanel() {
  const [configured, setConfigured] = useState<ProviderKeys | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [show, setShow] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState(false)

  const load = async () => {
    try {
      const keys = await settingsApi.getKeys()
      setConfigured(keys)
    } catch {
      /* backend may not be up yet */
    }
  }

  useEffect(() => { load() }, [])

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
      setValues({})            // clear inputs after save
      await load()             // refresh status indicators
      setSavedMsg(true)
      setTimeout(() => setSavedMsg(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  const hasAnyValue = PROVIDERS.some((p) => values[p.id]?.trim())

  return (
    <div className="flex flex-col gap-0 overflow-y-auto">
      {/* Header */}
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
              {/* Provider header */}
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

              {/* Key input */}
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
      <div className="sticky bottom-0 border-t border-[#2d3148] bg-[#141624] px-3 py-3">
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
    </div>
  )
}
