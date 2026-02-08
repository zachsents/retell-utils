import { z } from "zod"
import { UserSentimentSchema } from "./enums"

/**
 * Creates a call analysis schema with a custom `custom_analysis_data` shape.
 * Available after post-call analysis completes.
 *
 * When `strict` is false (default), `call_summary` uses `.catch("")` so parsing
 * never fails on that field.
 */
export function createCallAnalysisSchema<TAnalysis extends z.ZodType>(
  analysisData: TAnalysis,
  strict = false,
) {
  return z.object({
    call_summary: strict ? z.string() : z.string().catch(""),
    in_voicemail: z.boolean().optional(),
    user_sentiment: UserSentimentSchema.optional(),
    call_successful: z.boolean().optional(),
    custom_analysis_data: analysisData.optional(),
  })
}

/**
 * Creates a chat analysis schema with a custom `custom_analysis_data` shape.
 * Available after post-chat analysis completes.
 *
 * When `strict` is false (default), `chat_summary` uses `.catch("")` so parsing
 * never fails on that field.
 */
export function createChatAnalysisSchema<TAnalysis extends z.ZodType>(
  analysisData: TAnalysis,
  strict = false,
) {
  return z.object({
    chat_summary: strict ? z.string() : z.string().catch(""),
    user_sentiment: UserSentimentSchema.optional(),
    chat_successful: z.boolean().optional(),
    custom_analysis_data: analysisData.optional(),
  })
}
