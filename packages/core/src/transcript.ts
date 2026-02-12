import { z } from "zod"

/** A single word with its start/end timestamps in the call audio. */
export const WordTimestampSchema = z.object({
  word: z.string(),
  /** Start time in seconds (relative to call audio, not wall time). */
  start: z.number(),
  /** End time in seconds (relative to call audio, not wall time). */
  end: z.number(),
})

/**
 * Agent/user/transfer_target utterance. Present in both `transcript_object` and
 * `transcript_with_tool_calls`.
 */
export const UtteranceSchema = z.object({
  role: z.enum(["agent", "user", "transfer_target"]),
  content: z.string(),
  words: z.array(WordTimestampSchema).optional(),
  /**
   * Extra metadata attached by Retell. Observed in practice but not in the
   * OpenAPI spec. Contains fields like `response_id`.
   */
  metadata: z.record(z.string(), z.unknown()).optional(),
})

/** Tool call invocation entry in the transcript. */
export const ToolCallInvocationSchema = z.object({
  role: z.literal("tool_call_invocation"),
  tool_call_id: z.string(),
  name: z.string(),
  /** Stringified JSON of the function arguments. */
  arguments: z.string(),
  /**
   * Thought signature from Gemini thinking models. Used internally for
   * reasoning chain in multi-turn function calling.
   */
  thought_signature: z.string().optional(),
})

/** Tool call result entry in the transcript. */
export const ToolCallResultSchema = z.object({
  role: z.literal("tool_call_result"),
  tool_call_id: z.string(),
  /** Result of the tool call (string, stringified JSON, etc). */
  content: z.string(),
  /** Whether the tool call was successful. */
  successful: z.boolean().optional(),
})

/** Node transition entry in the transcript (conversation flow agents). */
export const NodeTransitionSchema = z.object({
  role: z.literal("node_transition"),
  former_node_id: z.string().optional(),
  former_node_name: z.string().optional(),
  new_node_id: z.string().optional(),
  new_node_name: z.string().optional(),
  /** Timestamp in seconds when the transition occurred. Observed in practice. */
  time_sec: z.number().optional(),
  /** Whether this was triggered by a global node. Observed in practice. */
  global_transition: z.boolean().optional(),
})

/** DTMF digit pressed by the user from their phone keypad. */
export const DTMFSchema = z.object({
  role: z.literal("dtmf"),
  /** Single character: "0"-"9", "*", "#". */
  digit: z.string(),
})

/**
 * Union of all transcript entry types found in `transcript_with_tool_calls` and
 * `scrubbed_transcript_with_tool_calls`.
 */
export const TranscriptEntrySchema = z.discriminatedUnion("role", [
  UtteranceSchema.extend({ role: z.literal("agent") }),
  UtteranceSchema.extend({ role: z.literal("user") }),
  UtteranceSchema.extend({ role: z.literal("transfer_target") }),
  ToolCallInvocationSchema,
  ToolCallResultSchema,
  NodeTransitionSchema,
  DTMFSchema,
])

/**
 * Utterance with required word timestamps. Used in `transcript_object` where
 * words are always present.
 */
export const TimestampedUtteranceSchema = UtteranceSchema.extend({
  words: z.array(WordTimestampSchema),
})
