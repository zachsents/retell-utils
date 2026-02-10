import { z } from "zod"
import { CallSchemas } from "./call"
import { ChatSchemas } from "./chat"

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates webhook event schemas from your custom call/chat schemas. Pass the
 * objects returned by `createCallSchemas()` and `createChatSchemas()` to get
 * webhook payloads with the same precise types.
 *
 * ```ts
 * const myCall = createCallSchemas({
 *   ...callSchemaDefaults,
 *   metadata: z.object({ id: z.string() }),
 * })
 * const myChat = createChatSchemas(chatSchemaDefaults)
 * const webhooks = createWebhookSchemas({ call: myCall, chat: myChat })
 * ```
 */
export function createWebhookSchemas<
  TCallBase extends z.ZodType,
  TCallEnded extends z.ZodType,
  TCallAnalyzed extends z.ZodType,
  TChatEnded extends z.ZodType,
  TChatAnalyzed extends z.ZodType,
>(schemas: {
  call: { base: TCallBase; ended: TCallEnded; analyzed: TCallAnalyzed }
  chat: { ended: TChatEnded; analyzed: TChatAnalyzed }
}) {
  const callStarted = z.object({
    event: z.literal("call_started"),
    call: schemas.call.base,
  })

  const callEnded = z.object({
    event: z.literal("call_ended"),
    call: schemas.call.ended,
  })

  const callAnalyzed = z.object({
    event: z.literal("call_analyzed"),
    call: schemas.call.analyzed,
  })

  const chatEnded = z.object({
    event: z.literal("chat_ended"),
    chat: schemas.chat.ended,
  })

  const chatAnalyzed = z.object({
    event: z.literal("chat_analyzed"),
    chat: schemas.chat.analyzed,
  })

  /** Discriminated union of all webhook event types. */
  const event = z.discriminatedUnion("event", [
    callStarted,
    callEnded,
    callAnalyzed,
    chatEnded,
    chatAnalyzed,
  ])

  return {
    callStarted,
    callEnded,
    callAnalyzed,
    chatEnded,
    chatAnalyzed,
    event,
  }
}

// ---------------------------------------------------------------------------
// Pre-built schemas with default (loose) types
// ---------------------------------------------------------------------------

/** Pre-built webhook schemas with loose (passthrough) types for custom fields. */
export const WebhookSchemas = createWebhookSchemas({
  call: CallSchemas,
  chat: ChatSchemas,
})
