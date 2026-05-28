import { useRef, useEffect, useState, useCallback } from 'react'
import {
  Play, Square, Trash2, ChevronDown, Brain, X, History,
  Clock, CheckCircle, AlertCircle, Bug, StepForward,
} from 'lucide-react'
import { useExecutionStore, ExecutionEvent } from '../../store/executionStore'
import { memoryApi, MemoryMessage, runsApi, ExecutionRun } from '../../services/api'

interface Props {
  flowId: string | null
}

const EVENT_BADGE_STYLES: Record<string, string> = {
  flow_start:      'bg-blue-500/20 text-blue-300',
  agent_start:     'bg-indigo-500/20 text-indigo-300',
  token:           'bg-slate-500/10 text-slate-400',
  tool_call:       'bg-amber-500/20 text-amber-300',
  tool_result:     'bg-teal-500/20 text-teal-300',
  agent_end:       'bg-purple-500/20 text-purple-300',
  condition_eval:  'bg-orange-500/20 text-orange-300',
  loop_iter:       'bg-cyan-500/20 text-cyan-300',
  loop_exit:       'bg-teal-500/20 text-teal-300',
  usage:           'bg-slate-600/30 text-slate-400',
  flow_end:        'bg-emerald-500/20 text-emerald-300',
  error:           'bg-red-500/20 text-red-300',
  step_pause:      'bg-yellow-500/20 text-yellow-300',
}

function EventBadge({ type }: { type: string }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-mono font-medium ${EVENT_BADGE_STYLES[type] ?? 'bg-slate-500/20 text-slate-400'}`}>
      {type}
    </span>
  )
}

function ToolCallRow({ event }: { event: ExecutionEvent }) {
  let toolName = ''
  let args: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(event.content)
    toolName = parsed.tool ?? ''
    args = parsed.args ?? {}
  } catch {
    toolName = event.content
  }

  return (
    <div className="border-b border-[#1e2130] py-2 px-3">
      <div className="flex items-center gap-2">
        <EventBadge type="tool_call" />
        {event.agentName && <span className="text-xs font-medium text-slate-300">{event.agentName}</span>}
        <span className="text-xs font-mono text-amber-400">→ {toolName}</span>
      </div>
      {Object.keys(args).length > 0 && (
        <pre className="mt-1 text-xs text-slate-500 font-mono leading-relaxed whitespace-pre-wrap break-all">
          {JSON.stringify(args, null, 2)}
        </pre>
      )}
    </div>
  )
}

function ToolResultRow({ event }: { event: ExecutionEvent }) {
  const [expanded, setExpanded] = useState(false)
  const preview = event.content.slice(0, 200)
  const hasMore = event.content.length > 200

  return (
    <div className="border-b border-[#1e2130] py-2 px-3">
      <div className="flex items-center gap-2">
        <EventBadge type="tool_result" />
        {event.agentName && <span className="text-xs font-medium text-slate-300">{event.agentName}</span>}
      </div>
      <pre className="mt-1 text-xs text-teal-400/70 font-mono leading-relaxed whitespace-pre-wrap break-all">
        {expanded ? event.content : preview}
        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="ml-1 text-indigo-400 hover:text-indigo-300 not-italic"
          >
            {expanded ? ' less' : '...more'}
            <ChevronDown className={`inline h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}
      </pre>
    </div>
  )
}

