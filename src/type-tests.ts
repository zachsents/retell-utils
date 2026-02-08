/**
 * Type-level tests to verify generic inference. This file is type-checked
 * separately (not included in the main tsconfig) and never built.
 *
 * Run: bunx tsc --noEmit -p tsconfig.test.json
 */

import { z } from "zod"
import {
  CallSchemas,
  callSchemaDefaults,
  createCallSchemas,
  ChatSchemas,
  chatSchemaDefaults,
  createChatSchemas,
  WebhookSchemas,
  createWebhookSchemas,
} from "./index"

// ---------------------------------------------------------------------------
// Helper: extract the output type of a z.intersection by flattening it
// ---------------------------------------------------------------------------

type Flatten<T> = { [K in keyof T]: T[K] }

// ---------------------------------------------------------------------------
// 1. Default schemas - verify field types on base call
// ---------------------------------------------------------------------------

type DefaultBase = Flatten<z.infer<typeof CallSchemas.base>>
type DefaultEnded = Flatten<z.infer<typeof CallSchemas.ended>>
type DefaultAnalyzed = Flatten<z.infer<typeof CallSchemas.analyzed>>

// These are compile-time checks: if the types are wrong, assignments will fail.
// We use a function to avoid "unused variable" issues.
function assertDefaultCallTypes() {
  const base = {} as DefaultBase
  const _callId: string = base.call_id
  const _agentId: string = base.agent_id
  const _version: number = base.agent_version
  const _status:
    | "registered"
    | "not_connected"
    | "ongoing"
    | "ended"
    | "error" = base.call_status

  // Metadata should be a loose object (passthrough) by default
  const _meta: { [x: string]: unknown } | undefined = base.metadata

  const ended = {} as DefaultEnded
  const _start: Date = ended.start_timestamp
  const _end: Date = ended.end_timestamp
  const _dur: number = ended.duration_ms
  const _reason: string = ended.disconnection_reason

  const analyzed = {} as DefaultAnalyzed
  const _analysis: {
    call_summary: string
    in_voicemail?: boolean | undefined
    user_sentiment?: "Negative" | "Positive" | "Neutral" | "Unknown" | undefined
    call_successful?: boolean | undefined
    custom_analysis_data?: { [x: string]: unknown } | undefined
  } = analyzed.call_analysis

  return {
    _callId,
    _agentId,
    _version,
    _status,
    _meta,
    _start,
    _end,
    _dur,
    _reason,
    _analysis,
  }
}

// ---------------------------------------------------------------------------
// 2. Custom schemas - verify generics narrow the types
// ---------------------------------------------------------------------------

const customCallSchemas = createCallSchemas({
  ...callSchemaDefaults,
  metadata: z.object({ location_id: z.string().nullable() }),
  dynamicVariables: z.object({
    agent_name: z.string(),
    timezone: z.string(),
  }),
  analysisData: z.object({
    first_name: z.string().nullable(),
    should_create_crm_sales_lead: z.boolean(),
  }),
})

type CustomBase = Flatten<z.infer<typeof customCallSchemas.base>>
type CustomAnalyzed = Flatten<z.infer<typeof customCallSchemas.analyzed>>

function assertCustomCallTypes() {
  const base = {} as CustomBase
  // Metadata should be narrowed to our custom shape
  const _meta: { location_id: string | null } | undefined = base.metadata
  const _dynVars: { agent_name: string; timezone: string } | undefined =
    base.retell_llm_dynamic_variables

  const analyzed = {} as CustomAnalyzed
  const _analysis = analyzed.call_analysis.custom_analysis_data
  const _check:
    | { first_name: string | null; should_create_crm_sales_lead: boolean }
    | undefined = _analysis

  return { _meta, _dynVars, _check }
}

// ---------------------------------------------------------------------------
// 3. Chat schemas - verify same generic pattern works
// ---------------------------------------------------------------------------

type DefaultChat = z.infer<typeof ChatSchemas.base>

const customChatSchemas = createChatSchemas({
  ...chatSchemaDefaults,
  metadata: z.object({ session_id: z.string() }),
})

type CustomChat = z.infer<typeof customChatSchemas.base>

function assertChatTypes() {
  const base = {} as DefaultChat
  const _chatId: string = base.chat_id
  const _status: "ongoing" | "ended" | "error" = base.chat_status

  const custom = {} as CustomChat
  const _meta: { session_id: string } | undefined = custom.metadata

  return { _chatId, _status, _meta }
}

// ---------------------------------------------------------------------------
// 4. Webhook schemas - verify types flow through
// ---------------------------------------------------------------------------

type WebhookEvent = z.infer<typeof WebhookSchemas.event>

const customWebhooks = createWebhookSchemas({
  call: customCallSchemas,
  chat: ChatSchemas,
})

type CustomWebhookEvent = z.infer<typeof customWebhooks.event>

function assertWebhookTypes() {
  const event = {} as WebhookEvent
  if (event.event === "call_analyzed") {
    const _ts: Date = event.call.start_timestamp
    return _ts
  }
  if (event.event === "chat_analyzed") {
    const _analysis = event.chat.chat_analysis
    return _analysis
  }

  const customEvent = {} as CustomWebhookEvent
  if (customEvent.event === "call_started") {
    const _meta: { location_id: string | null } | undefined =
      customEvent.call.metadata
    return _meta
  }
}

// Ensure all assertion functions are "used"
void assertDefaultCallTypes
void assertCustomCallTypes
void assertChatTypes
void assertWebhookTypes
