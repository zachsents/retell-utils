import { z } from "zod"
import { UserSentimentSchema } from "./enums"

/**
 * Creates a call analysis schema with a custom `custom_analysis_data` shape.
 * Available after post-call analysis completes.
 *
 * `call_summary` uses `.min(1).nullable().catch(null)` so empty strings become
 * null and missing/invalid summaries are caught as null.
 */
export function createCallAnalysisSchema<TAnalysis extends z.ZodType>(
  analysisData: TAnalysis,
) {
  return z.object({
    call_summary: z.string().min(1).nullable().catch(null),
    in_voicemail: z.boolean().optional(),
    user_sentiment: UserSentimentSchema.optional(),
    call_successful: z.boolean().optional(),
    custom_analysis_data: analysisData,
  })
}

/**
 * Creates a chat analysis schema with a custom `custom_analysis_data` shape.
 * Available after post-chat analysis completes.
 *
 * `chat_summary` uses `.min(1).nullable().catch(null)` so empty strings become
 * null and missing/invalid summaries are caught as null.
 */
export function createChatAnalysisSchema<TAnalysis extends z.ZodType>(
  analysisData: TAnalysis,
) {
  return z.object({
    chat_summary: z.string().min(1).nullable().catch(null),
    user_sentiment: UserSentimentSchema.optional(),
    chat_successful: z.boolean().optional(),
    custom_analysis_data: analysisData,
  })
}
