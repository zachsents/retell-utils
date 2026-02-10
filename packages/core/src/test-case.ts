import { z } from "zod"

/** Zod schema for input match rule types in test case tool mocks. */
export const InputMatchRuleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("any") }),
  z.object({
    type: z.literal("partial_match"),
    args: z.record(z.string(), z.unknown()),
  }),
])

/** Zod schema for tool mock configurations in test cases. */
export const ToolMockSchema = z.object({
  tool_name: z.string(),
  input_match_rule: InputMatchRuleSchema,
  output: z.string(),
  result: z.boolean().nullable().optional(),
})

/** Zod schema for response engine references in test cases. */
export const TestCaseResponseEngineSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("retell-llm"),
    llm_id: z.string(),
    version: z.number().optional(),
  }),
  z.object({
    type: z.literal("conversation-flow"),
    conversation_flow_id: z.string(),
    version: z.number().optional(),
  }),
])

/** Zod schema for a test case definition from the Retell API. */
export const TestCaseDefinitionSchema = z.object({
  test_case_definition_id: z.string(),
  name: z.string(),
  response_engine: TestCaseResponseEngineSchema,
  dynamic_variables: z.record(z.string(), z.unknown()).optional().default({}),
  metrics: z.array(z.string()).optional().default([]),
  user_prompt: z.string(),
  creation_timestamp: z.number(),
  user_modified_timestamp: z.number(),
  type: z.literal("simulation"),
  tool_mocks: z.array(ToolMockSchema).optional().default([]),
  llm_model: z.string(),
})
