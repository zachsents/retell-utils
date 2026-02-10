import { z } from "zod"
import { DataStorageSettingSchema } from "./enums"

// ---------------------------------------------------------------------------
// Response engine (shared by voice and chat agents)
// ---------------------------------------------------------------------------

/** Response engine variant: Retell-hosted LLM. */
export const ResponseEngineRetellLlmSchema = z.object({
  type: z.literal("retell-llm"),
  llm_id: z.string(),
  version: z.number().nullable().optional(),
})

/** Response engine variant: custom (self-hosted) LLM. */
export const ResponseEngineCustomLlmSchema = z.object({
  type: z.literal("custom-llm"),
  llm_websocket_url: z.string(),
})

/** Response engine variant: conversation flow. */
export const ResponseEngineConversationFlowSchema = z.object({
  type: z.literal("conversation-flow"),
  conversation_flow_id: z.string(),
  version: z.number().nullable().optional(),
})

/**
 * Discriminated union of all response engine types. Used in both voice and chat
 * agent responses.
 */
export const ResponseEngineSchema = z.discriminatedUnion("type", [
  ResponseEngineRetellLlmSchema,
  ResponseEngineCustomLlmSchema,
  ResponseEngineConversationFlowSchema,
])

// ---------------------------------------------------------------------------
// Voice agent response
// ---------------------------------------------------------------------------

/**
 * Zod schema for a voice agent response from the Retell API. Validates
 * structural fields (IDs, response engine, version) and passes through all
 * other fields for forward compatibility.
 */
export const VoiceAgentResponseSchema = z
  .object({
    agent_id: z.string(),
    agent_name: z.string().nullable().optional(),
    response_engine: ResponseEngineSchema,
    voice_id: z.string(),
    version: z.number().optional(),
    is_published: z.boolean().optional(),
    last_modification_timestamp: z.number(),
    language: z.string().optional(),
    data_storage_setting: DataStorageSettingSchema.nullable().optional(),
  })
  .passthrough()

// ---------------------------------------------------------------------------
// Chat agent response
// ---------------------------------------------------------------------------

/**
 * Zod schema for a chat agent response from the Retell API. Same philosophy as
 * VoiceAgentResponseSchema: validate structural fields, passthrough the rest.
 */
export const ChatAgentResponseSchema = z
  .object({
    agent_id: z.string(),
    agent_name: z.string().nullable().optional(),
    response_engine: ResponseEngineSchema,
    version: z.number().optional(),
    is_published: z.boolean().optional(),
    last_modification_timestamp: z.number(),
    language: z.string().optional(),
    data_storage_setting: DataStorageSettingSchema.nullable().optional(),
  })
  .passthrough()
