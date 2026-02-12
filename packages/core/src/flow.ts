import { z } from "zod"
import { KbConfigSchema, McpConfigSchema } from "./agent"
import { LlmModelSchema, StartSpeakerSchema } from "./enums"
import { LlmToolSchema } from "./llm"

// ---------------------------------------------------------------------------
// Flow nodes & edges
// ---------------------------------------------------------------------------

/** Transition condition on a flow edge. */
export const FlowTransitionConditionSchema = z.object({
  type: z.string().optional(),
  prompt: z.string().optional(),
})

/** Schema for a flow edge (transition between nodes). */
export const FlowEdgeSchema = z.object({
  id: z.string().optional(),
  destination_node_id: z.string().optional(),
  transition_condition: FlowTransitionConditionSchema.optional(),
})

/**
 * Schema for a conversation flow node. Nodes have many type variants
 * (conversation, call_transfer, end_call, sms, etc.) each with different
 * fields. We validate the common structural fields that the CLI needs for
 * prompt extraction and serialization, and use catchall for type-specific
 * fields so configs round-trip safely.
 */
export const FlowNodeSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    type: z.string().optional(),
    instruction: z
      .object({
        type: z.string().optional(),
        text: z.string().optional(),
      })
      .optional(),
    edges: z.array(FlowEdgeSchema).optional(),
    edge: FlowEdgeSchema.optional(),
  })
  .catchall(z.unknown())

// ---------------------------------------------------------------------------
// Flow components
// ---------------------------------------------------------------------------

/** Display position for the begin tag in the visual editor. */
const DisplayPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
})

/** A local component embedded within a conversation flow. */
export const FlowComponentSchema = z.object({
  name: z.string().optional(),
  nodes: z.array(FlowNodeSchema).optional(),
  tools: z.array(LlmToolSchema).nullable().optional(),
  mcps: z.array(McpConfigSchema).nullable().optional(),
  start_node_id: z.string().optional(),
  begin_tag_display_position: DisplayPositionSchema.nullable().optional(),
})

// ---------------------------------------------------------------------------
// Model choice
// ---------------------------------------------------------------------------

/** Model selection configuration for conversation flows. */
const FlowModelChoiceSchema = z.object({
  type: z.string().optional(),
  model: LlmModelSchema.nullable().optional(),
  high_priority: z.boolean().optional(),
})

// ---------------------------------------------------------------------------
// Conversation flow response
// ---------------------------------------------------------------------------

/** Zod schema for a conversation flow response from the Retell API. */
export const ConversationFlowResponseSchema = z.object({
  // Required
  conversation_flow_id: z.string(),
  version: z.number(),

  // Model
  model_choice: FlowModelChoiceSchema.optional(),
  model_temperature: z.number().nullable().optional(),
  tool_call_strict_mode: z.boolean().nullable().optional(),

  // Knowledge base
  knowledge_base_ids: z.array(z.string()).nullable().optional(),
  kb_config: KbConfigSchema.optional(),

  // Conversation
  start_speaker: StartSpeakerSchema.optional(),
  begin_after_user_silence_ms: z.number().nullable().optional(),
  global_prompt: z.string().nullable().optional(),
  is_published: z.boolean().optional(),

  // Tools
  tools: z.array(LlmToolSchema).nullable().optional(),

  // Components
  components: z.array(FlowComponentSchema).nullable().optional(),

  // Nodes
  nodes: z.array(FlowNodeSchema).nullable().optional(),
  start_node_id: z.string().nullable().optional(),

  // Dynamic variables
  default_dynamic_variables: z
    .record(z.string(), z.string())
    .nullable()
    .optional(),

  // Layout
  begin_tag_display_position: DisplayPositionSchema.nullable().optional(),

  // MCP
  mcps: z.array(McpConfigSchema).nullable().optional(),

  // Transfer
  is_transfer_llm: z.boolean().nullable().optional(),
})
