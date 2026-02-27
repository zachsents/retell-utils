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
import type { CanonicalComponent } from "./components"

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
export type ComponentChange = ResourceChange<CanonicalComponent>

export type BaseChanges = {
  voiceAgents: VoiceAgentChange[]
  chatAgents: ChatAgentChange[]
  llms: LLMChange[]
  flows: FlowChange[]
}

export type Changes = BaseChanges & {
  testCases: TestCaseChange[]
  components: ComponentChange[]
}

/**
 * Returns true if every element is a plain object with a unique string `id`.
 * Acts as a type guard so callers can destructure `{ id, ...rest }` safely.
 */
function allHaveUniqueIds(
  arr: unknown[],
): arr is Array<Record<string, unknown> & { id: string }> {
  const ids = new Set<string>()
  return arr.every((item) => {
    if (!R.isPlainObject(item) || !R.isString(item.id)) return false
    if (ids.has(item.id)) return false
    ids.add(item.id)
    return true
  })
}

/**
 * Recursively converts arrays of objects with unique `id` props into objects
 * keyed by `id`, so microdiff matches by identity instead of by index.
 */
function keyArraysById(obj: Record<string, unknown>): Record<string, unknown>
function keyArraysById(obj: unknown): unknown
function keyArraysById(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    if (obj.length > 0 && allHaveUniqueIds(obj)) {
      return R.mapToObj(obj, ({ id, ...rest }) => [id, keyArraysById(rest)])
    }
    return obj.map((item) => keyArraysById(item))
  }
  if (R.isPlainObject(obj)) {
    return R.mapValues(obj, (v) => keyArraysById(v))
  }
  return obj
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

    const a = keyArraysById(R.omit(ref, omitFields))
    const b = keyArraysById(R.omit(agent, omitFields))
    const differences = diff(a, b)
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

    const a = keyArraysById(R.omit(ref, omitFields))
    const b = keyArraysById(R.omit(agent, omitFields))
    const differences = diff(a, b)
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

    const a = keyArraysById(R.omit(ref, ["_id", "_version"]))
    const b = keyArraysById(R.omit(llm, ["_id", "_version"]))
    const differences = diff(a, b)
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

    const a = keyArraysById(R.omit(ref, ["_id", "_version"]))
    const b = keyArraysById(R.omit(flow, ["_id", "_version"]))
    const differences = diff(a, b)
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

/**
 * Computes differences between local and remote shared components. Returns only
 * components that have actual changes.
 */
export function computeComponentChanges(
  local: CanonicalComponent[],
  remote: CanonicalComponent[],
): ComponentChange[] {
  const refMap = new Map(remote.map((c) => [c._id, c]))
  const changes: ComponentChange[] = []

  for (const component of local) {
    const ref = refMap.get(component._id)
    if (!ref) continue

    const a = keyArraysById(R.omit(ref, ["_id", "_timestamp"]))
    const b = keyArraysById(R.omit(component, ["_id", "_timestamp"]))
    const differences = diff(a, b)
    if (differences.length > 0) {
      changes.push({
        id: component._id,
        name: component.name ?? component._id,
        current: component,
        differences,
      })
    }
  }

  return changes
}
