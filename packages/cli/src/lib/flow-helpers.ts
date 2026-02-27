import path from "node:path"
import { type FlowEdgeSchema, FlowNodeSchema, toSnakeCase } from "@core"
import type z from "zod"
import {
  createFlowVisualization,
  FILE_HASH_LENGTH,
  writeJson,
  writeMarkdown,
} from "./utils"

type FlowNode = z.infer<typeof FlowNodeSchema>
type FlowEdge = z.infer<typeof FlowEdgeSchema>

/** Collects outgoing edges from a node for building the incoming-edges map. */
function collectEdges(node: FlowNode): FlowEdge[] {
  switch (node.type) {
    case "conversation":
      return [
        ...(node.edges ?? []),
        ...(node.always_edge ? [node.always_edge] : []),
      ]
    case "function":
    case "branch":
    case "component":
      return node.edges ?? []
    case "transfer_call":
      return node.edge ? [node.edge] : []
    default:
      return []
  }
}

/**
 * Extracts conversation-node prompts from a nodes array into separate markdown
 * files with navigation frontmatter. Mutates the node `instruction.text` to a
 * `file://` placeholder and writes the extracted content to `files`.
 */
export async function extractNodePrompts(
  nodes: FlowNode[],
  dirPath: string,
  files: Record<string, string>,
) {
  const nodeNameById = new Map<string, string>()
  const incomingEdges = new Map<string, string[]>()

  for (const n of nodes) {
    if (n.id && n.name) nodeNameById.set(n.id, n.name)

    for (const edge of collectEdges(n)) {
      const destId = edge.destination_node_id
      if (destId) {
        if (!incomingEdges.has(destId)) incomingEdges.set(destId, [])
        if (n.name) incomingEdges.get(destId)!.push(n.name)
      }
    }
  }

  for (const node of nodes) {
    if (
      node.type === "conversation" &&
      node.id &&
      node.instruction?.type === "prompt" &&
      typeof node.instruction.text === "string" &&
      !node.instruction.text.startsWith("file://")
    ) {
      const nodeHash = node.id.slice(-FILE_HASH_LENGTH)
      const nodeName = node.name
        ? `${toSnakeCase(node.name)}_${nodeHash}`
        : `${node.type}_${nodeHash}`
      const nodeFileName = `nodes/${nodeName}.md`

      const previous = incomingEdges.get(node.id) ?? []
      const next = [
        ...(node.edges ?? []),
        ...(node.always_edge ? [node.always_edge] : []),
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
 *
 * Parameter types are intentionally wider than FlowNode — this function removes
 * position fields, so it accepts objects where those fields are deletable.
 */
export async function extractPositions(
  config: {
    begin_tag_display_position?: { x: number; y: number } | null
    nodes?: Array<{
      id: string
      display_position?: { x: number; y: number } | null
    }> | null
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
