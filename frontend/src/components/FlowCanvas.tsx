import { useCallback, useRef, useState, useEffect, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  BackgroundVariant,
  Node,
  Edge,
  ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import AgentNode from './nodes/AgentNode'
import ConditionNode from './nodes/ConditionNode'
import LoopNode from './nodes/LoopNode'
import { flowsApi, Flow, FlowNode, FlowEdge } from '../services/api'
import { Save, FolderOpen, Plus, Trash2, GitBranch, Download, Upload, RefreshCw } from 'lucide-react'
import CanvasContext from '../contexts/CanvasContext'

const nodeTypes = { agentNode: AgentNode, conditionNode: ConditionNode, loopNode: LoopNode }

const TOPOLOGY_OPTIONS = [
  { value: 'pipeline', label: 'Pipeline', icon: '→' },
  { value: 'parallel', label: 'Parallel', icon: '⇉' },
  { value: 'hierarchical', label: 'Hierarchical', icon: '⊤' },
]

const EMPTY_HINTS: Record<string, string> = {
  pipeline: 'Connect them with lines to define execution order',
  parallel: 'Agents will be arranged automatically in parallel',
  hierarchical: 'First agent becomes supervisor, the rest become workers',
}

interface Props {
  onFlowSaved: (flowId: string) => void
  activeFlowId: string | null
}

let nodeCounter = 0

// Pure layout function — runs outside React to avoid closure issues
function computeAutoLayout(
  topo: string,
  currentNodes: Node[],
  currentEdges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  const agentNodes = currentNodes.filter((n) => n.type === 'agentNode')
  const otherNodes = currentNodes.filter((n) => n.type !== 'agentNode')

  if (topo === 'parallel') {
    const spacing = 240
    const totalWidth = (agentNodes.length - 1) * spacing
    const repositioned = agentNodes.map((node, i) => ({
      ...node,
      position: { x: i * spacing - totalWidth / 2, y: 0 },
    }))
    return { nodes: [...otherNodes, ...repositioned], edges: [] }
  }

  if (topo === 'hierarchical') {
    if (agentNodes.length === 0) return { nodes: currentNodes, edges: currentEdges }

    const [supervisor, ...workers] = agentNodes
    const spacing = 240
    const totalWidth = Math.max((workers.length - 1) * spacing, 0)

    const supervisorNode = { ...supervisor, position: { x: 0, y: 0 } }
    const workerNodes = workers.map((node, i) => ({
      ...node,
      position: { x: i * spacing - totalWidth / 2, y: 220 },
    }))

    const newEdges: Edge[] = workers.map((worker) => ({
      id: `h-${supervisor.id}-${worker.id}`,
      source: supervisor.id,
      target: worker.id,
      animated: true,
    }))

    return { nodes: [...otherNodes, supervisorNode, ...workerNodes], edges: newEdges }
  }

  return { nodes: currentNodes, edges: currentEdges }
}

export default function FlowCanvas({ onFlowSaved, activeFlowId }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null)
  const [flowName, setFlowName] = useState('My Flow')
  const [topology, setTopology] = useState('pipeline')
  const [savedFlows, setSavedFlows] = useState<Flow[]>([])
  const [showFlowList, setShowFlowList] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  // Refs to avoid stale closures in the deletion useEffect
  const topologyRef = useRef(topology)
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const rfInstanceRef = useRef(rfInstance)
  topologyRef.current = topology
  nodesRef.current = nodes
  edgesRef.current = edges
  rfInstanceRef.current = rfInstance

  // Compute which node is the supervisor (hierarchical only)
  const supervisorNodeId = useMemo<string | null>(() => {
    if (topology !== 'hierarchical') return null
    const agentNodes = nodes.filter((n) => n.type === 'agentNode')
    if (agentNodes.length === 0) return null
    const agentIds = new Set(agentNodes.map((n) => n.id))
    const inDeg: Record<string, number> = {}
    const outDeg: Record<string, number> = {}
    agentNodes.forEach((n) => { inDeg[n.id] = 0; outDeg[n.id] = 0 })
    edges.forEach((e) => {
      if (agentIds.has(e.source) && agentIds.has(e.target)) {
        inDeg[e.target] = (inDeg[e.target] ?? 0) + 1
        outDeg[e.source] = (outDeg[e.source] ?? 0) + 1
      }
    })
    const roots = agentNodes.filter((n) => inDeg[n.id] === 0)
    if (roots.length === 1) return roots[0].id
    if (roots.length > 1) return roots.sort((a, b) => (outDeg[b.id] ?? 0) - (outDeg[a.id] ?? 0))[0].id
    return agentNodes[0].id
  }, [topology, nodes, edges])

  useEffect(() => {
    flowsApi.list().then(setSavedFlows).catch(console.error)
  }, [])

  // Re-apply layout when a node is deleted while in auto-layout mode
  useEffect(() => {
    const topo = topologyRef.current
    if (topo !== 'parallel' && topo !== 'hierarchical') return
    if (nodesRef.current.length === 0) return

    const { nodes: newNodes, edges: newEdges } = computeAutoLayout(
      topo,
      nodesRef.current,
      edgesRef.current,
    )

    const posChanged = newNodes.some((ln) => {
      const orig = nodesRef.current.find((n) => n.id === ln.id)
      return (
        orig &&
        (Math.abs(orig.position.x - ln.position.x) > 1 ||
          Math.abs(orig.position.y - ln.position.y) > 1)
      )
    })
    const edgeCountChanged = newEdges.length !== edgesRef.current.length

    if (posChanged || edgeCountChanged) {
      setNodes(newNodes)
      setEdges(newEdges)
      setTimeout(() => rfInstanceRef.current?.fitView({ padding: 0.2, duration: 300 }), 50)
    }
  }, [nodes.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleTopologyChange = useCallback(
    (newTopology: string) => {
      setTopology(newTopology)
      if (newTopology === 'parallel' || newTopology === 'hierarchical') {
        const { nodes: newNodes, edges: newEdges } = computeAutoLayout(newTopology, nodes, edges)
        setNodes(newNodes)
        setEdges(newEdges)
        setTimeout(() => rfInstanceRef.current?.fitView({ padding: 0.2, duration: 300 }), 50)
      } else {
        // Switching to pipeline: clear auto-generated edges, user draws manually
        setEdges([])
      }
    },
    [nodes, edges, setNodes, setEdges],
  )

  const onConnect = useCallback(
    (params: Connection) => {
      if (topology !== 'pipeline') return
      setEdges((eds) => addEdge({ ...params, animated: true }, eds))
    },
    [setEdges, topology],
  )

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      if (!rfInstance || !containerRef.current) return

      const agentId = event.dataTransfer.getData('application/agent-id')
      const agentName = event.dataTransfer.getData('application/agent-name')
      if (!agentId) return

      const bounds = containerRef.current.getBoundingClientRect()
      const position = rfInstance.screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      })

      const newNode: Node = {
        id: `agent-${++nodeCounter}-${Date.now()}`,
        type: 'agentNode',
        position,
        data: { agentId, label: agentName },
      }

      if (topology === 'parallel' || topology === 'hierarchical') {
        const updatedNodes = [...nodes, newNode]
        const { nodes: layoutNodes, edges: layoutEdges } = computeAutoLayout(
          topology,
          updatedNodes,
          edges,
        )
        setNodes(layoutNodes)
        setEdges(layoutEdges)
        setTimeout(() => rfInstanceRef.current?.fitView({ padding: 0.2, duration: 300 }), 50)
      } else {
        setNodes((nds) => [...nds, newNode])
      }
    },
    [rfInstance, setNodes, setEdges, topology, nodes, edges],
  )

  const handleSave = async () => {
    if (!rfInstance) return
    setIsSaving(true)
    try {
      const flowNodes: FlowNode[] = nodes.map((n) => ({
        id: n.id,
        type: n.type || 'agentNode',
        position: n.position,
        data: n.data as Record<string, unknown>,
      }))
      const flowEdges: FlowEdge[] = edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? null,
      }))

      let saved: Flow
      if (activeFlowId) {
        saved = await flowsApi.update(activeFlowId, { name: flowName, topology, nodes: flowNodes, edges: flowEdges })
      } else {
        saved = await flowsApi.create({ name: flowName, topology, nodes: flowNodes, edges: flowEdges })
      }

      onFlowSaved(saved.id)
      const updated = await flowsApi.list()
      setSavedFlows(updated)
    } catch (err) {
      console.error('Failed to save flow:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleLoadFlow = async (flow: Flow) => {
    setFlowName(flow.name)
    setTopology(flow.topology)
    setNodes(flow.nodes.map((n) => ({ ...n, type: n.type || 'agentNode' })))
    setEdges(flow.edges.map((e) => ({ ...e, animated: true })))
    onFlowSaved(flow.id)
    setShowFlowList(false)
  }

  const handleNewFlow = () => {
    setNodes([])
    setEdges([])
    setFlowName('New Flow')
    setTopology('pipeline')
    onFlowSaved('')
    setShowFlowList(false)
  }

  const handleDeleteFlow = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await flowsApi.delete(id)
    setSavedFlows((fs) => fs.filter((f) => f.id !== id))
    if (activeFlowId === id) handleNewFlow()
  }

  const handleExport = useCallback(() => {
    const payload = {
      name: flowName,
      topology,
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type || 'agentNode',
        position: n.position,
        data: n.data,
      })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null })),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${flowName.replace(/\s+/g, '_')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [flowName, topology, nodes, edges])

  const handleAddConditionNode = useCallback(() => {
    const center = rfInstanceRef.current
      ? rfInstanceRef.current.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
      : { x: 0, y: 0 }
    const newNode: Node = {
      id: `condition-${++nodeCounter}-${Date.now()}`,
      type: 'conditionNode',
      position: center,
      data: { label: 'Condition', condition: '' },
    }
    setNodes((nds) => [...nds, newNode])
  }, [setNodes])

  const handleAddLoopNode = useCallback(() => {
    const center = rfInstanceRef.current
      ? rfInstanceRef.current.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
      : { x: 0, y: 0 }
    const newNode: Node = {
      id: `loop-${++nodeCounter}-${Date.now()}`,
      type: 'loopNode',
      position: center,
      data: { label: 'Loop', max_iterations: 3, exit_condition: '' },
    }
    setNodes((nds) => [...nds, newNode])
  }, [setNodes])

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const json = JSON.parse(evt.target?.result as string)
        if (json.name) setFlowName(json.name)
        if (json.topology) setTopology(json.topology)
        if (Array.isArray(json.nodes))
          setNodes(json.nodes.map((n: FlowNode) => ({ ...n, type: n.type || 'agentNode' })))
        if (Array.isArray(json.edges))
          setEdges(json.edges.map((e: FlowEdge) => ({ ...e, animated: true })))
        onFlowSaved('')          // treat as a new unsaved flow
        setTimeout(() => rfInstanceRef.current?.fitView({ padding: 0.2, duration: 300 }), 100)
      } catch {
        alert('Invalid flow JSON file.')
      }
    }
    reader.readAsText(file)
    // reset so the same file can be re-imported
    e.target.value = ''
  }, [setNodes, setEdges, onFlowSaved])

  return (
    <div className="relative flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-[#2d3148] bg-[#141624] px-4 py-2">
        <input
          className="rounded-lg border border-[#2d3148] bg-[#0f1117] px-3 py-1.5 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none w-48"
          value={flowName}
          onChange={(e) => setFlowName(e.target.value)}
          placeholder="Flow name"
        />

        <div className="flex rounded-lg border border-[#2d3148] overflow-hidden">
          {TOPOLOGY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleTopologyChange(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${
                topology === opt.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-[#0f1117] text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>{opt.icon}</span>
              {opt.label}
            </button>
          ))}
        </div>

        {topology === 'pipeline' && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleAddConditionNode}
              title="Add a condition (if/else) node to the canvas"
              className="flex items-center gap-1.5 rounded-lg border border-amber-600/50 px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-500/10 transition-colors"
            >
              <GitBranch className="h-3.5 w-3.5" />
              + Condition
            </button>
            <button
              onClick={handleAddLoopNode}
              title="Add a loop node (repeat N times / until condition)"
              className="flex items-center gap-1.5 rounded-lg border border-cyan-600/50 px-3 py-1.5 text-xs text-cyan-400 hover:bg-cyan-500/10 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              + Loop
            </button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowFlowList(!showFlowList)}
              className="flex items-center gap-1.5 rounded-lg border border-[#2d3148] px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Open
            </button>
            {showFlowList && (
              <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-[#2d3148] bg-[#141624] shadow-xl">
                <button
                  onClick={handleNewFlow}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-xs text-indigo-400 hover:bg-[#1a1d2e] transition-colors border-b border-[#2d3148]"
                >
                  <Plus className="h-3.5 w-3.5" /> New Flow
                </button>
                {savedFlows.length === 0 && (
                  <p className="p-3 text-xs text-slate-500 text-center">No saved flows</p>
                )}
                {savedFlows.map((flow) => (
                  <div
                    key={flow.id}
                    onClick={() => handleLoadFlow(flow)}
                    className="flex items-center justify-between px-3 py-2.5 hover:bg-[#1a1d2e] cursor-pointer transition-colors"
                  >
                    <div>
                      <div className="text-xs font-medium text-slate-200">{flow.name}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-1">
                        <GitBranch className="h-3 w-3" />
                        {flow.topology}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDeleteFlow(flow.id, e)}
                      className="rounded p-1 text-slate-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleExport}
            disabled={nodes.length === 0}
            title="Export flow as JSON"
            className="flex items-center gap-1.5 rounded-lg border border-[#2d3148] px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>

          <button
            onClick={() => importInputRef.current?.click()}
            title="Import flow from JSON"
            className="flex items-center gap-1.5 rounded-lg border border-[#2d3148] px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <Upload className="h-3.5 w-3.5" />
            Import
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImport}
          />

          <button
            onClick={handleSave}
            disabled={isSaving || nodes.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Save className="h-3.5 w-3.5" />
            {isSaving ? 'Saving...' : activeFlowId ? 'Update' : 'Save'}
          </button>
        </div>
      </div>

      {/* Canvas */}
      <CanvasContext.Provider value={{ topology, supervisorNodeId }}>
      <div ref={containerRef} className="flex-1" onDragOver={onDragOver} onDrop={onDrop}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={setRfInstance}
          nodeTypes={nodeTypes}
          fitView
          deleteKeyCode="Delete"
          className="bg-[#0f1117]"
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1e2130" />
          <Controls />
          <MiniMap
            nodeColor="#6366f1"
            maskColor="rgba(15,17,23,0.8)"
          />
        </ReactFlow>
      </div>
      </CanvasContext.Provider>

      {nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-3">🤖</div>
            <p className="text-sm text-slate-500">Drag agents from the left panel onto the canvas</p>
            <p className="text-xs text-slate-600 mt-1">{EMPTY_HINTS[topology]}</p>
          </div>
        </div>
      )}
    </div>
  )
}
