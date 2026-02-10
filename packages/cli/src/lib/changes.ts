import diff from "microdiff"
import * as R from "remeda"
import type {
  CanonicalChatAgent,
  CanonicalConversationFlow,
  CanonicalLLM,
  CanonicalState,
  CanonicalTestCase,
  CanonicalVoiceAgent,
} from "./agents"

export type ResourceChange<T> = {
  id: string
  name: string
  current: T
  differences: ReturnType<typeof diff>
}

export type VoiceAgentChange = ResourceChange<CanonicalVoiceAgent>
export type ChatAgentChange = ResourceChange<CanonicalChatAgent>
export type LLMChange = ResourceChange<CanonicalLLM>
export type FlowChange = ResourceChange<CanonicalConversationFlow>
export type TestCaseChange = ResourceChange<CanonicalTestCase>

export type BaseChanges = {
  voiceAgents: VoiceAgentChange[]
  chatAgents: ChatAgentChange[]
  llms: LLMChange[]
  flows: FlowChange[]
}

export type Changes = BaseChanges & {
  testCases: TestCaseChange[]
}

/**
 * Computes differences between a source state and a reference state. When
 * `includeNew` is true, items without a remote counterpart are included as
 * CREATE diffs (used by publish). When false, they are skipped (used by
 * deploy).
 */
export function computeChanges(
  source: CanonicalState,
  reference: CanonicalState,
  { includeNew = false } = {},
): BaseChanges {
  const changes: BaseChanges = {
    voiceAgents: [],
    chatAgents: [],
    llms: [],
    flows: [],
  }

  const refVoiceAgents = new Map(reference.voiceAgents.map((a) => [a._id, a]))
  const refChatAgents = new Map(reference.chatAgents.map((a) => [a._id, a]))
  const refLLMs = new Map(reference.llms.map((l) => [l._id, l]))
  const refFlows = new Map(reference.conversationFlows.map((f) => [f._id, f]))

  // Voice agents
  for (const agent of source.voiceAgents) {
    const ref = refVoiceAgents.get(agent._id)
    if (!ref) {
      if (includeNew) {
        changes.voiceAgents.push({
          id: agent._id,
          name: agent.agent_name ?? agent._id,
          current: agent,
          differences: [{ type: "CREATE", path: [], value: agent }],
        })
      }
      continue
    }

    const omitFields =
      agent.response_engine.type === "custom-llm"
        ? (["_id", "_version"] as const)
        : (["_id", "_version", "response_engine"] as const)

    const differences = diff(R.omit(ref, omitFields), R.omit(agent, omitFields))
    if (differences.length > 0) {
      changes.voiceAgents.push({
        id: agent._id,
        name: agent.agent_name ?? agent._id,
        current: agent,
        differences,
      })
    }
  }

  // Chat agents
  for (const agent of source.chatAgents) {
    const ref = refChatAgents.get(agent._id)
    if (!ref) {
      if (includeNew) {
        changes.chatAgents.push({
          id: agent._id,
          name: agent.agent_name ?? agent._id,
          current: agent,
          differences: [{ type: "CREATE", path: [], value: agent }],
        })
      }
      continue
    }

    const omitFields =
      agent.response_engine.type === "custom-llm"
        ? (["_id", "_version"] as const)
        : (["_id", "_version", "response_engine"] as const)

    const differences = diff(R.omit(ref, omitFields), R.omit(agent, omitFields))
    if (differences.length > 0) {
      changes.chatAgents.push({
        id: agent._id,
        name: agent.agent_name ?? agent._id,
        current: agent,
        differences,
      })
    }
  }

  // LLMs
  for (const llm of source.llms) {
    const ref = refLLMs.get(llm._id)
    if (!ref) {
      if (includeNew) {
        changes.llms.push({
          id: llm._id,
          name: llm._id,
          current: llm,
          differences: [{ type: "CREATE", path: [], value: llm }],
        })
      }
      continue
    }

    const differences = diff(
      R.omit(ref, ["_id", "_version"]),
      R.omit(llm, ["_id", "_version"]),
    )
    if (differences.length > 0) {
      changes.llms.push({
        id: llm._id,
        name: llm._id,
        current: llm,
        differences,
      })
    }
  }

  // Flows
  for (const flow of source.conversationFlows) {
    const ref = refFlows.get(flow._id)
    if (!ref) {
      if (includeNew) {
        changes.flows.push({
          id: flow._id,
          name: flow._id,
          current: flow,
          differences: [{ type: "CREATE", path: [], value: flow }],
        })
      }
      continue
    }

    const differences = diff(
      R.omit(ref, ["_id", "_version"]),
      R.omit(flow, ["_id", "_version"]),
    )
    if (differences.length > 0) {
      changes.flows.push({
        id: flow._id,
        name: flow._id,
        current: flow,
        differences,
      })
    }
  }

  return changes
}
