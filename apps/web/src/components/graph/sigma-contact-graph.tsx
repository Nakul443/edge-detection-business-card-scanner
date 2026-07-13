import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import Graph from 'graphology'
import FA2Layout from 'graphology-layout-forceatlas2/worker'
import Sigma from 'sigma'
import {
  EdgeArrowProgram,
  EdgeLineProgram,
  NodeCircleProgram,
  type EdgeLabelDrawingFunction,
  type NodeLabelDrawingFunction,
} from 'sigma/rendering'
import type { ContactGraph } from '../../lib/api'

type SigmaContactGraphProps = {
  graph: ContactGraph
  selectedGroup: string
  focusedNodeId: string | null
  onFocusNode: (nodeId: string | null) => void
}

type NodeAttributes = {
  x: number
  y: number
  label: string
  color: string
  size: number
  group: string
  hidden?: boolean
  forceLabel?: boolean
  zIndex?: number
  labelDx?: number
  labelDy?: number
  labelAlign?: CanvasTextAlign
}

type EdgeAttributes = {
  color: string
  label: string
  size: number
  type: 'arrow' | 'line'
  relationKind: 'relationship' | 'groupCohesion'
  group: string
  hidden?: boolean
  forceLabel?: boolean
  labelShift?: number
}

const palette = [
  '#93c5fd',
  '#86efac',
  '#f9a8d4',
  '#fde68a',
  '#c4b5fd',
  '#67e8f9',
  '#fca5a5',
  '#a7f3d0',
]

export function SigmaContactGraph({
  graph,
  selectedGroup,
  focusedNodeId,
  onFocusNode,
}: SigmaContactGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const rendererRef = useRef<Sigma<NodeAttributes, EdgeAttributes> | null>(null)
  const layoutRef = useRef<FA2Layout<NodeAttributes, EdgeAttributes> | null>(null)
  const hoveredNodeRef = useRef<string | null>(null)
  const focusedNodeRef = useRef<string | null>(focusedNodeId)
  const draggedNodeRef = useRef<string | null>(null)
  const layoutSettleTimerRef = useRef<number | null>(null)
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null)

  const sigmaGraph = useMemo(() => buildSigmaGraph(graph, selectedGroup), [graph, selectedGroup])

  useEffect(() => {
    focusedNodeRef.current = focusedNodeId
    focusNode(rendererRef.current, focusedNodeId)
  }, [focusedNodeId])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const renderer = new Sigma<NodeAttributes, EdgeAttributes>(sigmaGraph, container, {
      allowInvalidContainer: true,
      defaultNodeType: 'circle',
      defaultEdgeType: 'line',
      enableEdgeEvents: true,
      hideEdgesOnMove: true,
      hideLabelsOnMove: false,
      labelColor: { color: '#0f172a' },
      labelFont: 'Inter, system-ui, sans-serif',
      labelRenderedSizeThreshold: 0,
      labelSize: 12,
      minEdgeThickness: 2.4,
      minCameraRatio: 0.12,
      maxCameraRatio: 4,
      nodeProgramClasses: {
        circle: NodeCircleProgram,
      },
      edgeProgramClasses: {
        arrow: EdgeArrowProgram,
        line: EdgeLineProgram,
      },
      edgeLabelColor: { color: '#334155' },
      edgeLabelFont: 'Inter, system-ui, sans-serif',
      edgeLabelSize: 13,
      renderEdgeLabels: true,
      defaultDrawNodeLabel: drawContactNodeLabel,
      defaultDrawEdgeLabel: drawRelationshipEdgeLabel,
      zIndex: true,
      nodeReducer: (node, data) => reduceNode(sigmaGraph, node, data, {
        hoveredNode: hoveredNodeRef.current,
        focusedNode: focusedNodeRef.current,
      }),
      edgeReducer: (edge, data) => reduceEdge(sigmaGraph, edge, data, {
        hoveredNode: hoveredNodeRef.current,
        focusedNode: focusedNodeRef.current,
      }),
    })

    rendererRef.current = renderer
    renderer.getCamera().animatedReset({ duration: 420 })

    const layout = new FA2Layout<NodeAttributes, EdgeAttributes>(sigmaGraph, {
      getEdgeWeight: (_edge, attributes) => (attributes.relationKind === 'groupCohesion' ? 0.025 : 0.42),
      settings: {
        adjustSizes: true,
        barnesHutOptimize: true,
        barnesHutTheta: 0.8,
        edgeWeightInfluence: 0.55,
        gravity: 0.08,
        linLogMode: true,
        outboundAttractionDistribution: true,
        scalingRatio: 12,
        slowDown: 56,
        strongGravityMode: false,
      },
    })
    layoutRef.current = layout
    startSettlingLayout(layout, layoutSettleTimerRef, renderer, true)

    renderer.on('enterNode', ({ node }) => {
      hoveredNodeRef.current = node
      setHoveredLabel(sigmaGraph.getNodeAttribute(node, 'label'))
      renderer.refresh()
    })

    renderer.on('leaveNode', () => {
      if (draggedNodeRef.current) return
      hoveredNodeRef.current = null
      setHoveredLabel(null)
      renderer.refresh()
    })

    renderer.on('clickNode', ({ node }) => {
      onFocusNode(node)
    })

    renderer.on('clickStage', () => {
      onFocusNode(null)
    })

    renderer.on('downNode', ({ node, event }) => {
      draggedNodeRef.current = node
      hoveredNodeRef.current = node
      focusedNodeRef.current = node
      layout.stop()
      renderer.getCamera().disable()
      event.preventSigmaDefault()
    })

    const mouse = renderer.getMouseCaptor()
    mouse.on('mousemovebody', (event) => {
      const draggedNode = draggedNodeRef.current
      if (!draggedNode) return

      const position = renderer.viewportToGraph({ x: event.x, y: event.y })
      sigmaGraph.setNodeAttribute(draggedNode, 'x', position.x)
      sigmaGraph.setNodeAttribute(draggedNode, 'y', position.y)
      sigmaGraph.setNodeAttribute(draggedNode, 'forceLabel', true)
      renderer.refresh({ partialGraph: { nodes: [draggedNode] }, schedule: true })
      event.preventSigmaDefault()
    })

    mouse.on('mouseup', () => {
      const draggedNode = draggedNodeRef.current
      if (!draggedNode) return

      draggedNodeRef.current = null
      renderer.getCamera().enable()
      sigmaGraph.setNodeAttribute(draggedNode, 'forceLabel', true)
      startSettlingLayout(layout, layoutSettleTimerRef)
      renderer.refresh()
    })

    const resizeObserver = new ResizeObserver(() => renderer.resize())
    resizeObserver.observe(container)

    return () => {
      if (layoutSettleTimerRef.current) {
        window.clearTimeout(layoutSettleTimerRef.current)
      }
      resizeObserver.disconnect()
      layout.kill()
      renderer.kill()
      rendererRef.current = null
      layoutRef.current = null
      layoutSettleTimerRef.current = null
      draggedNodeRef.current = null
      hoveredNodeRef.current = null
    }
  }, [onFocusNode, sigmaGraph])

  return (
    <div className="relative h-[560px] w-full">
      <div ref={containerRef} className="h-full w-full bg-slate-50" />
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-slate-200 bg-white/85 px-2 py-1 text-[11px] text-slate-500 shadow-sm">
        Drag contacts around the map. Scroll to zoom.
      </div>
      {hoveredLabel ? (
        <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-slate-200 bg-white/90 px-3 py-2 text-xs font-medium text-slate-900 shadow-sm">
          {hoveredLabel}
        </div>
      ) : null}
    </div>
  )
}

