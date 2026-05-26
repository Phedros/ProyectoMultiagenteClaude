import { useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import AgentPanel from './components/panels/AgentPanel'
import ExecutionPanel from './components/panels/ExecutionPanel'
import FlowCanvas from './components/FlowCanvas'
import { Bot, Cpu, Zap } from 'lucide-react'

type SideTab = 'agents' | 'execution'

export default function App() {
  const [activeFlowId, setActiveFlowId] = useState<string | null>(null)
  const [sideTab, setSideTab] = useState<SideTab>('agents')

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0f1117]">
      {/* Top bar */}
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
        {/* Left sidebar */}
        <aside className="flex w-72 flex-shrink-0 flex-col border-r border-[#2d3148] bg-[#141624]">
          {/* Tab switcher */}
          <div className="flex border-b border-[#2d3148]">
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
          </div>

          <div className="flex-1 overflow-hidden">
            {sideTab === 'agents' ? (
              <AgentPanel />
            ) : (
              <ExecutionPanel flowId={activeFlowId} />
            )}
          </div>
        </aside>

        {/* Main canvas */}
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
