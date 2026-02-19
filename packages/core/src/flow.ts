import { z } from "zod"
import { KbConfigSchema, McpConfigSchema } from "./agent"
import {
  EquationCombinatorSchema,
  EquationOperatorSchema,
  FlowInstructionTypeSchema,
  FlowNodeTypeSchema,
  FlowTransitionConditionTypeSchema,
  LlmModelSchema,
  StartSpeakerSchema,
} from "./enums"
import {
  LlmToolSchema,
  TransferDestinationSchema,
  TransferOptionSchema,
} from "./llm"

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------

/** Display position in the visual editor. */
const DisplayPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
})

// ---------------------------------------------------------------------------
// Flow nodes & edges
// ---------------------------------------------------------------------------

/** A single equation within an equation-type transition condition. */
export const FlowEquationSchema = z.object({
  left: z.string(),
  operator: EquationOperatorSchema,
  /** Right side is not required for "exists" and "not_exist" operators. */
  right: z.string().optional(),
})

/** Transition condition on a flow edge. */
export const FlowTransitionConditionSchema = z.object({
  type: FlowTransitionConditionTypeSchema.optional(),
  prompt: z.string().optional(),
  equations: z.array(FlowEquationSchema).optional(),
  operator: EquationCombinatorSchema.optional(),
})

/** Schema for a flow edge (transition between nodes). */
export const FlowEdgeSchema = z.object({
  id: z.string().optional(),
  destination_node_id: z.string().optional(),
  transition_condition: FlowTransitionConditionSchema.optional(),
})

/** A single turn in a fine-tune example transcript. */
const FinetuneTranscriptTurnSchema = z.object({
  role: z.string(),
  content: z.string().optional(),
})

/** Fine-tune example for conversation or transition behavior. */
const FinetuneExampleSchema = z.object({
  id: z.string().optional(),
  destination_node_id: z.string().optional(),
  transcript: z.array(FinetuneTranscriptTurnSchema).optional(),
})

/** Global node setting (when this node should be entered). */
const GlobalNodeSettingSchema = z.object({
  condition: z.string().optional(),
  positive_finetune_examples: z.array(FinetuneExampleSchema).optional(),
  negative_finetune_examples: z.array(FinetuneExampleSchema).optional(),
  cool_down: z.number().optional(),
})

/** Schema for a conversation flow node with all known fields explicit. */
export const FlowNodeSchema = z.object({
  // Common
  id: z.string().optional(),
  name: z.string().optional(),
  type: FlowNodeTypeSchema.optional(),
  instruction: z
    .object({
      type: FlowInstructionTypeSchema.optional(),
      text: z.string().optional(),
    })
    .optional(),
  display_position: DisplayPositionSchema.nullable().optional(),

  // Edges
  edges: z.array(FlowEdgeSchema).optional(),
  edge: FlowEdgeSchema.optional(),
  else_edge: FlowEdgeSchema.optional(),
  skip_response_edge: FlowEdgeSchema.optional(),
  always_edge: FlowEdgeSchema.optional(),

  // Conversation node fields
  start_speaker: StartSpeakerSchema.optional(),
  global_node_setting: GlobalNodeSettingSchema.optional(),
  finetune_transition_examples: z
    .array(FinetuneExampleSchema)
    .nullable()
    .optional(),
  finetune_conversation_examples: z
    .array(FinetuneExampleSchema)
    .nullable()
    .optional(),

  // Function node fields
  tool_id: z.string().optional(),
  tool_type: z.string().optional(),
  speak_during_execution: z.boolean().optional(),
  wait_for_result: z.boolean().optional(),

  // Transfer node fields
  transfer_destination: TransferDestinationSchema.optional(),
  transfer_option: TransferOptionSchema.optional(),
})

// ---------------------------------------------------------------------------
// Flow components
// ---------------------------------------------------------------------------

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
  type: z.literal("cascading"),
  model: LlmModelSchema,
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

  // Undocumented but returned by the API
  flex_mode: z.boolean().optional(),
})
