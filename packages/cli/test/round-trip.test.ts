import { describe, expect, test } from "bun:test"
import {
  ChatAgentResponseSchema,
  ConversationFlowResponseSchema,
  LlmResponseSchema,
  VoiceAgentResponseSchema,
} from "@core"
import z from "zod"
import {
  canonicalizeFromApi,
  canonicalizeFromFiles,
  serializeState,
} from "../src/lib/agents"
import { formatWithPrettier } from "../src/lib/prettier"
import fixture from "./round-trip-fixture.json"

// ---------------------------------------------------------------------------
// Parse fixture data through Zod schemas (same as the real pull pipeline).
// Returns fresh copies every call to avoid shared mutable state -- serializeState
// mutates flow node objects in-place (replacing prompts with file:// refs).
// ---------------------------------------------------------------------------

function parseFixtures() {
  return {
    voiceAgents: z.array(VoiceAgentResponseSchema).parse(fixture.voiceAgents),
    chatAgents: z.array(ChatAgentResponseSchema).parse(fixture.chatAgents),
    conversationFlows: z
      .array(ConversationFlowResponseSchema)
      .parse(fixture.conversationFlows),
    llms: z.array(LlmResponseSchema).parse(fixture.llms),
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fields stripped during canonicalization (readonly API metadata). */
const READONLY_AGENT_FIELDS = new Set([
  "agent_id",
  "version",
  "last_modification_timestamp",
  "is_published",
  "version_title",
  "version_description",
])

const READONLY_LLM_FIELDS = new Set([
  "llm_id",
  "version",
  "last_modification_timestamp",
  "is_published",
])

const READONLY_FLOW_FIELDS = new Set([
  "conversation_flow_id",
  "version",
  "is_published",
])

/**
 * Strips readonly fields and legacy edge `condition` from a raw flow fixture.
 * Only removes `condition` from edge-shaped objects (those with
 * `destination_node_id` or `transition_condition`), preserving
 * `global_node_setting.condition`.
 */
function stripFlowFixture(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(raw, function (this: unknown, key, value) {
      if (READONLY_FLOW_FIELDS.has(key)) return undefined
      // Strip `condition` only from edge objects
      if (
        key === "condition" &&
        typeof value === "string" &&
        typeof this === "object" &&
        this !== null &&
        ("destination_node_id" in this || "transition_condition" in this)
      )
        return undefined
      return value
    }),
  )
}

/**
 * Normalize all string values in an object tree by running them through
 * prettier's markdown formatter. This makes comparison immune to cosmetic
 * whitespace differences introduced by the serialization pipeline.
 */
async function prettierNormalize(v: unknown): Promise<unknown> {
  if (typeof v === "string") {
    return (await formatWithPrettier(v, { parser: "markdown" })).trimEnd()
  }
  if (Array.isArray(v)) return Promise.all(v.map(prettierNormalize))
  if (typeof v === "object" && v !== null) {
    const entries = await Promise.all(
      Object.entries(v as Record<string, unknown>).map(
        async ([k, val]) => [k, await prettierNormalize(val)] as const,
      ),
    )
    return Object.fromEntries(entries)
  }
  return v
}

/**
 * Returns a description of the first difference found between two values.
 * Treats `undefined`/missing keys and `null`/empty arrays as equivalent.
 */
function findFirstDiff(a: unknown, b: unknown, path = ""): string | null {
  if (a === b) return null
  if (a == null && b == null) return null

  if (Array.isArray(a) && a.length === 0 && b == null) return null
  if (Array.isArray(b) && b.length === 0 && a == null) return null

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length)
      return `${path}: array length ${a.length} vs ${b.length}`
    for (let i = 0; i < a.length; i++) {
      const diff = findFirstDiff(a[i], b[i], `${path}[${i}]`)
      if (diff) return diff
    }
    return null
  }

  if (
    typeof a === "object" &&
    a !== null &&
    typeof b === "object" &&
    b !== null
  ) {
    const aObj = a as Record<string, unknown>
    const bObj = b as Record<string, unknown>
    const allKeys = new Set([...Object.keys(aObj), ...Object.keys(bObj)])
    for (const key of allKeys) {
      const diff = findFirstDiff(
        aObj[key],
        bObj[key],
        path ? `${path}.${key}` : key,
      )
      if (diff) return diff
    }
    return null
  }

  const aStr = JSON.stringify(a)?.slice(0, 80) ?? String(a)
  const bStr = JSON.stringify(b)?.slice(0, 80) ?? String(b)
  return `${path}: ${aStr} !== ${bStr}`
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("round-trip: pull -> serialize -> deserialize", () => {
  test("fixture data parses through Zod schemas without error", () => {
    const { voiceAgents, chatAgents, conversationFlows, llms } = parseFixtures()
    expect(voiceAgents).toHaveLength(fixture.voiceAgents.length)
    expect(chatAgents).toHaveLength(fixture.chatAgents.length)
    expect(conversationFlows).toHaveLength(fixture.conversationFlows.length)
    expect(llms).toHaveLength(fixture.llms.length)
  })

  test("canonical state round-trips through file serialization", async () => {
    const { voiceAgents, chatAgents, conversationFlows, llms } = parseFixtures()

    // Step 1: API -> canonical (simulates pull)
    const canonicalFromApi = canonicalizeFromApi({
      voiceAgents,
      chatAgents,
      llms,
      conversationFlows,
    })

    // Deep-clone before serialization because serializeState mutates the input
    // (it replaces prompt text with file:// references in-place)
    const snapshot = structuredClone(canonicalFromApi)

    // Step 2: canonical -> file map (simulates writing to disk)
    const rawFiles = await serializeState(canonicalFromApi)

    // Strip the "agents/" prefix since canonicalizeFromFiles expects paths
    // relative to the agents directory
    const files: Record<string, string> = {}
    for (const [k, v] of Object.entries(rawFiles)) {
      files[k.replace(/^agents\//, "")] = v
    }

    // Step 3: file map -> canonical (simulates reading from disk)
    const canonicalFromFiles = await canonicalizeFromFiles(files)

    // Normalize both through prettier so markdown formatting diffs are ignored
    const [normalizedApi, normalizedFiles] = await Promise.all([
      prettierNormalize(snapshot),
      prettierNormalize(canonicalFromFiles),
    ])
    const api = normalizedApi as typeof snapshot
    const files2 = normalizedFiles as typeof canonicalFromFiles

    // Compare voice agents
    expect(files2.voiceAgents).toHaveLength(api.voiceAgents.length)
    for (const apiAgent of api.voiceAgents) {
      const fileAgent = files2.voiceAgents.find((a) => a._id === apiAgent._id)
      expect(fileAgent).toBeDefined()
      const diff = findFirstDiff(apiAgent, fileAgent)
      expect(diff).toBeNull()
    }

    // Compare chat agents
    expect(files2.chatAgents).toHaveLength(api.chatAgents.length)
    for (const apiAgent of api.chatAgents) {
      const fileAgent = files2.chatAgents.find((a) => a._id === apiAgent._id)
      expect(fileAgent).toBeDefined()
      const diff = findFirstDiff(apiAgent, fileAgent)
      expect(diff).toBeNull()
    }

    // Compare LLMs
    expect(files2.llms).toHaveLength(api.llms.length)
    for (const apiLlm of api.llms) {
      const fileLlm = files2.llms.find((l) => l._id === apiLlm._id)
      expect(fileLlm).toBeDefined()
      const diff = findFirstDiff(apiLlm, fileLlm)
      expect(diff).toBeNull()
    }

    // Compare conversation flows
    expect(files2.conversationFlows).toHaveLength(api.conversationFlows.length)
    for (const apiFlow of api.conversationFlows) {
      const fileFlow = files2.conversationFlows.find(
        (f) => f._id === apiFlow._id,
      )
      expect(fileFlow).toBeDefined()
      const diff = findFirstDiff(apiFlow, fileFlow)
      expect(diff).toBeNull()
    }
  })
})

describe("round-trip: deploy body matches original API data", () => {
  test("voice agent deploy body is semantically identical to API input", () => {
    const { voiceAgents, chatAgents, conversationFlows, llms } = parseFixtures()
    const canonical = canonicalizeFromApi({
      voiceAgents,
      chatAgents,
      llms,
      conversationFlows,
    })

    /** Fields not sent back during deploy. */
    const DEPLOY_EXCLUDED = new Set([
      ...READONLY_AGENT_FIELDS,
      "response_engine",
      "channel",
    ])

    for (const agent of canonical.voiceAgents) {
      const {
        _id,
        _version,
        response_engine: _re,
        channel: _ch,
        ...deployBody
      } = agent

      const raw = fixture.voiceAgents.find((a) => a.agent_id === _id) as Record<
        string,
        unknown
      >
      expect(raw).toBeDefined()

      const expected: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(raw)) {
        if (!DEPLOY_EXCLUDED.has(k)) expected[k] = v
      }

      const diff = findFirstDiff(deployBody, expected)
      expect(diff).toBeNull()
    }
  })

  test("chat agent deploy body is semantically identical to API input", () => {
    const { voiceAgents, chatAgents, conversationFlows, llms } = parseFixtures()
    const canonical = canonicalizeFromApi({
      voiceAgents,
      chatAgents,
      llms,
      conversationFlows,
    })

    const DEPLOY_EXCLUDED = new Set([
      ...READONLY_AGENT_FIELDS,
      "response_engine",
      "channel",
    ])

    for (const agent of canonical.chatAgents) {
      const {
        _id,
        _version,
        response_engine: _re,
        channel: _ch,
        ...deployBody
      } = agent

      const raw = fixture.chatAgents.find((a) => a.agent_id === _id) as Record<
        string,
        unknown
      >
      expect(raw).toBeDefined()

      const expected: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(raw)) {
        if (!DEPLOY_EXCLUDED.has(k)) expected[k] = v
      }

      const diff = findFirstDiff(deployBody, expected)
      expect(diff).toBeNull()
    }
  })

  test("LLM deploy body is semantically identical to API input", () => {
    const { voiceAgents, chatAgents, conversationFlows, llms } = parseFixtures()
    const canonical = canonicalizeFromApi({
      voiceAgents,
      chatAgents,
      llms,
      conversationFlows,
    })

    for (const llm of canonical.llms) {
      const { _id, _version, ...deployBody } = llm

      const raw = fixture.llms.find((l) => l.llm_id === _id) as Record<
        string,
        unknown
      >
      expect(raw).toBeDefined()

      const expected: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(raw)) {
        if (!READONLY_LLM_FIELDS.has(k)) expected[k] = v
      }

      const diff = findFirstDiff(deployBody, expected)
      expect(diff).toBeNull()
    }
  })

  test("conversation flow deploy body is semantically identical to API input", () => {
    const { voiceAgents, chatAgents, conversationFlows, llms } = parseFixtures()
    const canonical = canonicalizeFromApi({
      voiceAgents,
      chatAgents,
      llms,
      conversationFlows,
    })

    for (const flow of canonical.conversationFlows) {
      const { _id, _version, ...deployBody } = flow

      const raw = fixture.conversationFlows.find(
        (f) => f.conversation_flow_id === _id,
      ) as Record<string, unknown>
      expect(raw).toBeDefined()

      // Strip readonly fields and legacy edge `condition` from the raw fixture.
      // The API returns both `condition` (legacy string on edges) and
      // `transition_condition` (the canonical object). Our schema only keeps
      // `transition_condition`. We must NOT strip `condition` from
      // `global_node_setting` since that's a real field.
      const expected = stripFlowFixture(raw)

      const diff = findFirstDiff(deployBody, expected)
      expect(diff).toBeNull()
    }
  })
})
