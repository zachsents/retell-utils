import { z } from "zod"
import { createCallAnalysisSchema } from "./analysis"
import { CallCostSchema, LlmTokenUsageSchema } from "./cost"
import {
  CallStatusSchema,
  DataStorageSettingSchema,
  DisconnectionReasonSchema,
} from "./enums"
import { CallLatencySchema } from "./latency"
import { e164PhoneSchema, e164OrNullSchema } from "./phone"
import { TimestampedUtteranceSchema, TranscriptEntrySchema } from "./transcript"

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface CallSchemaConfig {
  /**
   * Shape of the `metadata` object. Defaults to a loose (passthrough) object
   * with `.prefault({})`.
   */
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
}

/**
 * Sensible defaults for all configurable fields. Object fields use
 * `.prefault({})` so they are always present (never undefined). Analysis data
 * is `.optional()` since not all agents configure custom analysis.
 */
export const callSchemaDefaults = {
  metadata: z.looseObject({}).prefault({}),
  dynamicVariables: z.looseObject({}).prefault({}),
  collectedDynamicVariables: z.looseObject({}).prefault({}),
  analysisData: z.looseObject({}).optional(),
} satisfies CallSchemaConfig

// ---------------------------------------------------------------------------
// Phone call / web call discriminated union
// ---------------------------------------------------------------------------

const PhoneCallSchema = z.object({
  call_type: z.literal("phone_call"),
  from_number: e164OrNullSchema,
  to_number: e164PhoneSchema,
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
 * Timestamps are always coerced to `Date` objects. Resilience-sensitive fields
 * use `.catch()` fallbacks so webhook parsing never fails on unexpected data.
 * Generic config schemas are used as-is — the defaults provide `.prefault({})`
 * for always-present object fields.
 *
 * Spread `callSchemaDefaults` and override only what you need:
 *
 * ```ts
 * const schemas = createCallSchemas({
 *   ...callSchemaDefaults,
 *   metadata: z
 *     .looseObject({
 *       location_id: z.string().nullable().default(null),
 *     })
 *     .prefault({}),
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
}) {
  // -- Base: all V2CallBase fields, any lifecycle state ---------------------
  const baseFields = z.object({
    call_id: z.string(),
    agent_id: z.string().optional(),
    agent_name: z.string().optional(),
    agent_version: z.number(),
    call_status: CallStatusSchema,
    metadata: config.metadata,
    retell_llm_dynamic_variables: config.dynamicVariables,
    collected_dynamic_variables: config.collectedDynamicVariables,
    custom_sip_headers: z.record(z.string(), z.string()).optional(),
    data_storage_setting: DataStorageSettingSchema.nullable().optional(),
    opt_in_signed_url: z.boolean().optional(),
    /**
     * Coerced to Date from Retell's millisecond epoch timestamp. Available
     * after call starts.
     */
    start_timestamp: z.coerce.date().catch(new Date(0)),
    /**
     * Real-time transcript including tool calls. Available mid-call with
     * partial transcripts during function call webhooks, and after call ends.
     */
    transcript_with_tool_calls: z.array(TranscriptEntrySchema).prefault([]),
  })

  const base = z.intersection(baseFields, CallTypeSchema)

  // -- Ended: fields available after the call terminates -------------------
  const endedFields = z.object({
    /** Coerced to Date from Retell's millisecond epoch timestamp. */
    end_timestamp: z.coerce.date().catch(new Date(0)),
    /** Call duration in milliseconds. */
    duration_ms: z.number().catch(0),
    /**
     * Why the call was disconnected. Falls back to "error_unknown" if
     * missing/invalid.
     */
    disconnection_reason: DisconnectionReasonSchema.catch("error_unknown"),
    /** Plain-text transcript. May be absent if data storage settings strip it. */
    transcript: z.string().optional(),
    /** Structured transcript with word-level timestamps. */
    transcript_object: z.array(TimestampedUtteranceSchema).optional(),
    /** Transcript without PII, with tool call entries. */
    scrubbed_transcript_with_tool_calls: z
      .array(TranscriptEntrySchema)
      .optional(),
    /** Valid URL or null. Invalid/empty URLs caught as null. */
    recording_url: z.url().nullable().catch(null),
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
    /** Coerced to Date. Available after a transfer call ends. */
    transfer_end_timestamp: z.coerce.date().optional(),
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
  const callAnalysis = createCallAnalysisSchema(config.analysisData)
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
