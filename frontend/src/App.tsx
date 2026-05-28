import { useState, useRef, useCallback, useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import AgentPanel from './components/panels/AgentPanel'
import ExecutionPanel from './components/panels/ExecutionPanel'
import SettingsPanel from './components/panels/SettingsPanel'
import FlowCanvas from './components/FlowCanvas'
import { Bot, Cpu, Zap, Settings, Maximize2, Minimize2 } from 'lucide-react'

// ── Sidebar sizing constants ────────────────────────────────────────────────
const MIN_WIDTH     = 240
const MAX_WIDTH     = 850
const DEFAULT_WIDTH = 288
const STORAGE_KEY   = 'sidebar-width'

type SideTab = 'agents' | 'execution' | 'settings'

function getSavedWidth(): number {
  try {
    const v = parseInt(localStorage.getItem(STORAGE_KEY) ?? '', 10)
    return isNaN(v) ? DEFAULT_WIDTH : Math.min(Math.max(v, MIN_WIDTH), MAX_WIDTH)
  } catch {
    return DEFAULT_WIDTH
  }
}

export default function App() {
  const [activeFlowId, setActiveFlowId] = useState<string | null>(null)
  const [sideTab, setSideTab]           = useState<SideTab>('agents')
  const [sidebarWidth, setSidebarWidth] = useState<number>(getSavedWidth)
  const [isExpanded, setIsExpanded]     = useState(false)
  const [isDragging, setIsDragging]     = useState(false)

  const dragStartX    = useRef(0)
  const dragStartW    = useRef(0)

  // ── Drag-to-resize ────────────────────────────────────────────────────────
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragStartX.current = e.clientX
    dragStartW.current = sidebarWidth
    setIsDragging(true)
  }, [sidebarWidth])

  useEffect(() => {
    if (!isDragging) return

    const onMove = (e: MouseEvent) => {
      const delta    = e.clientX - dragStartX.current
      const newWidth = Math.min(Math.max(dragStartW.current + delta, MIN_WIDTH), MAX_WIDTH)
      setSidebarWidth(newWidth)
      // collapse expand-mode when user manually drags
      setIsExpanded(false)
    }

    const onUp = () => {
      setIsDragging(false)
      setSidebarWidth(w => { localStorage.setItem(STORAGE_KEY, String(w)); return w })
      document.body.style.cursor    = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor    = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }
  }, [isDragging])

  // ── Expand / collapse ─────────────────────────────────────────────────────
  const toggleExpand = () => setIsExpanded(e => !e)

  // Width used by the sidebar — clamp keeps it responsive to viewport resizes
  const computedWidth = isExpanded ? 'clamp(380px, 55vw, 920px)' : `${sidebarWidth}px`

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0f1117]">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="flex h-12 items-center gap-3 border-b border-[#2d3148] bg-[#141624] px-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Cpu className="h-5 w-5 text-indigo-400" />
          <span className="text-sm font-bold text-slate-100">Agent Orchestrator</span>
        </div>
        <span className="text-xs text-slate-500 border border-[#2d3148] rounded px-2 py-0.5">v0.1</span>
        {activeFlowId && (
          <div className="ml-auto flex items-center gap-1.5 text-xs text-emerald-400">
            <Zap className="h-3.5 w-3.5" />
            Flow ready
          </div>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left sidebar ────────────────────────────────────────────────── */}
        <aside
          className="relative flex flex-shrink-0 flex-col border-r border-[#2d3148] bg-[#141624]"
          style={{
            width: computedWidth,
            transition: isDragging ? 'none' : 'width 0.2s ease',
          }}
        >
          {/* Tab switcher */}
          <div className="flex items-stretch border-b border-[#2d3148]">
            <button
              onClick={() => setSideTab('agents')}
              className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                sideTab === 'agents'
                  ? 'border-b-2 border-indigo-500 text-indigo-400'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Bot className="h-3.5 w-3.5" />
              Agents
            </button>

            <button
              onClick={() => setSideTab('execution')}
              className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                sideTab === 'execution'
                  ? 'border-b-2 border-indigo-500 text-indigo-400'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Zap className="h-3.5 w-3.5" />
              Execution
            </button>

            <button
              onClick={() => setSideTab('settings')}
              className={`flex items-center justify-center px-3 py-2.5 text-xs font-medium transition-colors ${
                sideTab === 'settings'
                  ? 'border-b-2 border-indigo-500 text-indigo-400'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
              title="API Keys & Settings"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>

            {/* Expand / collapse — only while on Execution tab */}
            {sideTab === 'execution' && (
              <button
                onClick={toggleExpand}
                title={isExpanded ? 'Collapse panel' : 'Expand panel'}
                className={`flex items-center justify-center px-2.5 transition-colors ${
                  isExpanded
                    ? 'text-indigo-400 hover:text-indigo-300'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {isExpanded
                  ? <Minimize2 className="h-3.5 w-3.5" />
                  : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-hidden">
            {sideTab === 'agents'    && <AgentPanel />}
            {sideTab === 'execution' && <ExecutionPanel flowId={activeFlowId} />}
            {sideTab === 'settings'  && <SettingsPanel />}
          </div>

          {/* ── Drag handle ───────────────────────────────────────────────── */}
          <div
            onMouseDown={handleDragStart}
            className="absolute right-0 top-0 bottom-0 z-10 flex w-2 cursor-col-resize items-center justify-center group"
            title="Drag to resize"
          >
            {/* Visible line: subtle at rest, indigo on hover/drag */}
            <div
              className={`h-full w-px transition-colors ${
                isDragging
                  ? 'bg-indigo-500'
                  : 'bg-[#2d3148] group-hover:bg-indigo-500/60'
              }`}
            />
            {/* Grip dots */}
            <div className="absolute flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-1 w-1 rounded-full bg-indigo-400" />
              ))}
            </div>
          </div>
        </aside>

        {/* ── Main canvas ──────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-hidden">
          <ReactFlowProvider>
            <FlowCanvas
              onFlowSaved={(id) => setActiveFlowId(id || null)}
              activeFlowId={activeFlowId}
            />
          </ReactFlowProvider>
        </main>
      </div>
    </div>
  )
}
