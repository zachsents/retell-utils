import fs from "node:fs/promises"
import path from "node:path"
import { $ } from "bun"
import * as R from "remeda"
import {
  ChatAgentResponseSchema,
  ConversationFlowResponseSchema,
  LlmResponseSchema,
  retellPagination,
  TestCaseDefinitionSchema,
  VoiceAgentResponseSchema,
} from "@core"
import type { Except } from "type-fest"
import z from "zod"
import { agentFieldDocs } from "./agent-field-docs"
import { chatAgentFieldDocs } from "./chat-agent-field-docs"
import { flowFieldDocs } from "./flow-field-docs"
import { llmFieldDocs } from "./llm-field-docs"
import {
  createFlowVisualization,
  DEFAULT_AGENTS_DIR,
  FILE_HASH_LENGTH,
  readJson,
  readYaml,
  resolveFilePlaceholders,
  toSnakeCase,
  writeJson,
  writeMarkdown,
  writeYaml,
} from "./utils"

const RETELL_BASE_URL = "https://api.retellai.com"

/** Returns the Retell API key, throwing if not set. */
export function getApiKey() {
  const key = process.env.RETELL_API_KEY
  if (!key) throw new Error("RETELL_API_KEY environment variable is not set")
  return key
}

/**
 * Thin fetch wrapper for the Retell API. Handles auth header, base URL, and
 * error checking. Returns the parsed JSON response body, or `undefined` for 204
 * No Content responses.
 */