function buildSigmaGraph(graph: ContactGraph, selectedGroup: string) {
  const sigmaGraph = new Graph<NodeAttributes, EdgeAttributes>({ multi: true, type: 'directed' })
  const colors = new Map(graph.groups.map((group, index) => [group, palette[index % palette.length]]))
  const allowedNodeIds = new Set<string>()

  for (const node of graph.nodes) {
    if (selectedGroup === 'All' || node.groups.includes(selectedGroup)) {
      allowedNodeIds.add(node.id)
    }
  }

  for (const edge of graph.edges) {
    if (selectedGroup === 'All' || edge.group === selectedGroup) {
      allowedNodeIds.add(edge.fromContactId)
      allowedNodeIds.add(edge.toContactId)
    }
  }

  const visibleNodes = graph.nodes.filter((node) => allowedNodeIds.has(node.id))
  for (const node of graph.nodes) {
    if (!allowedNodeIds.has(node.id)) continue

    const group = selectedGroup === 'All' ? node.groups[0] ?? 'Orphan' : selectedGroup
    const groupIndex = Math.max(0, graph.groups.indexOf(group))
    const sameGroupNodes = visibleNodes.filter((candidate) => (candidate.groups[0] ?? 'Orphan') === group)
    const peerIndex = Math.max(0, sameGroupNodes.findIndex((candidate) => candidate.id === node.id))
    const center = groupCenter(groupIndex, Math.max(graph.groups.length, 1))
    const angle = (Math.PI * 2 * peerIndex) / Math.max(sameGroupNodes.length, 1)
    const radius = 30 + (peerIndex % 5) * 9
    sigmaGraph.addNode(node.id, {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
      label: node.displayName || node.fullName,
      color: colors.get(group) ?? '#cbd5e1',
      size: node.company ? 8 : 7,
      group,
      forceLabel: true,
      labelDx: Math.cos(angle) * 46,
      labelDy: Math.sin(angle) * 32,
      labelAlign: labelAlignForAngle(angle),
      zIndex: 4,
    })
  }

  addHiddenGroupCohesionEdges(sigmaGraph, graph, selectedGroup, allowedNodeIds)

  const visibleRelationshipEdges: ContactGraph['edges'] = []
  const renderedRelationshipEdges = new Set<string>()
  for (const edge of graph.edges) {
    if (!sigmaGraph.hasNode(edge.fromContactId) || !sigmaGraph.hasNode(edge.toContactId)) continue
    if (selectedGroup !== 'All' && edge.group !== selectedGroup) continue

    const reciprocalKey = relationshipRenderKey(edge)
    if (reciprocalKey && renderedRelationshipEdges.has(reciprocalKey)) continue
    if (reciprocalKey) renderedRelationshipEdges.add(reciprocalKey)
    visibleRelationshipEdges.push(edge)
  }

  const labelIndexes = relationshipLabelIndexes(visibleRelationshipEdges)
  for (const edge of visibleRelationshipEdges) {
    const labelIndex = labelIndexes.get(edge.id) ?? { index: 0, total: 1 }

    sigmaGraph.addDirectedEdgeWithKey(edge.id, edge.fromContactId, edge.toContactId, {
      color: colors.get(edge.group) ?? '#e2e8f0',
      label: relationshipLabel(edge.relationshipType),
      size: 4.4,
      type: 'arrow',
      relationKind: 'relationship',
      group: edge.group,
      forceLabel: true,
      labelShift: (labelIndex.index - (labelIndex.total - 1) / 2) * 42,
    })
  }

  return sigmaGraph
}

