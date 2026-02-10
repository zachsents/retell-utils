/** Documentation for agent config fields from Retell SDK. */
export const agentFieldDocs: Record<string, string> = {
  agent_name: "The name of the agent. Only used for your own reference.",
  allow_user_dtmf:
    "If true, DTMF input will be accepted and processed. Default true.",
  ambient_sound:
    "Ambient environment sound to make experience more realistic. Options: coffee-shop, convention-hall, summer-outdoor, mountain-outdoor, static-noise, call-center.",
  ambient_sound_volume: "Volume of ambient sound [0,2]. Default 1.",
  analysis_successful_prompt:
    "Prompt to determine whether the post call analysis should mark the interaction as successful.",
  analysis_summary_prompt:
    "Prompt to guide how the post call analysis summary should be generated.",
  backchannel_frequency:
    "How often the agent backchannels [0,1]. Only applies when enable_backchannel is true. Default 0.8.",
  backchannel_words:
    "Words the agent uses for backchannel (e.g. 'yeah', 'uh-huh'). Only applies when enable_backchannel is true.",
  begin_message_delay_ms:
    "Delay first message by this many ms [0,5000]. Gives user time to prepare. Only applies when agent speaks first.",
  boosted_keywords:
    "Keywords to bias the transcriber model toward. Commonly used for names, brands, etc.",
  channel: "The channel type for this agent (voice or chat).",
  data_storage_setting:
    "How Retell stores sensitive data. Options: everything, everything_except_pii, basic_attributes_only. Default everything.",
  denoising_mode:
    "Denoising mode. Options: noise-cancellation, noise-and-background-speech-cancellation. Default noise-cancellation.",
  enable_backchannel:
    "Whether agent interjects with phrases like 'yeah', 'uh-huh' to show engagement. Default false.",
  end_call_after_silence_ms:
    "End call after this many ms of user silence after agent speech. Min 10000. Default 600000 (10 min).",
  fallback_voice_ids:
    "Fallback voices when primary TTS provider has outages. Must be from different providers.",
  interruption_sensitivity:
    "How sensitive to user interruptions [0,1]. Lower = harder to interrupt. Default 1. Set to 0 to never interrupt.",
  language:
    "Language/dialect for speech recognition. Default en-US. Use 'multi' for multilingual.",
  llm_websocket_url:
    "Websocket URL for custom LLM. Only applies to agents with custom-llm response engine type.",
  max_call_duration_ms:
    "Max call length in ms. Min 60000 (1 min), max 7200000 (2 hours). Default 3600000 (1 hour).",
  normalize_for_speech:
    "Normalize numbers, currency, dates to spoken form for consistent synthesis.",
  opt_in_signed_url:
    "Enable signed URLs for public logs/recordings with security signatures that expire after 24 hours.",
  pii_config:
    "Configuration for PII scrubbing from transcripts and recordings.",
  post_call_analysis_data:
    "Custom data to extract from the call during post-call analysis.",
  post_call_analysis_model:
    "Model for post call analysis. Default gpt-4.1-mini.",
  pronunciation_dictionary:
    "Words/phrases with pronunciation guides. Only supported for English & 11labs voices.",
  reminder_max_count:
    "How many times to remind user when unresponsive. Default 1. Set to 0 to disable.",
  reminder_trigger_ms:
    "Trigger reminder after this many ms of user silence. Default 10000 (10s).",
  responsiveness:
    "How responsive the agent is [0,1]. Lower = slower responses. Default 1.",
  ring_duration_ms:
    "Phone ring duration in ms [5000,90000]. Default 30000 (30s).",
  signed_url_expiration_ms:
    "Signed URL expiration time in ms. Only applies when opt_in_signed_url is true. Default 86400000 (24 hours).",
  stt_mode: "Speech-to-text mode. Options: fast, accurate. Default fast.",
  user_dtmf_options: "DTMF options for user input.",
  vocab_specialization:
    "Vocabulary set for transcription. Options: general, medical. Default general. English only.",
  voice_id: "Unique voice ID. Find available voices in Dashboard.",
  voice_model:
    "Voice model for selected voice. Only elevenlab voices have model selections.",
  voice_speed: "Speed of voice [0.5,2]. Default 1.",
  voice_temperature:
    "Voice stability [0,2]. Lower = more stable. Only applies to 11labs. Default 1.",
  voicemail_option:
    "Voicemail detection settings. Actions when voicemail detected in first 3 minutes.",
  volume: "Agent speech volume [0,2]. Default 1.",
  webhook_timeout_ms: "Webhook timeout in ms. Default 10000.",
  webhook_url: "Webhook URL for call events. Overrides account-level webhook.",
}
