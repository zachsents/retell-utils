import { z } from "zod"
import { KbConfigSchema, McpConfigSchema } from "./agent"
import {
  LlmModelSchema,
  LlmToolTypeSchema,
  S2sModelSchema,
  StartSpeakerSchema,
  ToolHttpMethodSchema,
  ToolParameterTypeSchema,
} from "./enums"

// ---------------------------------------------------------------------------
// Tool sub-schemas
// ---------------------------------------------------------------------------

/** Handoff option within a transfer (prompt the receiving agent, etc.). */
const HandoffOptionSchema = z.object({
  type: z.string().optional(),
  prompt: z.string().optional(),
})

/** Transfer destination configuration. */
export const TransferDestinationSchema = z.object({
  type: z.string().optional(),
  prompt: z.string().optional(),
  number: z.string().optional(),
  extension: z.string().optional(),
})

/** Transfer option configuration (warm/cold transfer behavior). */
export const TransferOptionSchema = z.object({
  type: z.string().optional(),
  option: HandoffOptionSchema.optional(),
  public_handoff_option: HandoffOptionSchema.optional(),
  private_handoff_option: HandoffOptionSchema.optional(),
  on_hold_music: z.string().optional(),
  opt_out_initial_message: z.boolean().optional(),
  opt_out_human_detection: z.boolean().optional(),
  agent_detection_timeout_ms: z.number().optional(),
  show_transferee_as_caller: z.boolean().optional(),
  enable_bridge_audio_cue: z.boolean().optional(),
})

// ---------------------------------------------------------------------------
// Tools & states
// ---------------------------------------------------------------------------

/**
 * Schema for an LLM tool. Tools are highly polymorphic (end_call,
 * transfer_call, custom, cal, etc.) so we explicitly declare all known fields
 * and use catchall to preserve any we haven't seen yet.
 */
export const LlmToolSchema = z.object({
  // Common
  type: LlmToolTypeSchema,
  name: z.string().optional(),
  description: z.string().optional(),
  tool_id: z.string().optional(),

  // Custom tool HTTP config
  url: z.string().optional(),
  method: ToolHttpMethodSchema.optional(),
  parameter_type: ToolParameterTypeSchema.optional(),
  parameters: z.unknown().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  query_params: z.record(z.string(), z.string()).optional(),
  args_at_root: z.boolean().optional(),
  timeout_ms: z.number().optional(),
  response_variables: z.record(z.string(), z.string()).optional(),

  // Speech behavior
  speak_during_execution: z.boolean().optional(),
  speak_after_execution: z.boolean().optional(),
  execution_message_description: z.string().optional(),

  // Transfer
  transfer_destination: TransferDestinationSchema.optional(),
  transfer_option: TransferOptionSchema.optional(),
  custom_sip_headers: z.record(z.string(), z.string()).optional(),

  // Cal.com integration
  cal_api_key: z.string().optional(),
  event_type_id: z.number().optional(),
  timezone: z.string().optional(),
})

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
