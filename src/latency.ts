import { z } from "zod"

/** A single latency metric with percentiles and raw values. */
export const LatencyMetricSchema = z.object({
  p50: z.number(),
  p90: z.number(),
  p95: z.number(),
  p99: z.number(),
  max: z.number(),
  min: z.number(),
  num: z.number(),
  values: z.array(z.number()),
})

/**
 * Full latency breakdown for a call. Not all fields are present on every call;
 * presence depends on call type and features used.
 */
export const CallLatencySchema = z.object({
  /** End-to-end latency (user stops talking -> agent starts talking). */
  e2e: LatencyMetricSchema.optional(),
  /** Transcription latency. */
  asr: LatencyMetricSchema.optional(),
  /** LLM response latency (request -> first speakable chunk). */
  llm: LatencyMetricSchema.optional(),
  /** LLM websocket round-trip. Only for custom LLM calls. */
  llm_websocket_network_rtt: LatencyMetricSchema.optional(),
  /** Text-to-speech latency (trigger -> first audio byte). */
  tts: LatencyMetricSchema.optional(),
  /** Knowledge base retrieval latency. Only when KB feature is used. */
  knowledge_base: LatencyMetricSchema.optional(),
  /** Speech-to-speech latency. Only for S2S model calls (e.g. Realtime API). */
  s2s: LatencyMetricSchema.optional(),
})
