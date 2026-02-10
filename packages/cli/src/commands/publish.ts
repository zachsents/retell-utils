import { ExitPromptError } from "@inquirer/core"
import chalk from "chalk"
import type { Command } from "commander"
import { getRemoteState, getRetell } from "../lib/agents"
import { computeChanges } from "../lib/changes"
import * as logger from "../lib/logger"
import { resolveAgentIds } from "../lib/sync-config"
import {
  type ConfigFormat,
  DEFAULT_AGENTS_DIR,
  DEFAULT_CONFIG_FORMAT,
  pluralize,
} from "../lib/utils"
import { pull } from "./pull"

type GlobalOpts = {
  agentsDir?: string
  configFormat?: ConfigFormat
}

export async function publishCommand(
  agentIdArgs: string[],
  opts: {
    all?: boolean
    select?: boolean
    dryRun?: boolean
    quiet?: boolean
  },
  cmd: Command,
) {
  const globalOpts = cmd.optsWithGlobals<GlobalOpts>()

  // Set quiet mode globally before any logging happens
  if (opts.quiet) logger.setQuiet(true)

  try {
    const agentIds = await resolveAgentIds(agentIdArgs, {
      all: opts.all,
      select: opts.select,
    })

    const publishedIds = await publish({
      agentsDir: globalOpts.agentsDir,
      configFormat: globalOpts.configFormat,
      agentIds,
      dryRun: opts.dryRun,
    })

    // In quiet mode, output just the published agent IDs
    if (opts.quiet && publishedIds.length > 0) {
      console.log(publishedIds.join(" "))
    }
  } catch (err) {
    if (err instanceof ExitPromptError) {
      logger.dim("Aborted")
      return
    }
    throw err
  }
}

/**
 * Compares draft state against published state and publishes agents that have
 * unpublished changes. Also updates phone numbers to use new versions. Returns
 * array of published agent IDs.
 */
export async function publish({
  agentsDir = DEFAULT_AGENTS_DIR,
  configFormat = DEFAULT_CONFIG_FORMAT,
  agentIds = null,
  dryRun = false,
}: {
  agentsDir?: string
  configFormat?: ConfigFormat
  agentIds?: string[] | null
  dryRun?: boolean
} = {}): Promise<string[]> {
  const scopeLabel = agentIds ? `${agentIds.length} agent(s)` : "all agents"
  logger.bold(`Checking ${scopeLabel} for unpublished changes...`)

  // Fetch draft and published states in parallel
  let spinner = logger.createSpinner("Fetching draft and published states...")
  const [draftState, publishedState] = await Promise.all([
    getRemoteState({ draft: true, agentIds }),
    getRemoteState({ draft: false, agentIds }),
  ])
  spinner.stop(chalk.dim("Done"))

  // Build agent names map (includes both voice and chat agents)
  const agentNames = new Map([
    ...draftState.voiceAgents.map(
      (a) => [a._id, a.agent_name ?? a._id] as const,
    ),
    ...draftState.chatAgents.map(
      (a) => [a._id, a.agent_name ?? a._id] as const,
    ),
  ])

  // Track which agents are chat agents for publishing
  const chatAgentIds = new Set(draftState.chatAgents.map((a) => a._id))

  // Find differences between draft and published
  spinner = logger.createSpinner("Comparing draft vs published...")
  const changes = computeChanges(draftState, publishedState, {
    includeNew: true,
  })
  const totalAgentChanges =
    changes.voiceAgents.length + changes.chatAgents.length
  spinner.stop(
    chalk.dim(
      `Found ${chalk.white(totalAgentChanges)} agent changes, ${chalk.white(changes.llms.length)} LLM changes, ${chalk.white(changes.flows.length)} flow changes`,
    ),
  )

  // Collect agent IDs that need publishing
  const agentIdsToPublish = new Set<string>()

  // Voice agents with direct changes
  for (const change of changes.voiceAgents) {
    agentIdsToPublish.add(change.id)
  }

  // Chat agents with direct changes
  for (const change of changes.chatAgents) {
    agentIdsToPublish.add(change.id)
  }

  // Voice agents whose LLMs/flows changed
  const changedLlmIds = new Set(changes.llms.map((c) => c.id))
  const changedFlowIds = new Set(changes.flows.map((c) => c.id))

  for (const agent of draftState.voiceAgents) {
    if (
      agent.response_engine.type === "retell-llm" &&
      changedLlmIds.has(agent.response_engine.llm_id)
    ) {
      agentIdsToPublish.add(agent._id)
    }
    if (
      agent.response_engine.type === "conversation-flow" &&
      changedFlowIds.has(agent.response_engine.conversation_flow_id)
    ) {
      agentIdsToPublish.add(agent._id)
    }
  }

  // Chat agents whose LLMs/flows changed
  for (const agent of draftState.chatAgents) {
    if (
      agent.response_engine.type === "retell-llm" &&
      changedLlmIds.has(agent.response_engine.llm_id)
    ) {
      agentIdsToPublish.add(agent._id)
    }
    if (
      agent.response_engine.type === "conversation-flow" &&
      changedFlowIds.has(agent.response_engine.conversation_flow_id)
    ) {
      agentIdsToPublish.add(agent._id)
    }
  }

  if (agentIdsToPublish.size === 0) {
    logger.success("All agents are already up to date")
    return []
  }

  // Dry run - show what would be published
  if (dryRun) {
    logger.warn("Dry run mode - no changes will be made")
    logger.log(
      chalk.cyan(
        `\nWould publish ${pluralize("agent", agentIdsToPublish.size, true)}:`,
      ),
    )
    for (const id of agentIdsToPublish) {
      const name = agentNames.get(id) ?? id
      const type = chatAgentIds.has(id) ? "chat" : "voice"
      logger.log(`  ${chalk.bold(name)} ${chalk.dim(`(${type}, ${id})`)}`)
    }
    return [...agentIdsToPublish]
  }

  logger.bold(
    `Publishing ${pluralize("agent", agentIdsToPublish.size, true)}...`,
  )

  spinner = logger.createSpinner(
    `Publishing ${agentIdsToPublish.size} agents...`,
  )

  const client = getRetell()
  const publishResults = await Promise.allSettled(
    [...agentIdsToPublish].map(async (id) => {
      // Use appropriate API based on agent type
      if (chatAgentIds.has(id)) {
        await client.chatAgent.publish(id)
      } else {
        await client.agent.publish(id)
      }
      return {
        id,
        name: agentNames.get(id) ?? id,
        type: chatAgentIds.has(id) ? "chat" : "voice",
      }
    }),
  )

  spinner.stop(chalk.dim("Done"))

  const publishedAgentIds: string[] = []
  const publishedVoiceAgentIds: string[] = []

  for (const result of publishResults) {
    if (result.status === "fulfilled") {
      const { name, type, id } = result.value
      logger.log(chalk.green(`Published ${type} agent ${chalk.bold(name)}`))
      publishedAgentIds.push(id)
      if (type === "voice") {
        publishedVoiceAgentIds.push(id)
      }
    } else {
      logger.error(`Failed to publish: ${result.reason}`)
    }
  }

  logger.success(
    `Published ${pluralize("agent", publishedAgentIds.length, true)}`,
  )

  // Update phone numbers to use the newly published agent versions (voice agents only)
  if (publishedVoiceAgentIds.length > 0) {
    await updatePhoneNumberVersions(publishedVoiceAgentIds, agentNames)
  }

  // Re-pull to get the updated state from Retell
  if (!logger.isQuiet()) {
    logger.bold("Syncing latest state...")
    await pull({ agentsDir, configFormat, agentIds })
  }

  return publishedAgentIds
}

