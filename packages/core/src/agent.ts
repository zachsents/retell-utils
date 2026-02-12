import { z } from "zod"
import {
  AgentLanguageSchema,
  AmbientSoundSchema,
  DataStorageSettingSchema,
  DenoisingModeSchema,
  LlmModelSchema,
  PiiCategorySchema,
  PronunciationAlphabetSchema,
  SttModeSchema,
  VocabSpecializationSchema,
  VoiceEmotionSchema,
  VoicemailActionTypeSchema,
  VoiceModelSchema,
  WebhookEventSchema,
} from "./enums"

// ---------------------------------------------------------------------------
// Response engine (shared by voice and chat agents)
// ---------------------------------------------------------------------------

/** Response engine variant: Retell-hosted LLM. */
export const ResponseEngineRetellLlmSchema = z.object({
  type: z.literal("retell-llm"),
  llm_id: z.string(),
  version: z.number().nullable().optional(),
})

/** Response engine variant: custom (self-hosted) LLM. */
export const ResponseEngineCustomLlmSchema = z.object({
  type: z.literal("custom-llm"),
  llm_websocket_url: z.string(),
})

/** Response engine variant: conversation flow. */
export const ResponseEngineConversationFlowSchema = z.object({
  type: z.literal("conversation-flow"),
  conversation_flow_id: z.string(),
  version: z.number().nullable().optional(),
})

/**
 * Discriminated union of all response engine types. Used in both voice and chat
 * agent responses.
 */
export const ResponseEngineSchema = z.discriminatedUnion("type", [
  ResponseEngineRetellLlmSchema,
  ResponseEngineCustomLlmSchema,
  ResponseEngineConversationFlowSchema,
])

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------

/** Pronunciation dictionary entry for guiding TTS. */
export const PronunciationEntrySchema = z.object({
  word: z.string(),
  alphabet: PronunciationAlphabetSchema,
  phoneme: z.string(),
})

/** Post-call/chat analysis field definition (polymorphic on `type`). */
export const PostAnalysisFieldSchema = z.object({
  type: z.enum(["string", "enum", "boolean", "number"]),
  name: z.string(),
  description: z.string().optional(),
  examples: z.array(z.unknown()).optional(),
  choices: z.array(z.string()).optional(),
})

/** PII scrubbing configuration. */
export const PiiConfigSchema = z.object({
  mode: z.literal("post_call"),
  categories: z.array(PiiCategorySchema),
})

/** Guardrail configuration for input/output topic filtering. */
export const GuardrailConfigSchema = z.object({
  output_topics: z.array(z.string()).optional(),
  input_topics: z.array(z.string()).optional(),
})

/** Knowledge base retrieval configuration. */
export const KbConfigSchema = z.object({
  top_k: z.number().optional(),
  filter_score: z.number().optional(),
})

/** MCP server configuration. */
export const McpConfigSchema = z.object({
  name: z.string(),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
  query_params: z.record(z.string(), z.string()).optional(),
  timeout_ms: z.number().optional(),
})

// ---------------------------------------------------------------------------
// Voice agent response
// ---------------------------------------------------------------------------

/** Voicemail detection option with action. */
const VoicemailOptionSchema = z.object({
  action: z.object({
    type: VoicemailActionTypeSchema,
    text: z.string().optional(),
  }),
})

/** IVR detection option with action. */
const IvrOptionSchema = z.object({
  action: z.object({
    type: VoicemailActionTypeSchema,
  }),
})

/** Custom STT provider configuration. */
const CustomSttConfigSchema = z.object({
  provider: z.string().optional(),
  endpointing_ms: z.number().optional(),
})

/** DTMF input options for callers. */
const UserDtmfOptionsSchema = z.object({
  digit_limit: z.number().optional(),
  termination_key: z.string().optional(),
  timeout_ms: z.number().optional(),
})