export async function retellFetch(
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const headers = new Headers({
    Authorization: `Bearer ${getApiKey()}`,
    "Content-Type": "application/json",
  })
  if (init?.headers) {
    for (const [k, v] of new Headers(init.headers).entries()) {
      headers.set(k, v)
    }
  }
  const res = await fetch(`${RETELL_BASE_URL}${path}`, { ...init, headers })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Retell API ${res.status}: ${body}`)
  }
  if (res.status === 204) return undefined
  return res.json()
}

// ---------------------------------------------------------------------------
// Inferred API response types from core Zod schemas
// ---------------------------------------------------------------------------

type VoiceAgentResponse = z.infer<typeof VoiceAgentResponseSchema>
type ChatAgentResponse = z.infer<typeof ChatAgentResponseSchema>
type LlmResponse = z.infer<typeof LlmResponseSchema>
type ConversationFlowResponse = z.infer<typeof ConversationFlowResponseSchema>

export type CanonicalVoiceAgent = Except<
  VoiceAgentResponse,
  "last_modification_timestamp" | "is_published" | "agent_id" | "version"
> & { _id: string; _version: number }

export type CanonicalChatAgent = Except<
  ChatAgentResponse,
  "last_modification_timestamp" | "is_published" | "agent_id" | "version"
> & { _id: string; _version: number }

export type CanonicalLLM = Except<
  LlmResponse,
  "last_modification_timestamp" | "is_published" | "llm_id" | "version"
> & { _id: string; _version: number }

export type CanonicalConversationFlow = Except<
  ConversationFlowResponse,
  "is_published" | "conversation_flow_id" | "version"
> & { _id: string; _version: number }

/** Builds a directory name for an agent (e.g. `my_agent_c78db2`). */
export function getAgentDirName(agent: {
  _id: string
  agent_name?: string | null
}) {
  const name = agent.agent_name ?? agent._id
  return `${toSnakeCase(name)}_${agent._id.slice(-FILE_HASH_LENGTH)}`
}

/**
 * Collects agent IDs affected by a set of changes. Includes agents with direct
 * changes plus agents whose LLMs or conversation flows changed.
 */
export function findAffectedAgentIds(
  changes: {
    voiceAgents: Array<{ id: string }>
    chatAgents: Array<{ id: string }>
    llms: Array<{ id: string }>
    flows: Array<{ id: string }>
  },
  state: CanonicalState,
): Set<string> {
  const ids = new Set<string>()
  for (const c of changes.voiceAgents) ids.add(c.id)
  for (const c of changes.chatAgents) ids.add(c.id)

  const changedLlmIds = new Set(changes.llms.map((c) => c.id))
  const changedFlowIds = new Set(changes.flows.map((c) => c.id))

  for (const agent of [...state.voiceAgents, ...state.chatAgents]) {
    if (
      agent.response_engine.type === "retell-llm" &&
      changedLlmIds.has(agent.response_engine.llm_id)
    ) {
      ids.add(agent._id)
    }
    if (
      agent.response_engine.type === "conversation-flow" &&
      changedFlowIds.has(agent.response_engine.conversation_flow_id)
    ) {
      ids.add(agent._id)
    }
  }

  return ids
}

/**
 * Normalizes a canonical agent's response engine for the test-case API, which
 * requires `version` to be `number | undefined` (not `null`).
 */
export function normalizeResponseEngine(
  re: CanonicalVoiceAgent["response_engine"],
) {
  if (re.type === "retell-llm") {
    return {
      type: "retell-llm" as const,
      llm_id: re.llm_id,
      version: re.version ?? undefined,
    }
  }
  if (re.type === "conversation-flow") {
    return {
      type: "conversation-flow" as const,
      conversation_flow_id: re.conversation_flow_id,
      version: re.version ?? undefined,
    }
  }
  return undefined
}

/**
 * Groups items by an ID property and returns only the latest version of each.
 * Handles passthrough-typed Zod objects where Remeda's groupByProp chokes on
 * the `[x: string]: unknown` index signature.
 */
function keepLatestVersion<T extends { version?: number }>(
  items: T[],
  idKey: keyof T & string,
): T[] {
  const map = new Map<string, T>()
  for (const item of items) {
    // idKey always refers to a string ID field, but TS can't narrow T[keyof T]
    const id = item[idKey] as string
    const existing = map.get(id)
    if (!existing || (item.version ?? 0) > (existing.version ?? 0)) {
      map.set(id, item)
    }
  }
  return [...map.values()]
}

/** Unified state type containing all agent types and their resources. */
export type CanonicalState = {
  voiceAgents: CanonicalVoiceAgent[]
  chatAgents: CanonicalChatAgent[]
  llms: CanonicalLLM[]
  conversationFlows: CanonicalConversationFlow[]
}

/** Builds a query string from retellPagination options. */
function paginationQuery(opts: {
  limit?: number
  pagination_key?: string
  pagination_key_version?: number
}) {
  const p = new URLSearchParams()
  if (opts.limit) p.set("limit", String(opts.limit))
  if (opts.pagination_key) p.set("pagination_key", opts.pagination_key)
  if (opts.pagination_key_version != null)
    p.set("pagination_key_version", String(opts.pagination_key_version))
  return p.toString()
}

/**
 * Fetches all relevant remote data from the Retell API. Strips readonly fields
 * and returns a canonicalized form.
 */
export async function getRemoteState({
  draft = false,
  agentIds = null,
  version,
}: {
  draft?: boolean
  /** If provided, only returns agents with these IDs. */
  agentIds?: string[] | null
  /**
   * If provided, fetches this specific version for each agent (requires
   * agentIds).
   */
  version?: number
} = {}) {
  // When fetching a specific version, use retrieve instead of list
  if (version != null && agentIds) {
    return getRemoteStateByVersion(agentIds, version)
  }

  const [allVoiceAgents, allChatAgents, llms, conversationFlows] =
    await Promise.all([
      retellPagination(
        async (opts) =>
          z
            .array(VoiceAgentResponseSchema)
            .parse(await retellFetch(`/list-agents?${paginationQuery(opts)}`)),
        "agent_id",
      ),
      retellPagination(
        async (opts) =>
          z
            .array(ChatAgentResponseSchema)
            .parse(
              await retellFetch(`/list-chat-agents?${paginationQuery(opts)}`),
            ),
        "agent_id",
      ),
      retellPagination(
        async (opts) =>
          z
            .array(LlmResponseSchema)
            .parse(
              await retellFetch(`/list-retell-llms?${paginationQuery(opts)}`),
            ),
        "llm_id",
      ),
      retellPagination(
        async (opts) =>
          z
            .array(ConversationFlowResponseSchema)
            .parse(
              await retellFetch(
                `/list-conversation-flows?${paginationQuery(opts)}`,
              ),
            ),
        "conversation_flow_id",
      ),
    ])

  // Filter to published only unless draft mode
  let voiceAgents = draft
    ? allVoiceAgents
    : allVoiceAgents.filter((a) => a.is_published)
  let chatAgents = draft
    ? allChatAgents
    : allChatAgents.filter((a) => a.is_published)

  // Filter by agent IDs if provided
  if (agentIds) {
    const agentIdSet = new Set(agentIds)
    voiceAgents = voiceAgents.filter((a) => agentIdSet.has(a.agent_id))
    chatAgents = chatAgents.filter((a) => agentIdSet.has(a.agent_id))
  }

  return canonicalizeFromApi({
    voiceAgents,
    chatAgents,
    llms,
    conversationFlows,
  })
}

/**
 * Fetches specific versions of agents by ID. Uses retrieve endpoints with
 * version query param instead of list endpoints.
 */
async function getRemoteStateByVersion(
  agentIds: string[],
  version: number,
): Promise<CanonicalState> {
  // Try to retrieve each agent at the specified version
  // We don't know which are voice vs chat agents, so we try both
  const results = await Promise.all(
    agentIds.map(async (id) => {
      // Try voice agent first
      try {
        const agent = VoiceAgentResponseSchema.parse(
          await retellFetch(`/get-agent/${id}?version=${version}`),
        )
        return { type: "voice" as const, agent }
      } catch {
        // If not found as voice agent, try chat agent
        try {
          const agent = ChatAgentResponseSchema.parse(
            await retellFetch(`/get-chat-agent/${id}?version=${version}`),
          )
          return { type: "chat" as const, agent }
        } catch {
          throw new Error(
            `Agent ${id} not found at version ${version}. ` +
              `Check available versions in the Retell dashboard.`,
          )
        }
      }
    }),
  )

  const voiceAgents: VoiceAgentResponse[] = []
  const chatAgents: ChatAgentResponse[] = []

  for (const result of results) {
    if (result.type === "voice") {
      voiceAgents.push(result.agent)
    } else {
      chatAgents.push(result.agent)
    }
  }

  // Collect response engine references to fetch LLMs and flows
  const llmIds = new Set<string>()
  const llmVersions = new Map<string, number>()
  const flowIds = new Set<string>()
  const flowVersions = new Map<string, number>()

  for (const agent of [...voiceAgents, ...chatAgents]) {
    if (agent.response_engine.type === "retell-llm") {
      llmIds.add(agent.response_engine.llm_id)
      if (agent.response_engine.version != null) {
        llmVersions.set(
          agent.response_engine.llm_id,
          agent.response_engine.version,
        )
      }
    } else if (agent.response_engine.type === "conversation-flow") {
      flowIds.add(agent.response_engine.conversation_flow_id)
      if (agent.response_engine.version != null) {
        flowVersions.set(
          agent.response_engine.conversation_flow_id,
          agent.response_engine.version,
        )
      }
    }
  }

  // Fetch the specific versions of LLMs and flows referenced by the agents
  const versionParam = (id: string, versions: Map<string, number>) => {
    const v = versions.get(id)
    return v != null ? `?version=${v}` : ""
  }

  const [llms, conversationFlows] = await Promise.all([
    Promise.all(
      [...llmIds].map(async (id) =>
        LlmResponseSchema.parse(
          await retellFetch(
            `/get-retell-llm/${id}${versionParam(id, llmVersions)}`,
          ),
        ),
      ),
    ),
    Promise.all(
      [...flowIds].map(async (id) =>
        ConversationFlowResponseSchema.parse(
          await retellFetch(
            `/get-conversation-flow/${id}${versionParam(id, flowVersions)}`,
          ),
        ),
      ),
    ),
  ])

  return canonicalizeFromApi({
    voiceAgents,
    chatAgents,
    llms,
    conversationFlows,
  })
}

/**
 * Canonicalizes raw API responses into a normalized form. Finds latest versions
 * and strips readonly fields.
 */
export function canonicalizeFromApi({
  voiceAgents: voiceAgentsList,
  chatAgents: chatAgentsList,
  llms,
  conversationFlows,
}: {
  voiceAgents: VoiceAgentResponse[]
  chatAgents: ChatAgentResponse[]
  llms: LlmResponse[]
  conversationFlows: ConversationFlowResponse[]
}): CanonicalState {
  // Get latest version of each unique voice agent (single-pass grouping)
  const latestVoiceAgents = keepLatestVersion(voiceAgentsList, "agent_id")

  // Get latest version of each unique chat agent
  const latestChatAgents = keepLatestVersion(chatAgentsList, "agent_id")

  // Combine all agents for finding required resources
  const allLatestAgents = [
    ...latestVoiceAgents.map((a) => ({
      response_engine: a.response_engine,
      is_published: a.is_published,
    })),
    ...latestChatAgents.map((a) => ({
      response_engine: a.response_engine,
      is_published: a.is_published,
    })),
  ]

  // Find only relevant conversation flows (used by both voice and chat agents)
  const flowKey = (id: string, v: number | undefined) => `${id}:${v}`
  const requiredFlowKeys = new Set(
    allLatestAgents
      .filter((a) => a.response_engine.type === "conversation-flow")
      .map((a) => {
        const re = a.response_engine
        if (re.type !== "conversation-flow") return ""
        return flowKey(re.conversation_flow_id, re.version ?? undefined)
      }),
  )
  const requiredConversationFlows = conversationFlows.filter(
    (cf) =>
      requiredFlowKeys.has(flowKey(cf.conversation_flow_id, cf.version)) &&
      allLatestAgents.some(
        (a) =>
          a.response_engine.type === "conversation-flow" &&
          a.response_engine.conversation_flow_id === cf.conversation_flow_id &&
          a.response_engine.version === cf.version &&
          a.is_published === cf.is_published,
      ),
  )

  // Find only relevant LLMs (used by both voice and chat agents)
  const llmKey = (id: string, v: number | undefined) => `${id}:${v}`
  const requiredLlmKeys = new Set(
    allLatestAgents
      .filter((a) => a.response_engine.type === "retell-llm")
      .map((a) => {
        const re = a.response_engine
        if (re.type !== "retell-llm") return ""
        return llmKey(re.llm_id, re.version ?? undefined)
      }),
  )
  const requiredLLMs = llms.filter(
    (llm) =>
      requiredLlmKeys.has(llmKey(llm.llm_id, llm.version)) &&
      allLatestAgents.some(
        (a) =>
          a.response_engine.type === "retell-llm" &&
          a.response_engine.llm_id === llm.llm_id &&
          a.response_engine.version === llm.version &&
          a.is_published === llm.is_published,
      ),
  )

  return {
    voiceAgents: latestVoiceAgents.map(
      ({
        agent_id: _id,
        version,
        last_modification_timestamp: _lmt,
        is_published: _pub,
        version_title: _vt,
        version_description: _vd,
        ...rest
      }) => ({ ...rest, _id, _version: version ?? 0 }),
    ),
    chatAgents: latestChatAgents.map(
      ({
        agent_id: _id,
        version,
        last_modification_timestamp: _lmt,
        is_published: _pub,
        version_title: _vt,
        version_description: _vd,
        ...rest
      }) => ({ ...rest, _id, _version: version ?? 0 }),
    ),
    llms: requiredLLMs.map(
      ({
        llm_id: _id,
        version,
        last_modification_timestamp: _lmt,
        is_published: _pub,
        ...rest
      }) => ({ ...rest, _id, _version: version ?? 0 }),
    ),
    conversationFlows: requiredConversationFlows.map(
      ({
        conversation_flow_id: _id,
        version,
        is_published: _pub,
        ...rest
      }) => ({ ...rest, _id, _version: version }),
    ),
  }
}

/** Reads all files from the agents directory and returns canonicalized state. */
export async function getLocalState({
  agentsDir = DEFAULT_AGENTS_DIR,
  agentIds = null,
}: {
  agentsDir?: string
  /** If provided, only returns agents with these IDs. */
  agentIds?: string[] | null
} = {}): Promise<CanonicalState> {
  const files: Record<string, string> = {}
  const agentIdSet = agentIds ? new Set(agentIds) : null

  // Find all agent directories by locating .agent.json files
  const agentIdGlob = new Bun.Glob("*/.agent.json")
  for await (const agentIdPath of agentIdGlob.scan(agentsDir)) {
    // If filtering, check if this agent should be included
    if (agentIdSet) {
      const metaContent = await Bun.file(
        path.join(agentsDir, agentIdPath),
      ).text()
      const meta = z
        .object({ id: z.string() })
        .safeParse(JSON.parse(metaContent))
      if (!meta.success || !agentIdSet.has(meta.data.id)) {
        continue
      }
    }

    const agentDirName = path.dirname(agentIdPath)
    const agentDirFull = path.join(agentsDir, agentDirName)

    // Read all files in this agent directory
    const filesGlob = new Bun.Glob("**/*")
    for await (const file of filesGlob.scan(agentDirFull)) {
      const filePath = path.join(agentDirFull, file)
      const stat = await fs.stat(filePath)
      if (stat.isFile()) {
        files[`${agentDirName}/${file}`] = await Bun.file(filePath).text()
      }
    }

    // Also read the .agent.json file itself
    files[agentIdPath] = await Bun.file(
      path.join(agentsDir, agentIdPath),
    ).text()
  }

  return canonicalizeFromFiles(files)
}

/**
 * Reads baseline commit hash from .sync.json and returns canonicalized state
 * from that commit.
 */
export async function getBaselineState({
  agentsDir = DEFAULT_AGENTS_DIR,
}: {
  agentsDir?: string
} = {}) {
  const syncFile = await Bun.file(".sync.json")
    .text()
    .catch(() => null)

  if (!syncFile) {
    throw new Error(".sync.json file not found")
  }

  const syncData = readJson(
    syncFile,
    z.object({
      baseline: z.object({
        commitHash: z.string(),
      }),
    }),
  )

  return getCommitState(syncData.baseline.commitHash, { agentsDir })
}

/** Returns canonicalized state from files at a specific git commit. */
export async function getCommitState(
  commitHash: string,
  { agentsDir = DEFAULT_AGENTS_DIR }: { agentsDir?: string } = {},
) {
  const { stdout } =
    await $`git ls-tree -r --name-only ${commitHash} -- ${agentsDir}`.quiet()

  const filePaths = stdout
    .toString()
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)

  const files: Record<string, string> = {}

  for (const filePath of filePaths) {
    const { stdout: fileContent } =
      await $`git show ${commitHash}:${filePath}`.quiet()
    const relativePath = path.relative(agentsDir, filePath)
    files[relativePath] = fileContent.toString()
  }

  return canonicalizeFromFiles(files)
}

/**
 * Writes state to disk and removes agent directories that no longer exist. This
 * ensures deleted agents are cleaned up on pull. When agentIds is provided,
 * only cleans up within those agents (doesn't delete other agent directories).
 */
export async function writeState(
  state: CanonicalState,
  {
    agentsDir = DEFAULT_AGENTS_DIR,
    agentIds = null,
  }: {
    agentsDir?: string
    /** If provided, only cleans up directories for these agent IDs. */
    agentIds?: string[] | null
  } = {},
) {
  const files = await serializeState(state, { agentsDir })

  // Track all files we write (relative to agentsDir)
  const writtenFiles = new Set<string>()

  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.resolve(filePath)
    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await Bun.write(fullPath, content)
    writtenFiles.add(path.relative(agentsDir, filePath))
  }

  // Get all agent directories we wrote to
  const writtenDirs = new Set(
    [...writtenFiles].map((f) => f.split(path.sep)[0]).filter(Boolean),
  )

  // Build set of agent IDs we're managing (for partial sync)
  const managedAgentIds = agentIds ? new Set(agentIds) : null

  // Clean up: remove any files/dirs that weren't written
  const existingDirs = await fs.readdir(agentsDir, { withFileTypes: true })

  for (const dirent of existingDirs) {
    if (!dirent.isDirectory()) continue

    const dirName = dirent.name
    const dirPath = path.join(agentsDir, dirName)

    // If doing partial sync, check if this dir belongs to a managed agent
    if (managedAgentIds) {
      const metaPath = path.join(dirPath, ".agent.json")
      const metaFile = Bun.file(metaPath)
      const metaExists = await metaFile.exists()
      if (metaExists) {
        const metaContent = await metaFile.text()
        const meta = z
          .object({ id: z.string() })
          .safeParse(JSON.parse(metaContent))
        // Skip directories for agents we're not managing
        if (!meta.success || !managedAgentIds.has(meta.data.id)) {
          continue
        }
      }
    }

    if (!writtenDirs.has(dirName)) {
      // Remove entire directory for deleted agents
      await fs.rm(dirPath, { recursive: true })
    } else {
      // Remove stale files within agent directories
      const existingFiles = await listFilesRecursive(dirPath)
      for (const existingFile of existingFiles) {
        const relativePath = path.join(dirName, existingFile)
        if (!writtenFiles.has(relativePath)) {
          await fs.rm(path.join(dirPath, existingFile))
        }
      }
    }
  }
}

/**
 * Lists all files in a directory recursively, returning paths relative to the
 * directory.
 */
async function listFilesRecursive(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subFiles = await listFilesRecursive(path.join(dir, entry.name))
      files.push(...subFiles.map((f) => path.join(entry.name, f)))
    } else {
      files.push(entry.name)
    }
  }

  return files
}

/**
 * Converts canonicalized state to a file map (path -> content). Extracts
 * prompts into separate markdown files with file:// placeholders.
 */
export async function serializeState(
  state: CanonicalState,
  { agentsDir = DEFAULT_AGENTS_DIR }: { agentsDir?: string } = {},
): Promise<Record<string, string>> {
  const files: Record<string, string> = {}

  const llmMap = new Map(state.llms.map((llm) => [llm._id, llm]))
  const flowMap = new Map(
    state.conversationFlows.map((flow) => [flow._id, flow]),
  )

  // Helper to serialize response engine resources (shared by voice and chat agents)
  const serializeResponseEngine = async (
    agent: { response_engine: CanonicalVoiceAgent["response_engine"] },
    agentDirPath: string,
  ) => {
    if (agent.response_engine.type === "retell-llm") {
      const llm = llmMap.get(agent.response_engine.llm_id)
      if (llm) {
        const { _id: _llmId, _version: _llmVersion, ...llmConfig } = llm

        // Extract general_prompt to file
        if (llmConfig.general_prompt) {
          files[path.join(agentDirPath, "general_prompt.md")] =
            await writeMarkdown(llmConfig.general_prompt)
          llmConfig.general_prompt = "file://./general_prompt.md"
        }

        // llm config
        files[path.join(agentDirPath, "llm.yaml")] = await writeYaml(
          llmConfig,
          { comments: llmFieldDocs },
        )
      }
    } else if (agent.response_engine.type === "conversation-flow") {
      const flow = flowMap.get(agent.response_engine.conversation_flow_id)
      if (flow) {
        const { _id: _flowId, _version: _flowVersion, ...flowConfig } = flow

        // Extract global_prompt to file
        if (flowConfig.global_prompt) {
          files[path.join(agentDirPath, "global_prompt.md")] =
            await writeMarkdown(flowConfig.global_prompt)
          flowConfig.global_prompt = "file://./global_prompt.md"
        }

        // Extract node prompts to files
        if (flowConfig.nodes) {
          // Build lookup maps for node navigation context
          const nodeNameById = new Map<string, string>()
          const incomingEdges = new Map<string, string[]>()

          for (const n of flowConfig.nodes) {
            if (n.id && n.name) nodeNameById.set(n.id, n.name)

            // Collect edges from both "edges" array and single "edge" property
            // (transfer_call nodes use singular "edge")
            const edgesArray = "edges" in n ? n.edges : undefined
            const singleEdge = "edge" in n ? n.edge : undefined
            const allEdges = [
              ...(edgesArray ?? []),
              ...(singleEdge ? [singleEdge] : []),
            ]

            for (const edge of allEdges) {
              const destId = edge.destination_node_id
              if (destId) {
                if (!incomingEdges.has(destId)) incomingEdges.set(destId, [])
                if (n.name) incomingEdges.get(destId)!.push(n.name)
              }
            }
          }

          for (const node of flowConfig.nodes) {
            if (
              node.id &&
              node.type === "conversation" &&
              node.instruction?.type === "prompt" &&
              typeof node.instruction.text === "string" &&
              !node.instruction.text.startsWith("file://")
            ) {
              const nodeHash = node.id.slice(-FILE_HASH_LENGTH)
              const nodeName = node.name
                ? `${toSnakeCase(node.name)}_${nodeHash}`
                : `${node.type}_${nodeHash}`
              const nodeFileName = `nodes/${nodeName}.md`

              // Build navigation frontmatter
              const previous = node.id ? (incomingEdges.get(node.id) ?? []) : []
              const nodeEdges = "edges" in node ? node.edges : undefined
              const next = (nodeEdges ?? [])
                .map((e) =>
                  e.destination_node_id
                    ? nodeNameById.get(e.destination_node_id)
                    : undefined,
                )
                .filter((name): name is string => !!name)

              // Generate flow visualization
              const flowViz = node.name
                ? createFlowVisualization(node.name, previous, next)
                : undefined

              files[path.join(agentDirPath, nodeFileName)] =
                await writeMarkdown(node.instruction.text, {
                  nodeId: node.id,
                  flow: flowViz,
                })

              node.instruction.text = `file://./${nodeFileName}`
            }
          }
        }

        // Extract display positions into a separate dotfile so cosmetic
        // UI layout changes don't clutter the main config diff.
        const roundPos = (p: { x: number; y: number }) => ({
          x: Math.round(p.x),
          y: Math.round(p.y),
        })

        const positions: {
          begin_tag?: { x: number; y: number }
          nodes?: Record<string, { x: number; y: number }>
          components?: Record<string, { x: number; y: number }>
        } = {}

        if (flowConfig.begin_tag_display_position) {
          positions.begin_tag = roundPos(flowConfig.begin_tag_display_position)
          delete flowConfig.begin_tag_display_position
        }

        if (flowConfig.nodes) {
          for (const node of flowConfig.nodes) {
            if (node.id && node.display_position) {
              ;(positions.nodes ??= {})[node.id] = roundPos(
                node.display_position,
              )
              delete node.display_position
            }
          }
        }

        if (flowConfig.components) {
          for (const comp of flowConfig.components) {
            if (comp.name && comp.begin_tag_display_position) {
              ;(positions.components ??= {})[comp.name] = roundPos(
                comp.begin_tag_display_position,
              )
              delete comp.begin_tag_display_position
            }
          }
        }

        if (Object.keys(positions).length > 0) {
          files[path.join(agentDirPath, ".positions.json")] =
            await writeJson(positions)
        }

        // conversation-flow config
        files[path.join(agentDirPath, "conversation-flow.yaml")] =
          await writeYaml(flowConfig, { comments: flowFieldDocs })
      }
    }
  }

  // Serialize voice agents
  for (const agent of state.voiceAgents) {
    const agentDirName = getAgentDirName(agent)
    const agentDirPath = path.join(agentsDir, agentDirName)

    // .agent.json - immutable metadata (IDs, versions, response engine reference)
    // For custom-llm, we only store the type (URL is mutable and goes in config)
    const responseEngineForMeta =
      agent.response_engine.type === "custom-llm"
        ? { type: "custom-llm" as const }
        : agent.response_engine
    files[path.join(agentDirPath, ".agent.json")] = await writeJson({
      id: agent._id,
      version: agent._version,
      channel: "voice",
      response_engine: responseEngineForMeta,
    })

    // Prepare agent config for storage (mutable fields only)
    const {
      _id: _agentId,
      _version: _agentVersion,
      response_engine: _responseEngine,
      ...voiceAgentConfig
    } = agent

    // For custom-llm, the llm_websocket_url goes in config (it's mutable)
    const configToWrite =
      agent.response_engine.type === "custom-llm"
        ? {
            ...voiceAgentConfig,
            llm_websocket_url: agent.response_engine.llm_websocket_url,
          }
        : voiceAgentConfig

    await serializeResponseEngine(agent, agentDirPath)

    files[path.join(agentDirPath, "config.yaml")] = await writeYaml(
      configToWrite,
      { comments: agentFieldDocs },
    )
  }

  // Serialize chat agents
  for (const agent of state.chatAgents) {
    const agentDirName = getAgentDirName(agent)
    const agentDirPath = path.join(agentsDir, agentDirName)

    // .agent.json - immutable metadata (IDs, versions, response engine reference)
    const responseEngineForMeta =
      agent.response_engine.type === "custom-llm"
        ? { type: "custom-llm" as const }
        : agent.response_engine
    files[path.join(agentDirPath, ".agent.json")] = await writeJson({
      id: agent._id,
      version: agent._version,
      channel: "chat",
      response_engine: responseEngineForMeta,
    })

    // Prepare agent config for storage (mutable fields only)
    const {
      _id: _agentId,
      _version: _agentVersion,
      response_engine: _responseEngine,
      ...chatAgentConfig
    } = agent

    // For custom-llm, the llm_websocket_url goes in config (it's mutable)
    const chatConfigToWrite =
      agent.response_engine.type === "custom-llm"
        ? {
            ...chatAgentConfig,
            llm_websocket_url: agent.response_engine.llm_websocket_url,
          }
        : chatAgentConfig

    await serializeResponseEngine(agent, agentDirPath)

    files[path.join(agentDirPath, "config.yaml")] = await writeYaml(
      chatConfigToWrite,
      { comments: chatAgentFieldDocs },
    )
  }

  return files
}

