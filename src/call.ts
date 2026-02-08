import { z } from "zod"
import { createCallAnalysisSchema } from "./analysis"
import { CallCostSchema, LlmTokenUsageSchema } from "./cost"
import {
  CallStatusSchema,
  DataStorageSettingSchema,
  DisconnectionReasonSchema,
} from "./enums"
import { CallLatencySchema } from "./latency"
import { TimestampedUtteranceSchema, TranscriptEntrySchema } from "./transcript"

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface CallSchemaConfig {
  /** Shape of the `metadata` object. Defaults to a loose (passthrough) object. */
  metadata: z.ZodType
  /** Shape of the `retell_llm_dynamic_variables` object. */
  dynamicVariables: z.ZodType
  /**
   * Shape of the `collected_dynamic_variables` object. Only populated after the
   * call ends.
   */
  collectedDynamicVariables: z.ZodType
  /** Shape of `call_analysis.custom_analysis_data`. */
  analysisData: z.ZodType
  /**
   * When true, omits `.catch()` fallbacks so schemas fail fast on unexpected
   * data. When false (default), required ended/analysis fields use `.catch()`
   * for resilient webhook parsing.
   */
  strict?: boolean
}

/** Sensible defaults for all configurable fields (loose passthrough objects). */
export const callSchemaDefaults = {
  metadata: z.looseObject({}),
  dynamicVariables: z.looseObject({}),
  collectedDynamicVariables: z.looseObject({}),
  analysisData: z.looseObject({}),
  strict: false,
} satisfies CallSchemaConfig

// ---------------------------------------------------------------------------
// Phone call / web call discriminated union
// ---------------------------------------------------------------------------

const PhoneCallSchema = z.object({
  call_type: z.literal("phone_call"),
  from_number: z.string().nullable(),
  to_number: z.string(),
  direction: z.enum(["inbound", "outbound"]),
  telephony_identifier: z
    .object({ twilio_call_sid: z.string().optional() })
    .optional(),
})

const WebCallSchema = z.object({
  call_type: z.literal("web_call"),
  access_token: z.string(),
})

const CallTypeSchema = z.discriminatedUnion("call_type", [
  PhoneCallSchema,
  WebCallSchema,
])

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a set of lifecycle-aware call schemas with custom types for
 * `metadata`, `retell_llm_dynamic_variables`, `collected_dynamic_variables`,
 * and `call_analysis.custom_analysis_data`.
 *
 * Timestamps are always coerced to `Date` objects. When `strict` is false
 * (default), required ended/analysis fields include `.catch()` fallbacks for
 * resilient parsing.
 *
 * Spread `callSchemaDefaults` and override only what you need:
 *
 * ```ts
 * const schemas = createCallSchemas({
 *   ...callSchemaDefaults,
 *   metadata: z.object({ location_id: z.string() }),
 * })
 * ```
 */
export function createCallSchemas<
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

  // -- Base: all V2CallBase fields, any lifecycle state ---------------------
  const baseFields = z.object({
    call_id: z.string(),
    agent_id: z.string(),
    agent_name: z.string().optional(),
    agent_version: z.number(),
    call_status: CallStatusSchema,
    metadata: config.metadata.optional(),
    retell_llm_dynamic_variables: config.dynamicVariables.optional(),
    collected_dynamic_variables: config.collectedDynamicVariables.optional(),
    custom_sip_headers: z.record(z.string(), z.string()).optional(),
    data_storage_setting: DataStorageSettingSchema.nullable().optional(),
    opt_in_signed_url: z.boolean().optional(),
    /**
     * Real-time transcript including tool calls. Present during ongoing calls
     * (e.g. function call webhooks) and after call ends.
     */
    transcript_with_tool_calls: z.array(TranscriptEntrySchema).optional(),
  })

  const base = z.intersection(baseFields, CallTypeSchema)

  // -- Ended: fields available after the call terminates -------------------
  const endedFields = z.object({
    /** Coerced to Date from Retell's millisecond epoch timestamp. */
    start_timestamp: strict
      ? z.coerce.date()
      : z.coerce.date().catch(new Date(0)),
    /** Coerced to Date from Retell's millisecond epoch timestamp. */
    end_timestamp: strict
      ? z.coerce.date()
      : z.coerce.date().catch(new Date(0)),
    /** Call duration in milliseconds. */
    duration_ms: strict ? z.number() : z.number().catch(0),
    /** Why the call was disconnected. */
    disconnection_reason: DisconnectionReasonSchema,
    /** Plain-text transcript. May be absent if data storage settings strip it. */
    transcript: z.string().optional(),
    /** Structured transcript with word-level timestamps. */
    transcript_object: z.array(TimestampedUtteranceSchema).optional(),
    /** Transcript without PII, with tool call entries. */
    scrubbed_transcript_with_tool_calls: z
      .array(TranscriptEntrySchema)
      .optional(),
    recording_url: z.string().optional(),
    recording_multi_channel_url: z.string().optional(),
    /** Recording without PII. Only present when PII scrubbing is enabled. */
    scrubbed_recording_url: z.string().optional(),
    scrubbed_recording_multi_channel_url: z.string().optional(),
    public_log_url: z.string().optional(),
    /** Only present when knowledge base feature was used. */
    knowledge_base_retrieved_contents_url: z.string().optional(),
    /**
     * Where the call was transferred to. Only populated when
     * `disconnection_reason` is `"call_transfer"`.
     */
    transfer_destination: z.string().nullable().optional(),
    /** Latency breakdown. Not all sub-metrics are present on every call. */
    latency: CallLatencySchema.optional(),
    call_cost: CallCostSchema.optional(),
    /**
     * LLM token usage. Not populated for custom LLM, Realtime API, or calls
     * where no LLM request was made.
     */
    llm_token_usage: LlmTokenUsageSchema.optional(),
  })

  const ended = z.intersection(base, endedFields)

  // -- Analyzed: fields available after post-call analysis -----------------
  const callAnalysis = createCallAnalysisSchema(config.analysisData, strict)
  const analyzedFields = z.object({
    call_analysis: callAnalysis,
  })

  const analyzed = z.intersection(ended, analyzedFields)

  return { base, ended, analyzed }
}

// ---------------------------------------------------------------------------
// Pre-built schemas with default (loose) types
// ---------------------------------------------------------------------------

/** Pre-built call schemas with loose (passthrough) types for custom fields. */
export const CallSchemas = createCallSchemas(callSchemaDefaults)
