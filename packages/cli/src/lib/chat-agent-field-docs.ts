/** Documentation for chat agent config fields from Retell SDK. */
export const chatAgentFieldDocs: Record<string, string> = {
  agent_name: "The name of the chat agent. Only used for your own reference.",
  analysis_successful_prompt:
    "Prompt to determine whether the post chat analysis should mark the interaction as successful.",
  analysis_summary_prompt:
    "Prompt to guide how the post chat analysis summary should be generated.",
  auto_close_message:
    "Message to display when the chat is automatically closed due to inactivity.",
  data_storage_setting:
    "How Retell stores sensitive data. Options: everything, everything_except_pii, basic_attributes_only. Default everything.",
  end_chat_after_silence_ms:
    "End chat after this many ms of user silence after agent speech. Min 360000 (6 min), max 259200000 (72 hours). Default 3600000 (1 hour).",
  language:
    "Language/dialect for the chat. Default en-US. Use 'multi' for multilingual.",
  llm_websocket_url:
    "Websocket URL for custom LLM. Only applies to agents with custom-llm response engine type.",
  opt_in_signed_url:
    "Enable signed URLs for public logs with security signatures that expire after 24 hours.",
  pii_config: "Configuration for PII scrubbing from chat transcripts.",
  post_chat_analysis_data:
    "Custom data to extract from the chat during post-chat analysis.",
  post_chat_analysis_model:
    "Model for post chat analysis. Default gpt-4.1-mini.",
  signed_url_expiration_ms:
    "Signed URL expiration time in ms. Only applies when opt_in_signed_url is true. Default 86400000 (24 hours).",
  webhook_timeout_ms: "Webhook timeout in ms. Default 10000.",
  webhook_url: "Webhook URL for chat events. Overrides account-level webhook.",
}
