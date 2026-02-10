import { z } from "zod"
import { createChatAnalysisSchema } from "./analysis"
import { ChatCostSchema } from "./cost"
import { ChatStatusSchema, ChatTypeSchema } from "./enums"
import { ChatMessageEntrySchema } from "./chat-messages"

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface ChatSchemaConfig {
  /**
   * Shape of the `metadata` object. Defaults to a loose (passthrough) object
   * with `.prefault({})`.
   */
  metadata: z.ZodType
  /** Shape of the `retell_llm_dynamic_variables` object. */
  dynamicVariables: z.ZodType
  /**
   * Shape of the `collected_dynamic_variables` object. Only populated after the
   * chat ends.
   */
  collectedDynamicVariables: z.ZodType
  /** Shape of `chat_analysis.custom_analysis_data`. */
  analysisData: z.ZodType
}

/**
 * Sensible defaults for all configurable fields. Object fields use
 * `.prefault({})` so they are always present (never undefined). Analysis data
 * is `.optional()` since not all agents configure custom analysis.
 */
export const chatSchemaDefaults = {
  metadata: z.looseObject({}).prefault({}),
  dynamicVariables: z.looseObject({}).prefault({}),
  collectedDynamicVariables: z.looseObject({}).prefault({}),
  analysisData: z.looseObject({}).optional(),
} satisfies ChatSchemaConfig

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a set of lifecycle-aware chat schemas with custom types for
 * `metadata`, `retell_llm_dynamic_variables`, `collected_dynamic_variables`,
 * and `chat_analysis.custom_analysis_data`.
 *
 * Timestamps are always coerced to `Date` objects. Resilience-sensitive fields
 * use `.catch()` fallbacks so webhook parsing never fails on unexpected data.
 * Generic config schemas are used as-is — the defaults provide `.prefault({})`
 * for always-present object fields.
 *
 * Spread `chatSchemaDefaults` and override only what you need:
 *
 * ```ts
 * const schemas = createChatSchemas({
 *   ...chatSchemaDefaults,
 *   metadata: z
 *     .looseObject({
 *       location_id: z.string().nullable().default(null),
 *     })
 *     .prefault({}),
 * })
 * ```
 */
export function createChatSchemas<
  TMeta extends z.ZodType,
  TDynVars extends z.ZodType,
  TCollected extends z.ZodType,
  TAnalysis extends z.ZodType,
>(config: {
  metadata: TMeta
  dynamicVariables: TDynVars
  collectedDynamicVariables: TCollected
  analysisData: TAnalysis
}) {
  // -- Base: all fields present from chat creation -------------------------
  const base = z.object({
    chat_id: z.string(),
    agent_id: z.string().optional(),
    /** Agent version. */
    version: z.number().nullable().optional(),
    chat_status: ChatStatusSchema,
    chat_type: ChatTypeSchema.optional(),
    metadata: config.metadata,
    retell_llm_dynamic_variables: config.dynamicVariables,
    collected_dynamic_variables: config.collectedDynamicVariables,
    /** Key-value attributes. Values can be string, number, or boolean. */
    custom_attributes: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .optional(),
    /** Transcript with tool call and node/state transition entries. */
    message_with_tool_calls: z.array(ChatMessageEntrySchema).optional(),
  })

  // -- Ended: fields available after the chat terminates -------------------
  const endedFields = z.object({
    /** Coerced to Date from Retell's millisecond epoch timestamp. */
    start_timestamp: z.coerce.date().catch(new Date(0)),
    /**
     * Coerced to Date from Retell's millisecond epoch timestamp. Null when chat
     * was force-ended.
     */
    end_timestamp: z.coerce.date().nullable().optional(),
    /** Plain-text transcript. */
    transcript: z.string().optional(),
    chat_cost: ChatCostSchema.optional(),
  })

  const ended = z.intersection(base, endedFields)

  // -- Analyzed: fields available after post-chat analysis -----------------
  const chatAnalysis = createChatAnalysisSchema(config.analysisData)
  const analyzedFields = z.object({
    chat_analysis: chatAnalysis,
  })

  const analyzed = z.intersection(ended, analyzedFields)

  return { base, ended, analyzed }
}

// ---------------------------------------------------------------------------
// Pre-built schemas with default (loose) types
// ---------------------------------------------------------------------------

/** Pre-built chat schemas with loose (passthrough) types for custom fields. */
export const ChatSchemas = createChatSchemas(chatSchemaDefaults)
