import { memo } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import { Bot, Zap, Wrench } from 'lucide-react'
import { useAgentStore } from '../../store/agentStore'
import { useExecutionStore } from '../../store/executionStore'
import { useCanvasContext } from '../../contexts/CanvasContext'

// Short display names for known models
const MODEL_LABELS: Record<string, string> = {
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o mini',
  'gpt-3.5-turbo': 'GPT-3.5',
  'claude-3-5-sonnet-20241022': 'Claude 3.5 Sonnet',
  'claude-3-5-haiku-20241022': 'Claude 3.5 Haiku',
  'claude-3-opus-20240229': 'Claude 3 Opus',
  'gemini/gemini-2.0-flash': 'Gemini 2.0 Flash',
  'gemini/gemini-1.5-pro': 'Gemini 1.5 Pro',
  'groq/llama-3.1-70b-versatile': 'Llama 3.1 70B',
  'groq/mixtral-8x7b-32768': 'Mixtral 8x7B',
  'groq/gemma2-9b-it': 'Gemma 2 9B',
  'ollama/llama3': 'Llama 3  (local)',
  'ollama/mistral': 'Mistral  (local)',
  'ollama/codellama': 'CodeLlama  (local)',
  'ollama/phi3': 'Phi-3  (local)',
}

interface AgentNodeData {
  agentId: string
  label: string
}

function AgentNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as AgentNodeData
  const agents = useAgentStore((s) => s.agents)
  const activeAgentId = useExecutionStore((s) => s.activeAgentId)
  const { topology, supervisorNodeId } = useCanvasContext()

  const agent = agents.find((a) => a.id === nodeData.agentId)
  const isActive = agent && activeAgentId === agent.id
  const toolCount = agent?.tools?.length ?? 0

  const isHierarchical = topology === 'hierarchical'
  const isSupervisor = isHierarchical && supervisorNodeId === id
  const isWorker = isHierarchical && supervisorNodeId !== null && supervisorNodeId !== id

  return (
    <div
      className={`
        relative min-w-[180px] rounded-xl border-2 bg-[#1a1d2e] px-4 py-3 shadow-lg transition-all duration-200
        ${selected ? 'border-indigo-400 shadow-indigo-500/30' : 'border-[#2d3148]'}
        ${isActive ? 'border-emerald-400 shadow-emerald-500/40 shadow-xl' : ''}
      `}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-indigo-400 !bg-[#1a1d2e]"
      />

      <div className="flex items-center gap-2">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${
            isActive ? 'bg-emerald-500/20' : 'bg-indigo-500/20'
          }`}
        >
          {isActive ? (
            <Zap className="h-4 w-4 text-emerald-400" />
          ) : (
            <Bot className="h-4 w-4 text-indigo-400" />
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-100">
            {nodeData.label || 'Agent'}
          </div>
          <div className="flex items-center gap-2">
            {agent && (
              <div className="truncate text-xs text-slate-400">
                {MODEL_LABELS[agent.model] ?? agent.model}
              </div>
            )}
            {toolCount > 0 && (
              <div className="flex items-center gap-0.5 text-xs text-amber-400">
                <Wrench className="h-2.5 w-2.5" />
                {toolCount}
              </div>
            )}
          </div>
        </div>
      </div>

      {isActive && (
        <div className="mt-2 flex items-center gap-1.5">
          <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          <span className="text-xs text-emerald-400">Running...</span>
        </div>
      )}

      {!agent && (
        <div className="mt-1 text-xs text-amber-400">Agent not found</div>
      )}

      {isSupervisor && (
        <div className="mt-2 inline-flex items-center rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-300">
          Supervisor
        </div>
      )}
      {isWorker && (
        <div className="mt-2 inline-flex items-center rounded-full bg-slate-600/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
          Worker
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-indigo-400 !bg-[#1a1d2e]"
      />
    </div>
  )
}

export default memo(AgentNode)
