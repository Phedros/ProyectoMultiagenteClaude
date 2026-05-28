import { useState, useRef, useEffect } from 'react'
import { useReactFlow } from '@xyflow/react'
import { StickyNote, Trash2 } from 'lucide-react'

const NOTE_COLORS = [
  { label: 'Yellow', bg: 'bg-yellow-500/15', border: 'border-yellow-500/40', text: 'text-yellow-100', header: 'bg-yellow-500/20' },
  { label: 'Blue',   bg: 'bg-blue-500/15',   border: 'border-blue-500/40',   text: 'text-blue-100',   header: 'bg-blue-500/20'   },
  { label: 'Green',  bg: 'bg-emerald-500/15', border: 'border-emerald-500/40',text: 'text-emerald-100',header: 'bg-emerald-500/20' },
  { label: 'Red',    bg: 'bg-rose-500/15',    border: 'border-rose-500/40',   text: 'text-rose-100',   header: 'bg-rose-500/20'   },
  { label: 'Purple', bg: 'bg-violet-500/15',  border: 'border-violet-500/40', text: 'text-violet-100', header: 'bg-violet-500/20' },
]

interface NoteData {
  text: string
  colorIndex: number
  width: number
}

interface Props {
  id: string
  data: NoteData
  selected?: boolean
}

export default function NoteNode({ id, data, selected }: Props) {
  const { updateNodeData, deleteElements } = useReactFlow()
  const color = NOTE_COLORS[data.colorIndex ?? 0] ?? NOTE_COLORS[0]
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [showColors, setShowColors] = useState(false)

  // Auto-resize textarea height
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
  }, [data.text])

  return (
    <div
      className={`rounded-xl border-2 ${color.bg} ${color.border} shadow-lg transition-shadow ${selected ? 'shadow-lg' : ''}`}
      style={{ width: data.width ?? 220 }}
    >
      {/* Header */}
      <div className={`flex items-center gap-1.5 rounded-t-xl ${color.header} px-2.5 py-1.5 border-b ${color.border}`}>
        <StickyNote className={`h-3 w-3 ${color.text} flex-shrink-0 opacity-70`} />

        {/* Color picker dots */}
        <div className="relative">
          <button
            className="flex items-center gap-0.5 opacity-60 hover:opacity-100 transition-opacity"
            onClick={() => setShowColors((v) => !v)}
            title="Change color"
          >
            {NOTE_COLORS.map((c, i) => (
              <span
                key={i}
                className={`h-2.5 w-2.5 rounded-full border ${c.border} ${c.header} ${i === (data.colorIndex ?? 0) ? 'scale-125 opacity-100' : 'opacity-60'}`}
              />
            ))}
          </button>
          {showColors && (
            <div className="absolute top-5 left-0 z-50 flex gap-1 rounded-lg border border-[#2d3148] bg-[#141624] p-1.5 shadow-xl">
              {NOTE_COLORS.map((c, i) => (
                <button
                  key={i}
                  title={c.label}
                  onClick={() => { updateNodeData(id, { ...data, colorIndex: i }); setShowColors(false) }}
                  className={`h-5 w-5 rounded-full border-2 ${c.header} ${i === (data.colorIndex ?? 0) ? c.border + ' scale-110' : 'border-transparent'} hover:scale-110 transition-transform`}
                />
              ))}
            </div>
          )}
        </div>

        <span className={`text-[10px] font-medium ${color.text} opacity-60 ml-auto`}>note</span>

        {/* Delete */}
        <button
          onClick={() => deleteElements({ nodes: [{ id }] })}
          className={`${color.text} opacity-40 hover:opacity-80 transition-opacity`}
          title="Delete note"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {/* Text body */}
      <div className="p-2">
        <textarea
          ref={textareaRef}
          className={`nodrag nowheel w-full resize-none bg-transparent text-xs ${color.text} placeholder-current placeholder-opacity-30 focus:outline-none leading-relaxed`}
          placeholder="Write a note…"
          value={data.text ?? ''}
          rows={3}
          style={{ minHeight: 60, overflow: 'hidden' }}
          onChange={(e) => {
            updateNodeData(id, { ...data, text: e.target.value })
          }}
        />
      </div>

      {/* Resize handle (width only) */}
      <div
        className={`h-1.5 rounded-b-xl cursor-ew-resize ${color.header} opacity-40 hover:opacity-80 transition-opacity`}
        title="Drag to resize (use ReactFlow resize)"
      />
    </div>
  )
}
