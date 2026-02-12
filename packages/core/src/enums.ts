import { z } from "zod"

/** All possible call statuses throughout the call lifecycle. */
export const CallStatusSchema = z.enum([
  "registered",
  "not_connected",
  "ongoing",
  "ended",
  "error",
])

/** All possible chat statuses throughout the chat lifecycle. */
export const ChatStatusSchema = z.enum(["ongoing", "ended", "error"])

/** Chat type discriminator. */
export const ChatTypeSchema = z.enum(["api_chat", "sms_chat"])

/**
 * All possible disconnection reasons. Covers normal hangups, transfers,
 * telephony issues, and internal errors.
 */
export const DisconnectionReasonSchema = z.enum([
  // Normal
  "user_hangup",
  "agent_hangup",
  "call_transfer",
  "voicemail_reached",
  "inactivity",
  "max_duration_reached",
  // Limits & billing
  "concurrency_limit_reached",
  "no_valid_payment",
  "scam_detected",
  // Telephony / dialing
  "dial_busy",
  "dial_failed",
  "dial_no_answer",
  "invalid_destination",
  "telephony_provider_permission_denied",
  "telephony_provider_unavailable",
  "sip_routing_error",
  "marked_as_spam",
  "user_declined",
  // Errors
  "error_llm_websocket_open",
  "error_llm_websocket_lost_connection",
  "error_llm_websocket_runtime",
  "error_llm_websocket_corrupt_payload",
  "error_no_audio_received",
  "error_asr",
  "error_retell",
  "error_unknown",
  "error_user_not_joined",
  "registered_call_timeout",
])

/** User sentiment as determined by post-call/chat analysis. */
export const UserSentimentSchema = z.enum([
  "Negative",
  "Positive",
  "Neutral",
  "Unknown",
])

/**
 * Controls what data Retell stores for the call/agent. Replaces the deprecated
 * `opt_out_sensitive_data_storage` field.
 */
export const DataStorageSettingSchema = z.enum([
  "everything",
  "everything_except_pii",
  "basic_attributes_only",
])

/** LLM model choices for text generation and post-call/chat analysis. */
export const LlmModelSchema = z.enum([
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gpt-5",
  "gpt-5.1",
  "gpt-5.2",
  "gpt-5-mini",
  "gpt-5-nano",
  "claude-4.5-sonnet",
  "claude-4.5-haiku",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-3.0-flash",
])

/** Speech-to-speech model options. */
export const S2sModelSchema = z.enum([
  "gpt-4o-realtime",
  "gpt-4o-mini-realtime",
  "gpt-realtime",
  "gpt-realtime-mini",
])

/** TTS voice model options. */
export const VoiceModelSchema = z.enum([
  "eleven_turbo_v2",
  "eleven_flash_v2",
  "eleven_turbo_v2_5",
  "eleven_flash_v2_5",
  "eleven_multilingual_v2",
  "sonic-2",
  "sonic-3",
  "sonic-3-latest",
  "sonic-turbo",
  "tts-1",
  "gpt-4o-mini-tts",
  "speech-02-turbo",
  "speech-2.8-turbo",
])

/** Voice emotion options (Cartesia and Minimax providers). */
export const VoiceEmotionSchema = z.enum([
  "calm",
  "sympathetic",
  "happy",
  "sad",
  "angry",
  "fearful",
  "surprised",
])

/** Ambient background sound options. */
export const AmbientSoundSchema = z.enum([
  "coffee-shop",
  "convention-hall",
  "summer-outdoor",
  "mountain-outdoor",
  "static-noise",
  "call-center",
])

/**
 * Agent language / dialect options. Superset used by both voice and chat
 * agents.
 */
