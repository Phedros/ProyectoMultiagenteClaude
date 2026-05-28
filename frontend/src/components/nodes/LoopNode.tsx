import { memo, useState, useCallback } from 'react'
import { Handle, Position, NodeProps, useReactFlow } from '@xyflow/react'
import { RefreshCw } from 'lucide-react'

const CONDITION_HINT =
  'e.g. contains:done\nnot_contains:error\nlength_gt:200\nregex:\\d+ items'

function LoopNode({ id, data, selected }: NodeProps) {
  const { setNodes } = useReactFlow()
  const label          = (data.label         as string) ?? 'Loop'
  const maxIterations  = (data.max_iterations as number) ?? 3
  const exitCondition  = (data.exit_condition as string) ?? ''

  const [editingLabel, setEditingLabel] = useState(false)

  const updateData = useCallback(
    (patch: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
        ),
      )
    },
    [id, setNodes],
  )

  return (
    <div
      className={`
        relative min-w-[210px] rounded-xl border-2 bg-[#1a1d2e] shadow-lg transition-all duration-200
        ${selected ? 'border-cyan-400 shadow-cyan-500/30' : 'border-cyan-600/60'}
      `}
    >
      {/* Input handle — top */}
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-cyan-400 !bg-[#1a1d2e]"
      />

      {/* Header */}
      <div className="flex items-center gap-2 border-b border-cyan-600/30 px-3 py-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-cyan-500/20">
          <RefreshCw className="h-3.5 w-3.5 text-cyan-400" />
        </div>
        {editingLabel ? (
          <input
            autoFocus
            className="flex-1 bg-transparent text-sm font-semibold text-slate-100 outline-none"
            value={label}
            onChange={(e) => updateData({ label: e.target.value })}
            onBlur={() => setEditingLabel(false)}
            onKeyDown={(e) => { if (e.key === 'Enter') setEditingLabel(false) }}
          />
        ) : (
          <span
            className="flex-1 cursor-text text-sm font-semibold text-slate-100"
            onDoubleClick={() => setEditingLabel(true)}
          >
            {label || 'Loop'}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-3 py-2 space-y-2">
        {/* Max iterations */}
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500 w-20 flex-shrink-0">
            Max iters
          </label>
          <input
            type="number"
            min={1}
            max={20}
            className="nodrag w-full rounded-md border border-[#2d3148] bg-[#0f1117] px-2 py-1 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
            value={maxIterations}
            onChange={(e) =>
              updateData({ max_iterations: Math.min(20, Math.max(1, parseInt(e.target.value) || 1)) })
            }
          />
        </div>

        {/* Exit condition (optional) */}
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Exit condition <span className="normal-case text-slate-600">(optional — stop early)</span>
          </label>
          <textarea
            className="nodrag w-full resize-none rounded-md border border-[#2d3148] bg-[#0f1117] px-2 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:border-cyan-500 focus:outline-none leading-relaxed"
            rows={2}
            placeholder={CONDITION_HINT}
            value={exitCondition}
            onChange={(e) => updateData({ exit_condition: e.target.value })}
          />
        </div>
      </div>

      {/* Handle labels */}
      <div className="flex justify-between px-3 pb-2 text-[10px] font-bold">
        <span className="text-cyan-400">BODY</span>
        <span className="text-emerald-400">EXIT</span>
      </div>

      {/* Body handle — bottom-left (cyan) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="body"
        style={{ left: '25%', bottom: -6 }}
        className="!h-3 !w-3 !border-2 !border-cyan-400 !bg-[#1a1d2e]"
      />

      {/* Exit handle — bottom-right (emerald) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="exit"
        style={{ left: '75%', bottom: -6 }}
        className="!h-3 !w-3 !border-2 !border-emerald-400 !bg-[#1a1d2e]"
      />
    </div>
  )
}

export default memo(LoopNode)
