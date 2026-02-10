export const flowFieldDocs: Record<string, string> = {
  begin_after_user_silence_ms:
    "If set, the AI will begin the conversation after waiting for the user for the duration (in milliseconds). Only applies if agent is configured to wait for user to speak first. If not set, agent waits indefinitely.",
  begin_tag_display_position:
    "Display position for the begin tag in the frontend (x, y coordinates).",
  components:
    "Local components embedded within the conversation flow. Each component has a name, nodes, and optional start_node_id and tools.",
  default_dynamic_variables:
    "Default dynamic variables that can be referenced throughout the conversation flow.",
  global_prompt: "Global prompt used in every node of the conversation flow.",
  is_transfer_llm: "Whether this conversation flow is used for transfer LLM.",
  kb_config: "Knowledge base configuration for RAG retrieval.",
  knowledge_base_ids:
    "Knowledge base IDs for RAG (Retrieval-Augmented Generation).",
  mcps: "A list of MCP (Model Context Protocol) server configurations to use for this conversation flow.",
  model_choice:
    "The model choice for the conversation flow. Includes type (cascading, single, or latency_optimized) and model selection.",
  model_temperature:
    "Controls randomness of model responses [0,1]. Lower values = more deterministic.",
  nodes:
    "Array of nodes in the conversation flow. Node types: conversation, end, function, transfer_call, press_digit, branch, sms, extract_dynamic_variables, agent_swap, mcp, component.",
  start_node_id: "ID of the start node in the conversation flow.",
  start_speaker: "Who starts the conversation - 'user' or 'agent'.",
  tool_call_strict_mode:
    "Whether to use strict mode for tool calls. Only applicable when using certain supported models.",
  tools:
    "Tools available in the conversation flow. Tool types: custom, check_availability_cal, book_appointment_cal.",
}
