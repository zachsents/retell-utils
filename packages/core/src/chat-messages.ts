import { z } from "zod"

/** A chat message from the agent or user. */
export const ChatMessageSchema = z.object({
  message_id: z.string(),
  role: z.enum(["agent", "user"]),
  content: z.string(),
  created_timestamp: z.number(),
})

/** Tool call invocation in a chat transcript. */
export const ChatToolCallInvocationSchema = z.object({
  message_id: z.string(),
  role: z.literal("tool_call_invocation"),
  tool_call_id: z.string(),
  name: z.string(),
  /** Stringified JSON of the function arguments. */
  arguments: z.string(),
  thought_signature: z.string().optional(),
  created_timestamp: z.number().optional(),
})

/** Tool call result in a chat transcript. */
export const ChatToolCallResultSchema = z.object({
  message_id: z.string(),
  role: z.literal("tool_call_result"),
  tool_call_id: z.string(),
  content: z.string(),
  created_timestamp: z.number(),
})

/** Node transition in a chat transcript (conversation flow agents). */
export const ChatNodeTransitionSchema = z.object({
  message_id: z.string(),
  role: z.literal("node_transition"),
  former_node_id: z.string().optional(),
  former_node_name: z.string().optional(),
  new_node_id: z.string().optional(),
  new_node_name: z.string().optional(),
  created_timestamp: z.number(),
})

/** State transition in a chat transcript (multi-prompt agents). */
export const ChatStateTransitionSchema = z.object({
  message_id: z.string(),
  role: z.literal("state_transition"),
  former_state_name: z.string().optional(),
  new_state_name: z.string().optional(),
  created_timestamp: z.number(),
})

/** Union of all chat message types found in `message_with_tool_calls`. */
export const ChatMessageEntrySchema = z.discriminatedUnion("role", [
  ChatMessageSchema.extend({ role: z.literal("agent") }),
  ChatMessageSchema.extend({ role: z.literal("user") }),
  ChatToolCallInvocationSchema,
  ChatToolCallResultSchema,
  ChatNodeTransitionSchema,
  ChatStateTransitionSchema,
])
