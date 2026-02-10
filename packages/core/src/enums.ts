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
