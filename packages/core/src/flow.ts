import { z } from "zod"

/**
 * Zod schema for a conversation flow response. Validates structural fields and
 * passes through the rest (nodes, components, etc.) for forward compatibility.
 */
export const ConversationFlowResponseSchema = z
  .object({
    conversation_flow_id: z.string(),
    version: z.number(),
    /** SDK types omit this, but the API returns it. */
    is_published: z.boolean().optional(),
    global_prompt: z.string().nullable().optional(),
    nodes: z.array(z.looseObject({})).nullable().optional(),
  })
  .passthrough()