export const AgentLanguageSchema = z.enum([
  "en-US",
  "en-IN",
  "en-GB",
  "en-AU",
  "en-NZ",
  "de-DE",
  "es-ES",
  "es-419",
  "hi-IN",
  "fr-FR",
  "fr-CA",
  "ja-JP",
  "pt-PT",
  "pt-BR",
  "zh-CN",
  "ru-RU",
  "it-IT",
  "ko-KR",
  "nl-NL",
  "nl-BE",
  "pl-PL",
  "tr-TR",
  "vi-VN",
  "ro-RO",
  "bg-BG",
  "ca-ES",
  "th-TH",
  "da-DK",
  "fi-FI",
  "el-GR",
  "hu-HU",
  "id-ID",
  "no-NO",
  "sk-SK",
  "sv-SE",
  "lt-LT",
  "lv-LV",
  "cs-CZ",
  "ms-MY",
  "af-ZA",
  "ar-SA",
  "az-AZ",
  "bs-BA",
  "cy-GB",
  "fa-IR",
  "fil-PH",
  "gl-ES",
  "he-IL",
  "hr-HR",
  "hy-AM",
  "is-IS",
  "kk-KZ",
  "kn-IN",
  "mk-MK",
  "mr-IN",
  "ne-NP",
  "sl-SI",
  "sr-RS",
  "sw-KE",
  "ta-IN",
  "ur-IN",
  "yue-CN",
  "uk-UA",
  "multi",
])

/** Webhook event types for voice agents. */
export const WebhookEventSchema = z.enum([
  "call_started",
  "call_ended",
  "call_analyzed",
  "transcript_updated",
  "transfer_started",
  "transfer_bridged",
  "transfer_cancelled",
  "transfer_ended",
])

/** Who starts the conversation (used by LLM and conversation flow). */
export const StartSpeakerSchema = z.enum(["user", "agent"])

// ---------------------------------------------------------------------------
// Conversation flow enums
// ---------------------------------------------------------------------------

/** All possible conversation flow node types. */
export const FlowNodeTypeSchema = z.enum([
  "conversation",
  "end",
  "function",
  "transfer_call",
  "press_digit",
  "branch",
  "sms",
  "extract_dynamic_variables",
  "agent_swap",
  "mcp",
  "component",
])

/** Transition condition type on a flow edge. */
export const FlowTransitionConditionTypeSchema = z.enum(["prompt", "equation"])

/** Instruction type within a flow node. */
export const FlowInstructionTypeSchema = z.enum(["prompt", "static_text"])

/** Comparison operator within a single equation condition. */
export const EquationOperatorSchema = z.enum([
  "==",
  "!=",
  ">",
  ">=",
  "<",
  "<=",
  "contains",
  "not_contains",
  "exists",
  "not_exist",
])

/** Combinator for joining multiple equations in a transition condition. */
export const EquationCombinatorSchema = z.enum(["||", "&&"])

// ---------------------------------------------------------------------------
// Voice agent enums
// ---------------------------------------------------------------------------

/** STT (speech-to-text) mode for voice agents. */
export const SttModeSchema = z.enum(["fast", "accurate"])

/** Vocabulary specialization mode for voice agents. */
export const VocabSpecializationSchema = z.enum(["general", "medical"])

/** Audio denoising mode for voice agents. */
export const DenoisingModeSchema = z.enum([
  "noise-cancellation",
  "noise-and-background-speech-cancellation",
])

/** Phonetic alphabet for pronunciation dictionary entries. */
export const PronunciationAlphabetSchema = z.enum(["ipa", "cmu"])

/** PII category for scrubbing configuration. */
export const PiiCategorySchema = z.enum([
  "person_name",
  "address",
  "email",
  "phone_number",
  "ssn",
  "passport",
  "driver_license",
  "credit_card",
  "bank_account",
  "password",
  "pin",
  "medical_id",
  "date_of_birth",
])

/** Voicemail detection action type. */
export const VoicemailActionTypeSchema = z.enum([
  "prompt",
  "static_text",
  "hangup",
])

// ---------------------------------------------------------------------------
// LLM tool enums
// ---------------------------------------------------------------------------

/** LLM tool type discriminator. */
export const LlmToolTypeSchema = z.enum([
  "end_call",
  "transfer_call",
  "check_availability_cal",
  "book_appointment_cal",
  "press_digit",
  "custom",
  "extract_dynamic_variable",
  "agent_swap",
  "mcp",
  "send_sms",
])

/** HTTP method for custom tool requests. */
export const ToolHttpMethodSchema = z.enum([
  "GET",
  "POST",
  "PATCH",
  "PUT",
  "DELETE",
])

/** How parameters are encoded in the request body. */
export const ToolParameterTypeSchema = z.enum(["json", "form"])
