import { z } from "zod"
import { UserSentimentSchema } from "./enums"

/**
 * Creates a call analysis schema with a custom `custom_analysis_data` shape.
 * Available after post-call analysis completes.
 */
export function createCallAnalysisSchema<TAnalysis extends z.ZodType>(
  analysisData: TAnalysis,
) {
  return z.object({
    call_summary: z.string().optional(),
    in_voicemail: z.boolean().optional(),
    user_sentiment: UserSentimentSchema.optional(),
    call_successful: z.boolean().optional(),
    custom_analysis_data: analysisData.optional(),
  })
}

/**
 * Creates a chat analysis schema with a custom `custom_analysis_data` shape.
 * Available after post-chat analysis completes.
 */
export function createChatAnalysisSchema<TAnalysis extends z.ZodType>(
  analysisData: TAnalysis,
) {
  return z.object({
    chat_summary: z.string().optional(),
    user_sentiment: UserSentimentSchema.optional(),
    chat_successful: z.boolean().optional(),
    custom_analysis_data: analysisData.optional(),
  })
}