function EventRow({ event }: { event: ExecutionEvent }) {
  const [expanded, setExpanded] = useState(false)

  if (event.type === 'token') return null
  if (event.type === 'tool_call') return <ToolCallRow event={event} />
  if (event.type === 'tool_result') return <ToolResultRow event={event} />

  const preview = event.content.slice(0, 120)
  const hasMore = event.content.length > 120

  return (
    <div className="border-b border-[#1e2130] py-2 px-3">
      <div className="flex items-start gap-2">
        <EventBadge type={event.type} />
        {event.agentName && (
          <span className="text-xs font-medium text-slate-300">{event.agentName}</span>
        )}
      </div>
      {event.content && (
        <div className="mt-1.5 text-xs text-slate-400 leading-relaxed">
          <span className="whitespace-pre-wrap">{expanded ? event.content : preview}</span>
          {hasMore && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="ml-1 inline-flex items-center gap-0.5 text-indigo-400 hover:text-indigo-300"
            >
              {expanded ? 'less' : '...more'}
              <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Memory panel ───────────────────────────────────────────────────────────────

function MemoryPanel({ flowId, onCleared }: { flowId: string; onCleared: () => void }) {
  const [messages, setMessages] = useState<MemoryMessage[]>([])
  const [show, setShow] = useState(false)
  const [clearing, setClearing] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await memoryApi.get(flowId)
      setMessages(data)
    } catch {
      setMessages([])
    }
  }, [flowId])

  useEffect(() => { load() }, [load])

  const handleClear = async () => {
    setClearing(true)
    try {
      await memoryApi.clear(flowId)
      setMessages([])
      onCleared()
    } finally {
      setClearing(false)
    }
  }

  const turns = Math.floor(messages.length / 2)

  return (
    <div className="border-b border-[#2d3148] bg-[#0d0f19]">
      <div className="flex items-center gap-2 px-3 py-2">
        <Brain className="h-3.5 w-3.5 text-violet-400" />
        <span className="text-xs text-slate-400">
          Memory:{' '}
          <span className={turns > 0 ? 'text-violet-300 font-medium' : 'text-slate-500'}>
            {turns > 0 ? `${turns} turn${turns !== 1 ? 's' : ''}` : 'empty'}
          </span>
        </span>

        {turns > 0 && (
          <>
            <button
              onClick={() => setShow(!show)}
              className="ml-auto text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-0.5"
            >
              {show ? 'hide' : 'view'}
              <ChevronDown className={`h-3 w-3 transition-transform ${show ? 'rotate-180' : ''}`} />
            </button>
            <button
              onClick={handleClear}
              disabled={clearing}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-400 transition-colors disabled:opacity-40"
              title="Clear memory"
            >
              <X className="h-3 w-3" />
              {clearing ? 'clearing…' : 'clear'}
            </button>
          </>
        )}
      </div>

      {show && turns > 0 && (
        <div className="max-h-48 overflow-y-auto border-t border-[#1e2130]">
          {messages.map((msg) => (
            <div key={msg.id} className={`px-3 py-2 border-b border-[#1e2130] ${msg.role === 'user' ? 'bg-[#0f1117]' : 'bg-[#0d0f19]'}`}>
              <div className={`text-xs font-medium mb-0.5 ${msg.role === 'user' ? 'text-indigo-400' : 'text-violet-400'}`}>
                {msg.role === 'user' ? '👤 You' : '🤖 Flow'}
              </div>
              <p className="text-xs text-slate-400 leading-relaxed line-clamp-3 whitespace-pre-wrap">
                {msg.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Runs history panel ─────────────────────────────────────────────────────────

function fmtDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function RunsPanel({ flowId, runsKey }: { flowId: string; runsKey: number }) {
  const [runs, setRuns] = useState<ExecutionRun[]>([])
  const [selected, setSelected] = useState<ExecutionRun | null>(null)

  useEffect(() => {
    runsApi.list(flowId).then(setRuns).catch(() => setRuns([]))
  }, [flowId, runsKey])

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await runsApi.delete(id)
    setRuns((rs) => rs.filter((r) => r.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  if (runs.length === 0) {
    return <p className="p-6 text-center text-xs text-slate-600">No runs yet for this flow.</p>
  }

  if (selected) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[#2d3148]">
          <button onClick={() => setSelected(null)} className="text-xs text-indigo-400 hover:text-indigo-300">← Back</button>
          <span className="text-xs text-slate-500">{fmtDate(selected.created_at)}</span>
          <span className={`ml-auto text-xs px-1.5 py-0.5 rounded ${selected.status === 'completed' ? 'text-emerald-300 bg-emerald-500/10' : 'text-red-300 bg-red-500/10'}`}>
            {selected.status}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <div>
            <div className="text-xs font-medium text-indigo-400 mb-1">Input</div>
            <pre className="text-xs text-slate-300 whitespace-pre-wrap bg-[#0f1117] rounded p-2 leading-relaxed">{selected.input_text}</pre>
          </div>
          {selected.output_text && (
            <div>
              <div className="text-xs font-medium text-emerald-400 mb-1">Output</div>
              <pre className="text-xs text-slate-300 whitespace-pre-wrap bg-[#0f1117] rounded p-2 leading-relaxed max-h-64 overflow-y-auto">{selected.output_text}</pre>
            </div>
          )}
          {selected.error_message && (
            <div>
              <div className="text-xs font-medium text-red-400 mb-1">Error</div>
              <pre className="text-xs text-red-300 whitespace-pre-wrap bg-red-500/5 rounded p-2">{selected.error_message}</pre>
            </div>
          )}
          <div className="flex flex-wrap gap-3 text-xs text-slate-500">
            <span>⏱ {fmtDuration(selected.duration_ms)}</span>
            <span>🤖 {selected.agent_count} agent{selected.agent_count !== 1 ? 's' : ''}</span>
            <span>📐 {selected.topology}</span>
            {(selected.prompt_tokens > 0 || selected.completion_tokens > 0) && (
              <span title={`${selected.prompt_tokens} prompt + ${selected.completion_tokens} completion`}>
                🔤 {(selected.prompt_tokens + selected.completion_tokens).toLocaleString()} tokens
              </span>
            )}
            {selected.estimated_cost_usd > 0 && (
              <span className="text-emerald-500">
                💵 ${selected.estimated_cost_usd < 0.001
                  ? selected.estimated_cost_usd.toExponential(2)
                  : selected.estimated_cost_usd.toFixed(4)}
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {runs.map((run) => (
        <div
          key={run.id}
          onClick={() => setSelected(run)}
          className="flex items-start gap-2 border-b border-[#1e2130] px-3 py-2.5 hover:bg-[#1a1d2e] cursor-pointer transition-colors"
        >
          {run.status === 'completed'
            ? <CheckCircle className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
            : <AlertCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0 mt-0.5" />
          }
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-300 truncate">{run.input_text}</p>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-600">
              <Clock className="h-2.5 w-2.5" />
              {fmtDate(run.created_at)}
              <span>·</span>
              {fmtDuration(run.duration_ms)}
              {run.estimated_cost_usd > 0 && (
                <>
                  <span>·</span>
                  <span className="text-emerald-600">
                    ${run.estimated_cost_usd < 0.001
                      ? run.estimated_cost_usd.toExponential(1)
                      : run.estimated_cost_usd.toFixed(4)}
                  </span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={(e) => handleDelete(e, run.id)}
            className="flex-shrink-0 rounded p-0.5 text-slate-600 hover:text-red-400 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function ExecutionPanel({ flowId }: Props) {
  const {
    events, isRunning, finalOutput,
    debugMode, isPaused, pausedAgentName,
    startExecution, stopExecution, continueStep,
    setDebugMode, clearEvents,
  } = useExecutionStore()

  const [input, setInput] = useState('')
  const [memoryKey, setMemoryKey] = useState(0)
  const [runsKey, setRunsKey] = useState(0)
  const [tab, setTab] = useState<'live' | 'history'>('live')
  const bottomRef = useRef<HTMLDivElement>(null)

  const streamingOutput = events
    .filter((e) => e.type === 'token')
    .map((e) => e.content)
    .join('')

  useEffect(() => {
    if (!isPaused) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events.length, isPaused])

  // Re-fetch memory + runs after each completed run
  useEffect(() => {
    if (!isRunning && finalOutput) {
      setMemoryKey((k) => k + 1)
      setRunsKey((k) => k + 1)
    }
  }, [isRunning, finalOutput])

  const handleRun = () => {
    if (!flowId || !input.trim() || isRunning) return
    startExecution(flowId, input)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header with tab switcher */}
      <div className="flex items-center border-b border-[#2d3148] px-3 py-2 gap-1">
        <button
          onClick={() => setTab('live')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${tab === 'live' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <Play className="h-3 w-3" /> Live
        </button>
        <button
          onClick={() => { setTab('history'); setRunsKey((k) => k + 1) }}
          className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${tab === 'history' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <History className="h-3 w-3" /> History
        </button>
        {tab === 'live' && (
          <button
            onClick={clearEvents}
            className="ml-auto rounded p-1 text-slate-500 hover:text-slate-300 transition-colors"
            title="Clear log"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* History tab */}
      {tab === 'history' && flowId && (
        <RunsPanel flowId={flowId} runsKey={runsKey} />
      )}
      {tab === 'history' && !flowId && (
        <p className="p-6 text-center text-xs text-slate-600">Save a flow to see its run history.</p>
      )}

      {/* Live tab */}
      {tab === 'live' && (<>

      {/* Memory indicator */}
      {flowId && (
        <MemoryPanel
          key={`${flowId}-${memoryKey}`}
          flowId={flowId}
          onCleared={() => setMemoryKey((k) => k + 1)}
        />
      )}

      {/* Input area */}
      <div className="border-b border-[#2d3148] p-3 space-y-2">
        <textarea
          className="w-full rounded-lg border border-[#2d3148] bg-[#0f1117] px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none resize-none"
          placeholder="Enter your task or message..."
          rows={3}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isRunning}
          onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleRun() }}
        />

        {/* Debug toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDebugMode(!debugMode)}
            disabled={isRunning}
            className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors ${
              debugMode
                ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40'
                : 'text-slate-500 hover:text-slate-300 border border-transparent'
            }`}
            title="Step-by-step debug mode: pause after each agent"
          >
            <Bug className="h-3 w-3" />
            Debug
          </button>
          {debugMode && (
            <span className="text-[10px] text-yellow-500/70">pauses after each agent</span>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleRun}
            disabled={!flowId || !input.trim() || isRunning}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Play className="h-4 w-4" />
            {isRunning ? 'Running...' : 'Run Flow'}
          </button>
          {isRunning && (
            <button
              onClick={stopExecution}
              className="flex items-center gap-1 rounded-lg border border-red-500/40 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Square className="h-4 w-4" />
              Stop
            </button>
          )}
        </div>
        {!flowId && (
          <p className="text-xs text-amber-400">Save the flow first to enable execution</p>
        )}
      </div>

      {/* ── Debug pause banner ─────────────────────────────────────────────── */}
      {isPaused && (
        <div className="border-b border-yellow-500/30 bg-yellow-500/10 px-3 py-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
            <span className="text-xs font-semibold text-yellow-300">
              Paused{pausedAgentName ? ` — ${pausedAgentName} finished` : ''}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={continueStep}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-yellow-500/20 border border-yellow-500/40 px-3 py-1.5 text-sm font-medium text-yellow-200 hover:bg-yellow-500/30 transition-colors"
            >
              <StepForward className="h-4 w-4" />
              Continue
            </button>
            <button
              onClick={stopExecution}
              className="flex items-center gap-1 rounded-lg border border-red-500/40 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Square className="h-4 w-4" />
              Stop
            </button>
          </div>
        </div>
      )}

      {/* Streaming output */}
      {(isRunning && !isPaused && streamingOutput) && (
        <div className="border-b border-[#2d3148] bg-[#0f1117] p-3">
          <div className="text-xs text-slate-500 mb-1 flex items-center gap-1.5">
            <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            Streaming...
          </div>
          <pre className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto font-mono">
            {streamingOutput}
          </pre>
        </div>
      )}

      {/* Event log */}
      <div className="flex-1 overflow-y-auto">
        {events.length === 0 && (
          <p className="p-6 text-center text-xs text-slate-600">
            {flowId ? 'No execution yet. Enter a task and click Run.' : 'Select or save a flow to start.'}
          </p>
        )}
        {events.map((ev, i) => <EventRow key={i} event={ev} />)}
        <div ref={bottomRef} />
      </div>

      {/* Final output */}
      {finalOutput && !isRunning && (
        <div className="border-t border-[#2d3148] p-3">
          <div className="text-xs font-medium text-emerald-400 mb-1.5">Final Output</div>
          <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap text-xs text-slate-300 leading-relaxed font-mono bg-[#0f1117] rounded-lg p-2">
            {finalOutput}
          </pre>
        </div>
      )}
      </>)}
    </div>
  )
}
