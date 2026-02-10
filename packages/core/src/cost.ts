import { z } from "zod"

/** A single product's cost entry within a call/chat cost breakdown. */
export const ProductCostSchema = z.object({
  /** Product name (e.g. "elevenlabs_tts", "gpt_4_1", "us_twilio_telephony"). */
  product: z.string(),
  /** Unit price in cents per second. */
  unit_price: z.number().optional(),
  /** Total cost for this product in cents. */
  cost: z.number(),
})

/** Full cost breakdown for a call. Available after call ends. */
export const CallCostSchema = z.object({
  product_costs: z.array(ProductCostSchema),
  total_duration_seconds: z.number(),
  total_duration_unit_price: z.number(),
  combined_cost: z.number(),
})

/** Cost breakdown for a chat. Available after chat ends. */
export const ChatCostSchema = z.object({
  product_costs: z.array(ProductCostSchema).optional(),
  combined_cost: z.number().optional(),
})

/**
 * LLM token usage for a call. Not populated for custom LLM, realtime API, or
 * zero-LLM calls.
 */
export const LlmTokenUsageSchema = z.object({
  /** All token count values across LLM requests in the call. */
  values: z.array(z.number()),
  /** Average token count per request. */
  average: z.number(),
  /** Number of LLM requests made during the call. */
  num_requests: z.number(),
})
