import { memo, useState, useCallback } from 'react'
import { Handle, Position, NodeProps, useReactFlow } from '@xyflow/react'
import { GitBranch } from 'lucide-react'

const CONDITION_PLACEHOLDER =
  'e.g. contains:error\nnot_contains:success\nstarts_with:yes\nregex:\\d+\nlength_gt:100'

function ConditionNode({ id, data, selected }: NodeProps) {
  const { setNodes } = useReactFlow()
  const condition = (data.condition as string) ?? ''
  const label = (data.label as string) ?? 'Condition'

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
        relative min-w-[200px] rounded-xl border-2 bg-[#1a1d2e] shadow-lg transition-all duration-200
        ${selected ? 'border-amber-400 shadow-amber-500/30' : 'border-amber-600/60'}
      `}
    >
      {/* Input handle — top */}
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-amber-400 !bg-[#1a1d2e]"
      />

      {/* Header */}
      <div className="flex items-center gap-2 border-b border-amber-600/30 px-3 py-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/20">
          <GitBranch className="h-3.5 w-3.5 text-amber-400" />
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
            {label || 'Condition'}
          </span>
        )}
      </div>

      {/* Condition input */}
      <div className="px-3 py-2">
        <textarea
          className="nodrag w-full resize-none rounded-md border border-[#2d3148] bg-[#0f1117] px-2 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:border-amber-500 focus:outline-none leading-relaxed"
          rows={2}
          placeholder={CONDITION_PLACEHOLDER}
          value={condition}
          onChange={(e) => updateData({ condition: e.target.value })}
        />
        <p className="mt-1 text-[10px] text-slate-600 leading-tight">
          ops: contains · not_contains · starts_with · ends_with · regex · length_gt · length_lt
        </p>
      </div>

      {/* Output handles — bottom left (true) / bottom right (false) */}
      <div className="flex justify-between px-3 pb-2 text-[10px] font-bold">
        <span className="text-emerald-400">TRUE</span>
        <span className="text-red-400">FALSE</span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        style={{ left: '25%', bottom: -6 }}
        className="!h-3 !w-3 !border-2 !border-emerald-400 !bg-[#1a1d2e]"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        style={{ left: '75%', bottom: -6 }}
        className="!h-3 !w-3 !border-2 !border-red-400 !bg-[#1a1d2e]"
      />
    </div>
  )
}

export default memo(ConditionNode)
