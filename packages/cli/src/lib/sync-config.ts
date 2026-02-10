import { checkbox, confirm } from "@inquirer/prompts"
import { retellPagination } from "retell-utils"
import z from "zod"
import { getRetell } from "./agents"
import * as logger from "./logger"
import { writeJson } from "./utils"

const SYNC_CONFIG_FILE = ".retell-sync.json"

const syncConfigSchema = z.object({
  agents: z.array(z.string()).optional(),
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
 * the account. Includes both voice and chat agents.
 */
export async function selectAgentsInteractive(): Promise<string[]> {
  const client = getRetell()
  // Fetch both voice and chat agents in parallel
  const [voiceAgents, chatAgents] = await Promise.all([
    retellPagination((opts) => client.agent.list(opts), "agent_id"),
    retellPagination((opts) => client.chatAgent.list(opts), "agent_id"),
  ])

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
    })),
  })

  if (selected.length === 0) {
    logger.warn("No agents selected")
    return []
  }

  // Ask if they want to save the selection
  const save = await confirm({
    message: `Save selection to ${SYNC_CONFIG_FILE}?`,
    default: true,
  })

  if (save) {
    await writeSyncConfig({ agents: selected })
    logger.dim(`Saved to ${SYNC_CONFIG_FILE}`)
  }

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
