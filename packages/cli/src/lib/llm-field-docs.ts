export const llmFieldDocs: Record<string, string> = {
  begin_after_user_silence_ms:
    "If set, the AI will begin the conversation after waiting for the user for the duration (in milliseconds). Only applies if agent is configured to wait for user to speak first. If not set, agent waits indefinitely.",
  begin_message:
    'First utterance said by the agent in the call. If not set, LLM will dynamically generate a message. If set to "", agent will wait for user to speak first.',
  default_dynamic_variables:
    "Default dynamic variables as key-value pairs. Injected into Retell LLM prompt and tool descriptions when specific values are not provided in a request.",
  general_prompt:
    "General prompt appended to system prompt no matter what state the agent is in. System prompt (with state) = general prompt + state prompt. System prompt (no state) = general prompt.",
  general_tools:
    "A list of tools the model may call (get external knowledge, call API, etc). Select from common predefined tools or create custom tools. Tools of LLM (with state) = general tools + state tools + state transitions. Tools of LLM (no state) = general tools.",
  kb_config: "Knowledge base configuration for RAG retrieval.",
  knowledge_base_ids: "A list of knowledge base ids to use for this resource.",
  mcps: "A list of MCPs (Model Context Protocol servers) to use for this LLM.",
  model:
    "Select the underlying text LLM. If not set, defaults to gpt-4.1. Options: gpt-4.1, gpt-4.1-mini, gpt-4.1-nano, gpt-5, gpt-5-mini, gpt-5-nano, claude-4.5-sonnet, claude-4.5-haiku, gemini-2.5-flash, gemini-2.5-flash-lite.",
  model_high_priority:
    "If true, use high priority pool with more dedicated resources for lower and more consistent latency. Default false. Usually comes with higher cost.",
  model_temperature:
    "Controls randomness of response [0,1]. Lower = more deterministic, higher = more random. Default 0. Lower values recommended for tool calling.",
  s2s_model:
    "Select the underlying speech-to-speech model. Can only set this or model, not both. Options: gpt-4o-realtime, gpt-4o-mini-realtime, gpt-realtime.",
  start_speaker:
    "The speaker who starts the conversation. Required. Must be either 'user' or 'agent'.",
  starting_state:
    "Name of the starting state. Required if states is not empty.",
  states:
    "States of the LLM to help reduce prompt length and tool choices when the call can be broken into distinct states. With shorter prompts and less tools, the LLM can better focus and follow rules, minimizing hallucination. If not set, agent only has general prompt and general tools.",
  tool_call_strict_mode:
    "Whether to use strict mode for tool calls. Only applicable when using certain supported models.",
}