export async function canonicalizeFromFiles(
  /**
   * A record where keys are file paths relative to the agents dir and values
   * are file contents.
   */
  files: Record<string, string>,
): Promise<CanonicalState> {
  // Group files by agent directory (first path component)

  const filesByAgentDir = R.pipe(
    files,
    R.entries(),
    R.groupBy(([fp]) => fp.split("/")[0] ?? ""),
  )

  const voiceAgents: CanonicalVoiceAgent[] = []
  const chatAgents: CanonicalChatAgent[] = []
  const llms: CanonicalLLM[] = []
  const conversationFlows: CanonicalConversationFlow[] = []

  for (const [agentDir, agentFiles] of Object.entries(filesByAgentDir)) {
    const fileMap = Object.fromEntries(agentFiles)

    // Get agent metadata from .agent.json file
    const agentMetaFile = fileMap[`${agentDir}/.agent.json`]
    if (!agentMetaFile) continue

    const agentMeta = readJson(
      agentMetaFile,
      z.object({
        id: z.string(),
        version: z.number(),
        // Default to "voice" for backwards compatibility with existing agents
        channel: z.enum(["voice", "chat"]).default("voice"),
        response_engine: z.discriminatedUnion("type", [
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
          z.object({
            type: z.literal("custom-llm"),
          }),
        ]),
      }),
    )

    // Parse agent config file
    const configContent = fileMap[`${agentDir}/config.yaml`]
    if (!configContent) continue
    const agentConfig = readYaml(configContent, z.looseObject({}))

    // Create resolver function for file placeholders
    const resolveFileContent = (filePath: string) => {
      // Remove leading ./ if present
      const normalizedPath = filePath.replace(/^\.\//, "")
      const fullPath = `${agentDir}/${normalizedPath}`
      const content = fileMap[fullPath]
      if (!content) {
        throw new Error(`File not found: ${fullPath}`)
      }
      return content
    }

    // Resolve file placeholders in agent config
    await resolveFilePlaceholders(agentConfig, resolveFileContent)

    // Handle response engine type (custom-llm has no linked resource, others do)
    // Note: casts below are necessary because configs are parsed with
    // z.looseObject({}) for forward compatibility -- the actual shapes are
    // enforced by the file structure conventions rather than a strict schema.
    if (agentMeta.response_engine.type === "retell-llm") {
      const llmContent = fileMap[`${agentDir}/llm.yaml`]
      if (llmContent) {
        const llmConfig = readYaml(llmContent, z.looseObject({}))
        await resolveFilePlaceholders(llmConfig, resolveFileContent)
        llms.push({
          ...llmConfig,
          _id: agentMeta.response_engine.llm_id,
          _version: agentMeta.response_engine.version ?? 0,
        } as CanonicalLLM)
      }
    } else if (agentMeta.response_engine.type === "conversation-flow") {
      const flowContent = fileMap[`${agentDir}/conversation-flow.yaml`]
      if (flowContent) {
        const flowConfig = readYaml(flowContent, z.looseObject({}))
        await resolveFilePlaceholders(flowConfig, resolveFileContent)

        // Merge display positions from .positions.json back into the flow
        const positionsFile = fileMap[`${agentDir}/.positions.json`]
        if (positionsFile) {
          const positions = readJson(positionsFile, z.looseObject({}))
          if (positions.begin_tag)
            flowConfig.begin_tag_display_position = positions.begin_tag
          if (positions.nodes && Array.isArray(flowConfig.nodes)) {
            const nodePositions = positions.nodes as Record<
              string,
              { x: number; y: number }
            >
            for (const node of flowConfig.nodes) {
              if (node.id && nodePositions[node.id])
                node.display_position = nodePositions[node.id]
            }
          }
          if (positions.components && Array.isArray(flowConfig.components)) {
            const compPositions = positions.components as Record<
              string,
              { x: number; y: number }
            >
            for (const comp of flowConfig.components) {
              if (comp.name && compPositions[comp.name])
                comp.begin_tag_display_position = compPositions[comp.name]
            }
          }
        }

        conversationFlows.push({
          ...flowConfig,
          _id: agentMeta.response_engine.conversation_flow_id,
          _version: agentMeta.response_engine.version ?? 0,
        } as CanonicalConversationFlow)
      }
    }

    // Build response engine for canonical agent config
    const responseEngine =
      agentMeta.response_engine.type === "custom-llm"
        ? {
            type: "custom-llm" as const,
            llm_websocket_url:
              typeof agentConfig.llm_websocket_url === "string"
                ? agentConfig.llm_websocket_url
                : "",
          }
        : agentMeta.response_engine

    // Strip versioning metadata (managed by Retell) and llm_websocket_url (moved to response_engine)
    const {
      version_title: _vt,
      version_description: _vd,
      llm_websocket_url: _url,
      ...cleanConfig
    } = agentConfig

    const canonicalAgent = {
      ...cleanConfig,
      _id: agentMeta.id,
      _version: agentMeta.version,
      response_engine: responseEngine,
    }

    if (agentMeta.channel === "chat") {
      chatAgents.push(canonicalAgent as CanonicalChatAgent)
    } else {
      voiceAgents.push(canonicalAgent as CanonicalVoiceAgent)
    }
  }

  return {
    voiceAgents,
    chatAgents,
    llms,
    conversationFlows,
  }
}

// ============================================================================
// Test Case Definitions
// ============================================================================

export type TestCaseDefinition = z.infer<typeof TestCaseDefinitionSchema>

/**
 * Canonical test case type for local storage (strips response_engine, adds
 * _id).
 */
export type CanonicalTestCase = Omit<
  TestCaseDefinition,
  "test_case_definition_id" | "response_engine"
> & {
  _id: string
}

/**
 * Fetches test case definitions for a specific response engine from the Retell
 * API.
 */
export async function getTestCaseDefinitions(
  responseEngine:
    | { type: "retell-llm"; llm_id: string; version?: number }
    | {
        type: "conversation-flow"
        conversation_flow_id: string
        version?: number
      },
): Promise<TestCaseDefinition[]> {
  const params = new URLSearchParams({ type: responseEngine.type })

  if (responseEngine.type === "retell-llm") {
    params.set("llm_id", responseEngine.llm_id)
    if (responseEngine.version != null) {
      params.set("version", String(responseEngine.version))
    }
  } else {
    params.set("conversation_flow_id", responseEngine.conversation_flow_id)
    if (responseEngine.version != null) {
      params.set("version", String(responseEngine.version))
    }
  }

  let data: unknown
  try {
    data = await retellFetch(`/list-test-case-definitions?${params.toString()}`)
  } catch (err) {
    // If no test cases exist, the API may return 404
    if (err instanceof Error && err.message.includes("404")) return []
    throw err
  }

  const result = z.array(TestCaseDefinitionSchema).safeParse(data)
  if (!result.success) {
    console.warn(
      "Warning: Some test case fields failed validation:",
      result.error.issues,
    )
    return []
  }

  return result.data
}

/**
 * Converts API test case definitions to canonical form (strips response_engine
 * reference, renames ID field).
 */
export function canonicalizeTestCases(
  testCases: TestCaseDefinition[],
): CanonicalTestCase[] {
  return testCases.map(
    ({ test_case_definition_id, response_engine: _, ...rest }) => ({
      ...rest,
      _id: test_case_definition_id,
    }),
  )
}

/**
 * Reads local test cases from an agent's tests/ directory. Returns empty array
 * if no tests directory exists.
 */
export async function getLocalTestCases(
  agentDirPath: string,
): Promise<CanonicalTestCase[]> {
  const testsDir = path.join(agentDirPath, "tests")
  const metaFile = Bun.file(path.join(testsDir, ".tests.json"))

  if (!(await metaFile.exists())) {
    return []
  }

  // Read metadata to get test case IDs
  const metaContent = await metaFile.text()
  const metadata = readJson(
    metaContent,
    z.object({
      response_engine: z.object({}).passthrough(),
      test_cases: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
        }),
      ),
    }),
  )

  const testCases: CanonicalTestCase[] = []

  // Read each test case config file
  for (const testCaseMeta of metadata.test_cases) {
    const testCaseName = toSnakeCase(testCaseMeta.name)

    const configPath = path.join(testsDir, `${testCaseName}.yaml`)
    const configFile = Bun.file(configPath)
    if (!(await configFile.exists())) {
      console.warn(
        `Warning: Could not find config file for test case ${testCaseMeta.name}`,
      )
      continue
    }

    // Parse config
    const config = readYaml(await configFile.text(), z.looseObject({}))

    // Resolve file placeholders (user_prompt)
    const resolveFileContent = async (filePath: string): Promise<string> => {
      const normalizedPath = filePath.replace(/^\.\//, "")
      const fullPath = path.join(testsDir, normalizedPath)
      const content = await Bun.file(fullPath).text()
      return content
    }
    await resolveFilePlaceholders(config, resolveFileContent)

    testCases.push({
      ...config,
      _id: testCaseMeta.id,
    } as CanonicalTestCase)
  }

  return testCases
}

