import { z } from "zod"

/** Schema for a flow edge (destination reference). */
export const FlowEdgeSchema = z
  .object({
    id: z.string().optional(),
    destination_node_id: z.string().optional(),
  })
  .passthrough()

/**
 * Minimal schema for a conversation flow node. Validates the structural fields
 * needed for prompt extraction and serialization; everything else passes
 * through.
 */
export const FlowNodeSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    type: z.string().optional(),
    instruction: z
      .object({
        type: z.string().optional(),
        text: z.string().optional(),
      })
      .passthrough()
      .optional(),
    edges: z.array(FlowEdgeSchema).optional(),
    edge: FlowEdgeSchema.optional(),
  })
  .passthrough()

/**
 * Zod schema for a conversation flow response. Validates structural fields and
 * passes through the rest (nodes, components, etc.) for forward compatibility.
 */
export const ConversationFlowResponseSchema = z
  .object({
    conversation_flow_id: z.string(),
    version: z.number(),
    is_published: z.boolean().optional(),
    global_prompt: z.string().nullable().optional(),
    nodes: z.array(FlowNodeSchema).nullable().optional(),
  })
  .passthrough()
