import { useState } from 'react'
import { Handle, Position, useReactFlow } from '@xyflow/react'
import { User } from 'lucide-react'

interface HumanInputData {
  label: string
  prompt: string
}

interface Props {
  id: string
  data: HumanInputData
  selected?: boolean
}

export default function HumanInputNode({ id, data, selected }: Props) {
  const { updateNodeData } = useReactFlow()
  const [editingLabel, setEditingLabel] = useState(false)
  const [labelVal, setLabelVal] = useState(data.label || 'Human Input')

  const commitLabel = () => {
    setEditingLabel(false)
    updateNodeData(id, { ...data, label: labelVal })
  }

  return (
    <div
      className={`rounded-xl border-2 bg-[#0f1117] shadow-lg w-52 transition-colors ${
        selected ? 'border-rose-400' : 'border-rose-500/60'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 rounded-t-xl bg-rose-500/15 px-3 py-2 border-b border-rose-500/30">
        <User className="h-3.5 w-3.5 text-rose-400 flex-shrink-0" />
        {editingLabel ? (
          <input
            autoFocus
            className="flex-1 bg-transparent text-xs font-semibold text-rose-200 outline-none"
            value={labelVal}
            onChange={(e) => setLabelVal(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => e.key === 'Enter' && commitLabel()}
          />
        ) : (
          <span
            className="flex-1 text-xs font-semibold text-rose-200 cursor-pointer hover:text-rose-100 truncate"
            onDoubleClick={() => setEditingLabel(true)}
            title="Double-click to rename"
          >
            {data.label || 'Human Input'}
          </span>
        )}
      </div>

      {/* Prompt field */}
      <div className="p-2.5 space-y-1.5">
        <label className="text-[10px] text-slate-500 uppercase tracking-wider">Prompt shown to user</label>
        <textarea
          rows={2}
          className="nodrag w-full rounded-lg border border-[#2d3148] bg-[#141624] px-2 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:border-rose-500 focus:outline-none resize-none"
          placeholder="What do you need from the user?"
          value={data.prompt || ''}
          onChange={(e) => updateNodeData(id, { ...data, prompt: e.target.value })}
        />
        <p className="text-[10px] text-slate-600 leading-snug">
          Flow pauses here and waits for user input before continuing.
        </p>
      </div>

      <Handle type="target" position={Position.Top}    className="!bg-rose-500 !border-rose-400 !h-2.5 !w-2.5" />
      <Handle type="source" position={Position.Bottom} className="!bg-rose-500 !border-rose-400 !h-2.5 !w-2.5" />
    </div>
  )
}
