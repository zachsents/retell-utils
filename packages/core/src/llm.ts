import { z } from "zod"
import { KbConfigSchema, McpConfigSchema } from "./agent"
import {
  LlmModelSchema,
  LlmToolTypeSchema,
  S2sModelSchema,
  StartSpeakerSchema,
} from "./enums"

// ---------------------------------------------------------------------------
// Tools & states
// ---------------------------------------------------------------------------

/**
 * Schema for an LLM tool. Tools have many type variants (end_call,
 * transfer_call, custom, book_appointment_cal, etc.) each with different
 * fields. We validate the common structural fields and use catchall for the
 * rest so configs round-trip safely through the CLI.
 */
export const LlmToolSchema = z
  .object({
    type: LlmToolTypeSchema,
    name: z.string().optional(),
    description: z.string().optional(),
  })
  .catchall(z.unknown())

/** State transition edge within multi-prompt LLM. */
export const LlmStateEdgeSchema = z.object({
  destination_state_name: z.string(),
  description: z.string().optional(),
  parameters: z.unknown().optional(),
})

/** A state within a multi-prompt LLM. */
export const LlmStateSchema = z.object({
  name: z.string(),
  state_prompt: z.string().optional(),
  edges: z.array(LlmStateEdgeSchema).optional(),
  tools: z.array(LlmToolSchema).nullable().optional(),
})

// ---------------------------------------------------------------------------
// LLM response
// ---------------------------------------------------------------------------

/** Zod schema for a Retell LLM response from the API. */
export const LlmResponseSchema = z.object({
  // Required
  llm_id: z.string(),
  last_modification_timestamp: z.number(),

  // Version
  version: z.number().optional(),
  is_published: z.boolean().optional(),

  // Model selection
  model: LlmModelSchema.nullable().optional(),
  s2s_model: S2sModelSchema.nullable().optional(),
  model_temperature: z.number().optional(),
  model_high_priority: z.boolean().nullable().optional(),
  tool_call_strict_mode: z.boolean().nullable().optional(),

  // Knowledge base
  knowledge_base_ids: z.array(z.string()).nullable().optional(),
  kb_config: KbConfigSchema.nullable().optional(),

  // Conversation
  start_speaker: StartSpeakerSchema.optional(),
  begin_after_user_silence_ms: z.number().nullable().optional(),
  begin_message: z.string().nullable().optional(),
  general_prompt: z.string().nullable().optional(),

  // Tools & states
  general_tools: z.array(LlmToolSchema).nullable().optional(),
  states: z.array(LlmStateSchema).nullable().optional(),
  starting_state: z.string().nullable().optional(),

  // Dynamic variables
  default_dynamic_variables: z
    .record(z.string(), z.string())
    .nullable()
    .optional(),

  // MCP
  mcps: z.array(McpConfigSchema).nullable().optional(),
})