/**
 * Updates phone numbers that reference the published agents to use the new
 * published version.
 */
async function updatePhoneNumberVersions(
  publishedAgentIds: string[],
  agentNames: Map<string, string>,
) {
  const spinner = logger.createSpinner("Updating phone numbers...")

  const client = getRetell()
  // Get all phone numbers and published agent versions in parallel
  const [phoneNumbers, ...agentVersionLists] = await Promise.all([
    client.phoneNumber.list(),
    ...publishedAgentIds.map((id) => client.agent.getVersions(id)),
  ])

  // Build a map of agent ID -> latest published version
  const publishedVersions = new Map<string, number>()
  for (const [i, agentId] of publishedAgentIds.entries()) {
    const versions = agentVersionLists[i]
    if (!versions) continue

    // Find the latest published version (highest version number with is_published=true)
    const latestPublished = versions
      .filter((v) => v.is_published)
      .sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0]

    if (latestPublished?.version != null) {
      publishedVersions.set(agentId, latestPublished.version)
    }
  }

  // Find phone numbers that need updating
  const publishedAgentIdSet = new Set(publishedAgentIds)
  const updates: Array<{
    phoneNumber: string
    inboundVersion?: number
    outboundVersion?: number
  }> = []

  for (const phone of phoneNumbers) {
    const inboundVersion =
      phone.inbound_agent_id && publishedAgentIdSet.has(phone.inbound_agent_id)
        ? publishedVersions.get(phone.inbound_agent_id)
        : undefined

    const outboundVersion =
      phone.outbound_agent_id &&
      publishedAgentIdSet.has(phone.outbound_agent_id)
        ? publishedVersions.get(phone.outbound_agent_id)
        : undefined

    if (inboundVersion != null || outboundVersion != null) {
      updates.push({
        phoneNumber: phone.phone_number,
        inboundVersion,
        outboundVersion,
      })
    }
  }

  if (updates.length === 0) {
    spinner.stop(chalk.dim("No phone numbers to update"))
    return
  }

  // Update all phone numbers in parallel
  const updateResults = await Promise.allSettled(
    updates.map(async ({ phoneNumber, inboundVersion, outboundVersion }) => {
      await client.phoneNumber.update(phoneNumber, {
        ...(inboundVersion != null && {
          inbound_agent_version: inboundVersion,
        }),
        ...(outboundVersion != null && {
          outbound_agent_version: outboundVersion,
        }),
      })
      return phoneNumber
    }),
  )

  spinner.stop(chalk.dim("Done"))

  let updatedCount = 0
  for (const result of updateResults) {
    if (result.status === "fulfilled") {
      const phone = updates.find((u) => u.phoneNumber === result.value)
      const agentInfo: string[] = []
      if (phone?.inboundVersion != null) {
        const inboundPhone = phoneNumbers.find(
          (p) => p.phone_number === result.value,
        )
        const agentId = inboundPhone?.inbound_agent_id
        const name = agentId ? (agentNames.get(agentId) ?? agentId) : "unknown"
        agentInfo.push(`inbound: ${name} v${phone.inboundVersion}`)
      }
      if (phone?.outboundVersion != null) {
        const outboundPhone = phoneNumbers.find(
          (p) => p.phone_number === result.value,
        )
        const agentId = outboundPhone?.outbound_agent_id
        const name = agentId ? (agentNames.get(agentId) ?? agentId) : "unknown"
        agentInfo.push(`outbound: ${name} v${phone.outboundVersion}`)
      }
      logger.log(
        chalk.green(
          `Updated ${chalk.bold(result.value)} (${agentInfo.join(", ")})`,
        ),
      )
      updatedCount++
    } else {
      logger.error(`Failed to update phone number: ${result.reason}`)
    }
  }

  logger.success(`Updated ${pluralize("phone number", updatedCount, true)}`)
}
