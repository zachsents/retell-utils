import { z } from "zod"

/**
 * Zod schema for a Retell LLM response. Validates structural fields and passes
 * through all other fields (tools, states, etc.) for forward compatibility.
 */
export const LlmResponseSchema = z
  .object({
    llm_id: z.string(),
    last_modification_timestamp: z.number(),
    version: z.number().optional(),
    /** SDK types omit this, but the API returns it. */
    is_published: z.boolean().optional(),
    general_prompt: z.string().nullable().optional(),
    begin_message: z.string().nullable().optional(),
  })
  .passthrough()