function relationshipRenderKey(edge: ContactGraph['edges'][number]) {
  if (edge.relationshipType !== 'work_partner' && edge.relationshipType !== 'relative') return null

  const [firstId, secondId] = [edge.fromContactId, edge.toContactId].sort()
  return `${edge.group}:${edge.relationshipType}:${firstId}:${secondId}`
}

function relationshipLabelIndexes(edges: ContactGraph['edges']) {
  const edgeGroups = new Map<string, ContactGraph['edges']>()
  const indexes = new Map<string, { index: number; total: number }>()

  for (const edge of edges) {
    const key = `${edge.group}:${edge.relationshipType}:${edge.fromContactId}`
    const existing = edgeGroups.get(key) ?? []
    existing.push(edge)
    edgeGroups.set(key, existing)
  }

  for (const groupEdges of edgeGroups.values()) {
    groupEdges.forEach((edge, index) => {
      indexes.set(edge.id, { index, total: groupEdges.length })
    })
  }

  return indexes
}

function reduceNode(
  graph: Graph<NodeAttributes, EdgeAttributes>,
  node: string,
  data: NodeAttributes,
  state: { hoveredNode: string | null; focusedNode: string | null },
) {
  const activeNode = state.hoveredNode ?? state.focusedNode
  if (!activeNode) return data

  const isActive = node === activeNode
  const isNeighbor = graph.hasNode(activeNode) && graph.neighbors(activeNode).includes(node)
  return {
    ...data,
    forceLabel: true,
    color: isActive || isNeighbor ? data.color : '#cbd5e1',
    size: isActive ? data.size * 1.35 : data.size,
    zIndex: isActive ? 10 : data.zIndex,
  }
}

function reduceEdge(
  graph: Graph<NodeAttributes, EdgeAttributes>,
  edge: string,
  data: EdgeAttributes,
  state: { hoveredNode: string | null; focusedNode: string | null },
) {
  const activeNode = state.hoveredNode ?? state.focusedNode
  if (data.relationKind === 'groupCohesion') return { ...data, hidden: true }
  if (!activeNode) return data

  const [source, target] = graph.extremities(edge)
  const isActive = source === activeNode || target === activeNode
  return {
    ...data,
    color: isActive ? data.color : '#d1d5db',
    size: isActive ? data.size * 1.2 : data.size,
  }
}

function focusNode(renderer: Sigma<NodeAttributes, EdgeAttributes> | null, nodeId: string | null) {
  if (!renderer || !nodeId) {
    renderer?.refresh()
    return
  }

  const graph = renderer.getGraph()
  if (!graph.hasNode(nodeId)) {
    renderer.refresh()
    return
  }

  const x = graph.getNodeAttribute(nodeId, 'x')
  const y = graph.getNodeAttribute(nodeId, 'y')
  graph.setNodeAttribute(nodeId, 'forceLabel', true)
  renderer.getCamera().animate({ x, y, ratio: 0.34 }, { duration: 520 })
  renderer.refresh()
}

