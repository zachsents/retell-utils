import path from "node:path"
import { toSnakeCase } from "@core"
import {
  createFlowVisualization,
  FILE_HASH_LENGTH,
  writeJson,
  writeMarkdown,
} from "./utils"

type NodeLike = Record<string, unknown> & {
  id?: string
  name?: string
  type?: string
  instruction?: { type?: string; text?: string }
  display_position?: { x: number; y: number } | null
  edges?: Array<{ destination_node_id?: string }>
  edge?: { destination_node_id?: string }
  always_edge?: { destination_node_id?: string }
}

/**
 * Extracts conversation-node prompts from a nodes array into separate markdown
 * files with navigation frontmatter. Mutates the node `instruction.text` to a
 * `file://` placeholder and writes the extracted content to `files`.
 */
export async function extractNodePrompts(
  nodes: NodeLike[],
  dirPath: string,
  files: Record<string, string>,
) {
  const nodeNameById = new Map<string, string>()
  const incomingEdges = new Map<string, string[]>()

  for (const n of nodes) {
    if (n.id && n.name) nodeNameById.set(n.id, n.name)

    const allEdges = [
      ...((n.edges as NodeLike["edges"]) ?? []),
      ...(n.edge ? [n.edge] : []),
      ...(n.always_edge ? [n.always_edge] : []),
    ]

    for (const edge of allEdges) {
      const destId = edge.destination_node_id
      if (destId) {
        if (!incomingEdges.has(destId)) incomingEdges.set(destId, [])
        if (n.name) incomingEdges.get(destId)!.push(n.name)
      }
    }
  }

  for (const node of nodes) {
    if (
      node.id &&
      node.type === "conversation" &&
      node.instruction?.type === "prompt" &&
      typeof node.instruction.text === "string" &&
      !node.instruction.text.startsWith("file://")
    ) {
      const nodeHash = node.id.slice(-FILE_HASH_LENGTH)
      const nodeName = node.name
        ? `${toSnakeCase(node.name)}_${nodeHash}`
        : `${node.type}_${nodeHash}`
      const nodeFileName = `nodes/${nodeName}.md`

      const previous = node.id ? (incomingEdges.get(node.id) ?? []) : []
      const nodeEdges = node.edges
      const nodeAlwaysEdge = node.always_edge
      const next = [
        ...(nodeEdges ?? []),
        ...(nodeAlwaysEdge ? [nodeAlwaysEdge] : []),
      ]
        .map((e) =>
          e.destination_node_id
            ? nodeNameById.get(e.destination_node_id)
            : undefined,
        )
        .filter((name): name is string => !!name)

      const flowViz = node.name
        ? createFlowVisualization(node.name, previous, next)
        : undefined

      files[path.join(dirPath, nodeFileName)] = await writeMarkdown(
        node.instruction.text,
        { nodeId: node.id, flow: flowViz },
      )

      node.instruction.text = `file://./${nodeFileName}`
    }
  }
}

type PositionData = {
  begin_tag?: { x: number; y: number }
  nodes?: Record<string, { x: number; y: number }>
  components?: Record<string, { x: number; y: number }>
}

const roundPos = (p: { x: number; y: number }) => ({
  x: Math.round(p.x),
  y: Math.round(p.y),
})

/**
 * Extracts display positions from a flow-like config into a `.positions.json`
 * file. Mutates the config by deleting the position fields. Works for both full
 * conversation flows and shared components.
 */
export async function extractPositions(
  config: {
    begin_tag_display_position?: { x: number; y: number } | null
    nodes?: NodeLike[] | null
    components?: Array<{
      name?: string
      begin_tag_display_position?: { x: number; y: number } | null
    }> | null
  },
  dirPath: string,
  files: Record<string, string>,
) {
  const positions: PositionData = {}

  if (config.begin_tag_display_position) {
    positions.begin_tag = roundPos(config.begin_tag_display_position)
    delete config.begin_tag_display_position
  }

  if (config.nodes) {
    for (const node of config.nodes) {
      if (node.id && node.display_position) {
        ;(positions.nodes ??= {})[node.id] = roundPos(node.display_position)
        delete node.display_position
      }
    }
  }

  if (config.components) {
    for (const comp of config.components) {
      if (comp.name && comp.begin_tag_display_position) {
        ;(positions.components ??= {})[comp.name] = roundPos(
          comp.begin_tag_display_position,
        )
        delete comp.begin_tag_display_position
      }
    }
  }

  if (Object.keys(positions).length > 0) {
    files[path.join(dirPath, ".positions.json")] = await writeJson(positions)
  }
}