/** Updates a test case definition via the Retell API. */
export async function updateTestCaseDefinition(
  testCaseId: string,
  update: {
    name?: string
    user_prompt?: string
    metrics?: string[]
    dynamic_variables?: Record<string, unknown>
    tool_mocks?: Array<{
      tool_name: string
      input_match_rule:
        | { type: "any" }
        | { type: "partial_match"; args: Record<string, unknown> }
      output: string
      result?: boolean | null
    }>
    llm_model?: string
  },
): Promise<void> {
  await retellFetch(`/update-test-case-definition/${testCaseId}`, {
    method: "PUT",
    body: JSON.stringify(update),
  })
}

/**
 * Fetches and writes test cases for all agents in a state. Returns mapping of
 * agent directory paths to test case files written.
 */
export async function fetchAndWriteTestCases({
  state,
  agentsDir = DEFAULT_AGENTS_DIR,
}: {
  state: CanonicalState
  agentsDir?: string
}): Promise<{ agentDir: string; testCount: number }[]> {
  const results: { agentDir: string; testCount: number }[] = []

  // Process all agents (voice and chat)
  const allAgents = [
    ...state.voiceAgents.map((a) => ({
      ...a,
      agentType: "voice" as const,
    })),
    ...state.chatAgents.map((a) => ({
      ...a,
      agentType: "chat" as const,
    })),
  ]

  for (const agent of allAgents) {
    const agentDirName = getAgentDirName(agent)
    const agentDirPath = path.join(agentsDir, agentDirName)

    const engine = normalizeResponseEngine(agent.response_engine)
    if (!engine) continue

    let testCases: TestCaseDefinition[]
    try {
      testCases = await getTestCaseDefinitions(engine)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(
        `Warning: Could not fetch test cases for ${agent.agent_name ?? agent._id}: ${message}`,
      )
      continue
    }

    if (testCases.length === 0) {
      // Clean up tests directory if it exists but no test cases
      const testsDir = path.join(agentDirPath, "tests")
      await fs.rm(testsDir, { recursive: true, force: true }).catch(() => {})
      continue
    }

    // Write test cases to disk
    await writeTestCases(testCases, {
      agentDirPath,
      responseEngine: engine,
    })

    results.push({ agentDir: agentDirName, testCount: testCases.length })
  }

  return results
}