function addHiddenGroupCohesionEdges(
  sigmaGraph: Graph<NodeAttributes, EdgeAttributes>,
  graph: ContactGraph,
  selectedGroup: string,
  allowedNodeIds: Set<string>,
) {
  const groups = selectedGroup === 'All' ? graph.groups : graph.groups.filter((group) => group === selectedGroup)

  for (const group of groups) {
    const members = graph.nodes
      .filter((node) => allowedNodeIds.has(node.id) && node.groups.includes(group))
      .map((node) => node.id)

    if (members.length < 2) continue

    for (let index = 0; index < members.length; index += 1) {
      const source = members[index]
      const target = members[(index + 1) % members.length]
      if (source === target) continue

      sigmaGraph.addDirectedEdgeWithKey(`cohesion:${group}:${source}:${target}`, source, target, {
        color: '#e5e7eb',
        label: '',
        size: 0.1,
        type: 'line',
        relationKind: 'groupCohesion',
        group,
        hidden: true,
      })
    }
  }
}

function groupCenter(index: number, total: number) {
  if (total <= 1) return { x: 0, y: 0 }
  if (index === 0) return { x: 0, y: 0 }

  const angle = -Math.PI / 2 + (Math.PI * 2 * (index - 1)) / Math.max(total - 1, 1)
  return {
    x: Math.cos(angle) * 34,
    y: Math.sin(angle) * 24,
  }
}

const drawContactNodeLabel: NodeLabelDrawingFunction<NodeAttributes, EdgeAttributes> = (
  context,
  data,
  settings,
) => {
  if (!data.label) return

  const text = data.label
  const fontSize = settings.labelSize
  const x = data.x + (typeof data.labelDx === 'number' ? data.labelDx : data.size + 9)
  const y = data.y + (typeof data.labelDy === 'number' ? data.labelDy : fontSize / 3)
  const textAlign = data.labelAlign ?? 'left'

  context.save()
  context.font = `${settings.labelWeight} ${fontSize}px ${settings.labelFont}`
  context.textAlign = textAlign
  context.textBaseline = 'middle'
  const textWidth = context.measureText(text).width
  const rectX =
    textAlign === 'right' ? x - textWidth - 4 : textAlign === 'center' ? x - textWidth / 2 - 4 : x - 4

  context.fillStyle = 'rgba(248, 250, 252, 0.88)'
  context.fillRect(rectX, y - fontSize / 2 - 4, textWidth + 8, fontSize + 8)

  context.fillStyle = settings.labelColor.color ?? '#0f172a'
  context.fillText(text, x, y)
  context.restore()
}

const drawRelationshipEdgeLabel: EdgeLabelDrawingFunction<NodeAttributes, EdgeAttributes> = (
  context,
  edgeData,
  sourceData,
  targetData,
  settings,
) => {
  if (!edgeData.label) return

  const dx = targetData.x - sourceData.x
  const dy = targetData.y - sourceData.y
  const length = Math.hypot(dx, dy)
  if (length < sourceData.size + targetData.size + 8) return

  const label = edgeData.label
  const fontSize = settings.edgeLabelSize
  const midpointX = (sourceData.x + targetData.x) / 2
  const midpointY = (sourceData.y + targetData.y) / 2
  const unitX = dx / length
  const unitY = dy / length
  const offsetX = (-unitY) * 42 + unitX * (edgeData.labelShift ?? 0)
  const offsetY = unitX * 42 + unitY * (edgeData.labelShift ?? 0)
  const x = midpointX + offsetX
  const y = midpointY + offsetY

  context.save()
  context.font = `${settings.edgeLabelWeight} ${fontSize}px ${settings.edgeLabelFont}`
  const textWidth = context.measureText(label).width

  context.fillStyle = 'rgba(248, 250, 252, 0.92)'
  context.fillRect(x - textWidth / 2 - 4, y - fontSize / 2 - 3, textWidth + 8, fontSize + 6)

  context.fillStyle = settings.edgeLabelColor.color ?? '#334155'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(label, x, y)
  context.restore()
}

function relationshipLabel(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function labelAlignForAngle(angle: number): CanvasTextAlign {
  const x = Math.cos(angle)
  if (x < -0.25) return 'right'
  if (x > 0.25) return 'left'
  return 'center'
}

function startSettlingLayout(
  layout: FA2Layout<NodeAttributes, EdgeAttributes>,
  timerRef: MutableRefObject<number | null>,
  renderer?: Sigma<NodeAttributes, EdgeAttributes>,
  resetCameraAfterSettle = false,
) {
  if (timerRef.current) {
    window.clearTimeout(timerRef.current)
  }

  layout.start()
  timerRef.current = window.setTimeout(() => {
    layout.stop()
    if (resetCameraAfterSettle) {
      renderer?.getCamera().animatedReset({ duration: 320 })
    }
    timerRef.current = null
  }, 1300)
}
