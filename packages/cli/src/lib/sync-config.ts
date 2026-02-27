import { checkbox } from "@inquirer/prompts"
import {
  ChatAgentResponseSchema,
  ConversationFlowComponentResponseSchema,
  retellPagination,
  VoiceAgentResponseSchema,
} from "@core"
import z from "zod"
import { retellFetch } from "./agents"
import * as logger from "./logger"
import { writeJson } from "./utils"

const SYNC_CONFIG_FILE = ".retell-sync.json"

const syncConfigSchema = z.object({
  agents: z.array(z.string()).optional(),
  components: z.array(z.string()).optional(),
})

type SyncConfig = z.infer<typeof syncConfigSchema>

/** Reads the .retell-sync.json config file from cwd if it exists. */
export async function readSyncConfig(): Promise<SyncConfig | null> {
  const file = Bun.file(SYNC_CONFIG_FILE)
  const exists = await file.exists()
  if (!exists) return null

  const content = await file.text()
  const parsed = syncConfigSchema.safeParse(JSON.parse(content))
  if (!parsed.success) {
    logger.warn(`Warning: Invalid ${SYNC_CONFIG_FILE} format, ignoring`)
    return null
  }
  return parsed.data
}

/** Writes the .retell-sync.json config file to cwd. */
export async function writeSyncConfig(config: SyncConfig): Promise<void> {
  const content = await writeJson(config)
  await Bun.write(SYNC_CONFIG_FILE, content)
}

/**
 * Prompts the user to select agents interactively from the available agents in
 * the account. Includes both voice and chat agents. Pre-checks agents that are
 * already in the dotfile.
 */
export async function selectAgentsInteractive(): Promise<string[]> {
  const paginationParams = (opts: {
    limit?: number
    pagination_key?: string
    pagination_key_version?: number
  }) => {
    const p = new URLSearchParams()
    if (opts.limit) p.set("limit", String(opts.limit))
    if (opts.pagination_key) p.set("pagination_key", opts.pagination_key)
    if (opts.pagination_key_version != null)
      p.set("pagination_key_version", String(opts.pagination_key_version))
    return p.toString()
  }

  const [voiceAgents, chatAgents, config] = await Promise.all([
    retellPagination(
      async (opts) =>
        z
          .array(VoiceAgentResponseSchema)
          .parse(await retellFetch(`/list-agents?${paginationParams(opts)}`)),
      "agent_id",
    ),
    retellPagination(
      async (opts) =>
        z
          .array(ChatAgentResponseSchema)
          .parse(
            await retellFetch(`/list-chat-agents?${paginationParams(opts)}`),
          ),
      "agent_id",
    ),
    readSyncConfig(),
  ])

  const preSelected = new Set(config?.agents ?? [])

  // Dedupe voice agents by agent_id (keep latest version)
  const voiceAgentMap = new Map<
    string,
    (typeof voiceAgents)[number] & { _channel: "voice" }
  >()
  for (const agent of voiceAgents) {
    const existing = voiceAgentMap.get(agent.agent_id)
    if (!existing || (agent.version ?? 0) > (existing.version ?? 0)) {
      voiceAgentMap.set(agent.agent_id, { ...agent, _channel: "voice" })
    }
  }

  // Dedupe chat agents by agent_id (keep latest version)
  const chatAgentMap = new Map<
    string,
    (typeof chatAgents)[number] & { _channel: "chat" }
  >()
  for (const agent of chatAgents) {
    const existing = chatAgentMap.get(agent.agent_id)
    if (!existing || (agent.version ?? 0) > (existing.version ?? 0)) {
      chatAgentMap.set(agent.agent_id, { ...agent, _channel: "chat" })
    }
  }

  // Combine and sort all agents
  const allAgents = [...voiceAgentMap.values(), ...chatAgentMap.values()].sort(
    (a, b) =>
      (a.agent_name ?? a.agent_id).localeCompare(b.agent_name ?? b.agent_id),
  )

  if (allAgents.length === 0) {
    logger.warn("No agents found in the account")
    return []
  }

  const selected = await checkbox({
    message: "Select agents to sync:",
    choices: allAgents.map((agent) => ({
      name: `${agent.agent_name ?? agent.agent_id} (${agent._channel})`,
      value: agent.agent_id,
      checked: preSelected.has(agent.agent_id),
    })),
  })

  if (selected.length === 0) {
    logger.warn("No agents selected")
    return []
  }

  const existing = (await readSyncConfig()) ?? {}
  await writeSyncConfig({ ...existing, agents: selected })
  logger.dim(`Saved to ${SYNC_CONFIG_FILE}`)

  return selected
}

/**
 * Resolves agent IDs based on CLI args, flags, config file, or interactive
 * selection. Returns null if all agents should be synced.
 */
export async function resolveAgentIds(
  args: string[],
  { all = false, select = false }: { all?: boolean; select?: boolean } = {},
): Promise<string[] | null> {
  // --select flag forces interactive selection
  if (select) {
    return selectAgentsInteractive()
  }

  // Explicit args take priority
  if (args.length > 0) {
    return args
  }

  // --all flag means sync everything
  if (all) {
    return null
  }

  // Check config file
  const config = await readSyncConfig()
  if (config?.agents && config.agents.length > 0) {
    logger.dim(
      `Using ${config.agents.length} agent(s) from ${SYNC_CONFIG_FILE}`,
    )
    return config.agents
  }

  // Interactive selection
  return selectAgentsInteractive()
}

/**
 * Prompts the user to select shared components interactively from the available
 * components in the account. Pre-checks components that are already in the
 * dotfile.
 */
export async function selectComponentsInteractive(): Promise<string[]> {
  const [allComponents, config] = await Promise.all([
    z
      .array(ConversationFlowComponentResponseSchema)
      .parse(await retellFetch("/list-conversation-flow-components")),
    readSyncConfig(),
  ])

  if (allComponents.length === 0) {
    logger.warn("No shared components found in the account")
    return []
  }

  const preSelected = new Set(config?.components ?? [])

  const sorted = [...allComponents].sort((a, b) =>
    (a.name ?? a.conversation_flow_component_id).localeCompare(
      b.name ?? b.conversation_flow_component_id,
    ),
  )

  const selected = await checkbox({
    message: "Select components to sync:",
    choices: sorted.map((c) => ({
      name: c.name ?? c.conversation_flow_component_id,
      value: c.conversation_flow_component_id,
      checked: preSelected.has(c.conversation_flow_component_id),
    })),
  })

  if (selected.length === 0) {
    logger.warn("No components selected")
    return []
  }

  const existing = (await readSyncConfig()) ?? {}
  await writeSyncConfig({ ...existing, components: selected })
  logger.dim(`Saved to ${SYNC_CONFIG_FILE}`)

  return selected
}

/**
 * Resolves component IDs based on flags, config file, or interactive selection.
 * Returns null if all components should be synced, or undefined if component
 * syncing should be skipped entirely.
 */
export async function resolveComponentIds({
  all = false,
  select = false,
}: { all?: boolean; select?: boolean } = {}): Promise<
  string[] | null | undefined
> {
  if (select) {
    return selectComponentsInteractive()
  }

  if (all) {
    return null
  }

  const config = await readSyncConfig()
  if (config?.components && config.components.length > 0) {
    logger.dim(
      `Using ${config.components.length} component(s) from ${SYNC_CONFIG_FILE}`,
    )
    return config.components
  }

  // No components configured -- skip silently
  return undefined
}
