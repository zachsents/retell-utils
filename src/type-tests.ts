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
  // agent_id is optional (testing scenarios)
  const _agentId: string | undefined = base.agent_id
  const _version: number = base.agent_version
  const _status:
    | "registered"
    | "not_connected"
    | "ongoing"
    | "ended"
    | "error" = base.call_status

  // Metadata is always present (prefault) — loose object, never undefined
  const _meta: { [x: string]: unknown } = base.metadata

  const ended = {} as DefaultEnded
  const _start: Date = ended.start_timestamp
  const _end: Date = ended.end_timestamp
  const _dur: number = ended.duration_ms
  const _reason: string = ended.disconnection_reason
  // recording_url: validated URL or null (z.url().nullable().catch(null))
  const _recording: string | null = ended.recording_url

  const analyzed = {} as DefaultAnalyzed
  const _analysis: {
    // call_summary: empty strings → null via .min(1).nullable().catch(null)
    call_summary: string | null
    in_voicemail?: boolean | undefined
    user_sentiment?: "Negative" | "Positive" | "Neutral" | "Unknown" | undefined
    call_successful?: boolean | undefined
    // analysisData default is z.looseObject({}).optional()
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
    _recording,
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
  // Custom metadata — no prefault/optional wrapping, so required
  const _meta: { location_id: string | null } = base.metadata
  const _dynVars: { agent_name: string; timezone: string } =
    base.retell_llm_dynamic_variables

  const analyzed = {} as CustomAnalyzed
  // Custom analysisData — no optional wrapping, so required
  const _analysis: {
    first_name: string | null
    should_create_crm_sales_lead: boolean
  } = analyzed.call_analysis.custom_analysis_data

  return { _meta, _dynVars, _analysis }
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
  // Default metadata is prefaulted — always present
  const _meta: { [x: string]: unknown } = base.metadata

  const custom = {} as CustomChat
  // Custom metadata — no wrapping, so required
  const _customMeta: { session_id: string } = custom.metadata

  return { _chatId, _status, _meta, _customMeta }
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
    // Custom metadata flows through webhook schemas
    const _meta: { location_id: string | null } = customEvent.call.metadata
    return _meta
  }
}

// Ensure all assertion functions are "used"
void assertDefaultCallTypes
void assertCustomCallTypes
void assertChatTypes
void assertWebhookTypes