/**
 * Writes test case definitions to disk in a tests/ subdirectory within an agent
 * directory. Creates both a .tests.json metadata file and individual test case
 * config files.
 */
async function writeTestCases(
  testCases: TestCaseDefinition[],
  {
    agentDirPath,
    responseEngine,
  }: {
    agentDirPath: string
    responseEngine:
      | { type: "retell-llm"; llm_id: string; version?: number }
      | {
          type: "conversation-flow"
          conversation_flow_id: string
          version?: number
        }
  },
): Promise<void> {
  const testsDir = path.join(agentDirPath, "tests")
  await fs.mkdir(testsDir, { recursive: true })

  // Write .tests.json metadata (immutable info)
  const metadata = {
    response_engine: responseEngine,
    test_cases: testCases.map((tc) => ({
      id: tc.test_case_definition_id,
      name: tc.name,
    })),
  }
  await Bun.write(path.join(testsDir, ".tests.json"), await writeJson(metadata))

  // Track written files for cleanup
  const writtenFiles = new Set<string>([".tests.json"])

  // Write individual test case files
  for (const testCase of testCases) {
    const {
      test_case_definition_id: _id,
      response_engine: _engine,
      creation_timestamp: _created,
      user_modified_timestamp: _modified,
      type: _type, // Always "simulation", no need to store
      ...config
    } = testCase

    // Extract user_prompt to separate markdown file
    const testCaseName = toSnakeCase(testCase.name)
    const promptFileName = `${testCaseName}_prompt.md`
    const promptFilePath = path.join(testsDir, promptFileName)

    await Bun.write(promptFilePath, await writeMarkdown(config.user_prompt))
    writtenFiles.add(promptFileName)

    // Replace prompt with file reference
    const configWithFileRef = {
      ...config,
      user_prompt: `file://./${promptFileName}`,
    }

    // Write test case config file
    const configFileName = `${testCaseName}.yaml`
    const configContent = await writeYaml(configWithFileRef, {
      comments: testCaseFieldDocs,
    })

    await Bun.write(path.join(testsDir, configFileName), configContent)
    writtenFiles.add(configFileName)
  }

  // Clean up stale files in tests directory (best-effort, dir may not exist)
  const existingFiles = await fs.readdir(testsDir).catch(() => [] as string[])
  for (const file of existingFiles) {
    if (!writtenFiles.has(file)) {
      await fs.rm(path.join(testsDir, file), { force: true })
    }
  }
}

/** Field documentation for test case config files. */
const testCaseFieldDocs: Record<string, string> = {
  name: "Name of the test case",
  user_prompt: "Prompt describing simulated user behavior (file reference)",
  metrics: "Array of evaluation criteria to check",
  dynamic_variables: "Variables injected into the agent during test",
  tool_mocks: "Mock responses for tool/function calls",
  llm_model: "LLM model used to simulate the user",
}
