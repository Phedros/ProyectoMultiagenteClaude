import { useRef, useEffect, useState } from 'react'
import { Play, Square, Trash2, ChevronDown } from 'lucide-react'
import { useExecutionStore, ExecutionEvent } from '../../store/executionStore'

interface Props {
  flowId: string | null
}

const EVENT_BADGE_STYLES: Record<string, string> = {
  flow_start:  'bg-blue-500/20 text-blue-300',
  agent_start: 'bg-indigo-500/20 text-indigo-300',
  token:       'bg-slate-500/10 text-slate-400',
  tool_call:   'bg-amber-500/20 text-amber-300',
  tool_result: 'bg-teal-500/20 text-teal-300',
  agent_end:   'bg-purple-500/20 text-purple-300',
  flow_end:    'bg-emerald-500/20 text-emerald-300',
  error:       'bg-red-500/20 text-red-300',
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

export default function ExecutionPanel({ flowId }: Props) {
  const { events, isRunning, finalOutput, startExecution, stopExecution, clearEvents } = useExecutionStore()
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const streamingOutput = events
    .filter((e) => e.type === 'token')
    .map((e) => e.content)
    .join('')

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events.length])

  const handleRun = () => {
    if (!flowId || !input.trim() || isRunning) return
    startExecution(flowId, input)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[#2d3148] px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-200">Execution</h2>
        <button
          onClick={clearEvents}
          className="rounded p-1 text-slate-500 hover:text-slate-300 transition-colors"
          title="Clear log"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

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

      {/* Streaming output */}
      {(isRunning && streamingOutput) && (
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
    </div>
  )
}
