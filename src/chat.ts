import { z } from "zod"
import { createChatAnalysisSchema } from "./analysis"
import { ChatCostSchema } from "./cost"
import { ChatStatusSchema, ChatTypeSchema } from "./enums"
import { ChatMessageEntrySchema } from "./chat-messages"

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface ChatSchemaConfig {
  /** Shape of the `metadata` object. Defaults to a loose (passthrough) object. */
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
  /**
   * When true, omits `.catch()` fallbacks so schemas fail fast on unexpected
   * data. When false (default), required ended/analysis fields use `.catch()`
   * for resilient webhook parsing.
   */
  strict?: boolean
}

/** Sensible defaults for all configurable fields (loose passthrough objects). */
export const chatSchemaDefaults = {
  metadata: z.looseObject({}),
  dynamicVariables: z.looseObject({}),
  collectedDynamicVariables: z.looseObject({}),
  analysisData: z.looseObject({}),
  strict: false,
} satisfies ChatSchemaConfig

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a set of lifecycle-aware chat schemas with custom types for
 * `metadata`, `retell_llm_dynamic_variables`, `collected_dynamic_variables`,
 * and `chat_analysis.custom_analysis_data`.
 *
 * Timestamps are always coerced to `Date` objects. When `strict` is false
 * (default), required ended/analysis fields include `.catch()` fallbacks for
 * resilient parsing.
 *
 * Spread `chatSchemaDefaults` and override only what you need:
 *
 * ```ts
 * const schemas = createChatSchemas({
 *   ...chatSchemaDefaults,
 *   metadata: z.object({ location_id: z.string() }),
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
  strict?: boolean
}) {
  const strict = config.strict ?? false

  // -- Base: all fields present from chat creation -------------------------
  const base = z.object({
    chat_id: z.string(),
    agent_id: z.string(),
    /** Agent version. */
    version: z.number().nullable().optional(),
    chat_status: ChatStatusSchema,
    chat_type: ChatTypeSchema.optional(),
    metadata: config.metadata.optional(),
    retell_llm_dynamic_variables: config.dynamicVariables.optional(),
    collected_dynamic_variables: config.collectedDynamicVariables.optional(),
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
    start_timestamp: strict
      ? z.coerce.date()
      : z.coerce.date().catch(new Date(0)),
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
  const chatAnalysis = createChatAnalysisSchema(config.analysisData, strict)
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