/** Zod schema for a voice agent response from the Retell API. */
export const VoiceAgentResponseSchema = z.object({
  // Required
  agent_id: z.string(),
  version: z.number(),
  response_engine: ResponseEngineSchema,
  voice_id: z.string(),
  last_modification_timestamp: z.number(),

  // Identity
  is_published: z.boolean().optional(),
  agent_name: z.string().nullable().optional(),
  version_description: z.string().nullable().optional(),

  // Voice
  voice_model: VoiceModelSchema.nullable().optional(),
  fallback_voice_ids: z.array(z.string()).nullable().optional(),
  voice_temperature: z.number().optional(),
  voice_speed: z.number().optional(),
  enable_dynamic_voice_speed: z.boolean().optional(),
  volume: z.number().optional(),
  voice_emotion: VoiceEmotionSchema.nullable().optional(),

  // Interaction
  responsiveness: z.number().optional(),
  interruption_sensitivity: z.number().optional(),
  enable_backchannel: z.boolean().optional(),
  backchannel_frequency: z.number().optional(),
  backchannel_words: z.array(z.string()).nullable().optional(),
  reminder_trigger_ms: z.number().optional(),
  reminder_max_count: z.number().optional(),

  // Ambience
  ambient_sound: AmbientSoundSchema.nullable().optional(),
  ambient_sound_volume: z.number().optional(),

  // Language & STT
  language: AgentLanguageSchema.optional(),
  stt_mode: SttModeSchema.optional(),
  custom_stt_config: CustomSttConfigSchema.optional(),
  vocab_specialization: VocabSpecializationSchema.optional(),
  normalize_for_speech: z.boolean().optional(),
  boosted_keywords: z.array(z.string()).nullable().optional(),
  pronunciation_dictionary: z
    .array(PronunciationEntrySchema)
    .nullable()
    .optional(),

  // Webhook
  webhook_url: z.string().nullable().optional(),
  webhook_events: z.array(WebhookEventSchema).nullable().optional(),
  webhook_timeout_ms: z.number().optional(),

  // Call limits
  end_call_after_silence_ms: z.number().optional(),
  max_call_duration_ms: z.number().optional(),
  begin_message_delay_ms: z.number().optional(),
  ring_duration_ms: z.number().optional(),

  // Voicemail & IVR
  enable_voicemail_detection: z.boolean().optional(),
  voicemail_message: z.string().optional(),
  voicemail_detection_timeout_ms: z.number().optional(),
  voicemail_option: VoicemailOptionSchema.nullable().optional(),
  ivr_option: IvrOptionSchema.nullable().optional(),

  // DTMF
  allow_user_dtmf: z.boolean().optional(),
  user_dtmf_options: UserDtmfOptionsSchema.optional(),

  // Post-call analysis
  post_call_analysis_data: z
    .array(PostAnalysisFieldSchema)
    .nullable()
    .optional(),
  post_call_analysis_model: LlmModelSchema.nullable().optional(),
  analysis_successful_prompt: z.string().nullable().optional(),
  analysis_summary_prompt: z.string().nullable().optional(),

  // Privacy & storage
  data_storage_setting: DataStorageSettingSchema.nullable().optional(),
  opt_in_signed_url: z.boolean().optional(),
  signed_url_expiration_ms: z.number().nullable().optional(),
  denoising_mode: DenoisingModeSchema.optional(),
  pii_config: PiiConfigSchema.optional(),
  guardrail_config: GuardrailConfigSchema.optional(),

  // Visibility
  is_public: z.boolean().nullable().optional(),
})

// ---------------------------------------------------------------------------
// Chat agent response
// ---------------------------------------------------------------------------

/** Zod schema for a chat agent response from the Retell API. */
export const ChatAgentResponseSchema = z.object({
  // Required
  agent_id: z.string(),
  response_engine: ResponseEngineSchema,
  last_modification_timestamp: z.number(),

  // Identity
  version: z.number().optional(),
  is_published: z.boolean().optional(),
  agent_name: z.string().nullable().optional(),

  // Chat behavior
  auto_close_message: z.string().nullable().optional(),
  end_chat_after_silence_ms: z.number().optional(),
  language: AgentLanguageSchema.optional(),

  // Webhook
  webhook_url: z.string().nullable().optional(),
  webhook_timeout_ms: z.number().optional(),

  // Post-chat analysis
  post_chat_analysis_data: z
    .array(PostAnalysisFieldSchema)
    .nullable()
    .optional(),
  post_chat_analysis_model: LlmModelSchema.nullable().optional(),
  analysis_successful_prompt: z.string().nullable().optional(),
  analysis_summary_prompt: z.string().nullable().optional(),

  // Privacy & storage
  data_storage_setting: DataStorageSettingSchema.nullable().optional(),
  opt_in_signed_url: z.boolean().optional(),
  signed_url_expiration_ms: z.number().nullable().optional(),
  pii_config: PiiConfigSchema.optional(),

  // Visibility
  is_public: z.boolean().nullable().optional(),
})
