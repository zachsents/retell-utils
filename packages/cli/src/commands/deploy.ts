import { ExitPromptError } from "@inquirer/core"
import chalk from "chalk"
import type { Command } from "commander"
import diff from "microdiff"
import path from "node:path"
import * as R from "remeda"
import {
  type CanonicalTestCase,
  canonicalizeTestCases,
  getLocalState,
  getLocalTestCases,
  getRemoteState,
  getRetell,
  getTestCaseDefinitions,
  updateTestCaseDefinition,
} from "../lib/agents"
import {
  type Changes,
  type TestCaseChange,
  computeChanges,
} from "../lib/changes"
import * as logger from "../lib/logger"
import { resolveAgentIds } from "../lib/sync-config"
import {
  type ConfigFormat,
  DEFAULT_AGENTS_DIR,
  DEFAULT_CONFIG_FORMAT,
  FILE_HASH_LENGTH,
  pluralize,
  toSnakeCase,
} from "../lib/utils"
import { pull } from "./pull"

type GlobalOpts = {
  agentsDir?: string
  configFormat?: ConfigFormat
}

export async function deployCommand(
  agentIdArgs: string[],
  opts: {
    all?: boolean
    select?: boolean
    dryRun?: boolean
    verbose?: boolean
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

    const affectedIds = await deploy({
      agentsDir: globalOpts.agentsDir,
      configFormat: globalOpts.configFormat,
      agentIds,
      dryRun: opts.dryRun,
      verbose: opts.verbose,
    })

    // In quiet mode, output just the affected agent IDs
    if (opts.quiet && affectedIds.length > 0) {
      console.log(affectedIds.join(" "))
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
 * Compares local files against Retell API draft and pushes differences. Returns
 * array of affected agent IDs.
 */
export async function deploy({
  agentsDir = DEFAULT_AGENTS_DIR,
  configFormat = DEFAULT_CONFIG_FORMAT,
  agentIds = null,
  dryRun = false,
  verbose = false,
}: {
  agentsDir?: string
  configFormat?: ConfigFormat
  /** If null, deploys all agents. If array, deploys only those agent IDs. */
  agentIds?: string[] | null
  dryRun?: boolean
  verbose?: boolean
} = {}): Promise<string[]> {
  const scopeLabel = agentIds ? `${agentIds.length} agent(s)` : "all agents"
  logger.bold(`Deploying ${scopeLabel} to Retell draft...`)

  // Step 1: Read local state and fetch remote state in parallel
  logger.bold("Analyzing changes...")

  let spinner = logger.createSpinner("Reading local and remote state...")
  const [localState, remoteState] = await Promise.all([
    getLocalState({ agentsDir, agentIds }),
    getRemoteState({ draft: true, agentIds }),
  ])
  const totalLocalAgents =
    localState.voiceAgents.length + localState.chatAgents.length
  const totalRemoteAgents =
    remoteState.voiceAgents.length + remoteState.chatAgents.length
  spinner.stop(
    chalk.dim(
      `Local: ${totalLocalAgents} agents | Remote: ${totalRemoteAgents} agents`,
    ),
  )

  // Step 2: Compute diffs (local changes vs remote)
  spinner = logger.createSpinner("Computing differences...")
  const baseChanges = computeChanges(localState, remoteState)

  // Step 2b: Compute test case diffs
  const testCaseChanges: TestCaseChange[] = []
  const allAgents = [
    ...localState.voiceAgents.map((a) => ({
      ...a,
      agentType: "voice" as const,
    })),
    ...localState.chatAgents.map((a) => ({ ...a, agentType: "chat" as const })),
  ]

  for (const agent of allAgents) {
    if (
      agent.response_engine.type !== "retell-llm" &&
      agent.response_engine.type !== "conversation-flow"
    ) {
      continue
    }

    const agentName = agent.agent_name ?? agent._id
    const hash = agent._id.slice(-FILE_HASH_LENGTH)
    const agentDirName = `${toSnakeCase(agentName)}_${hash}`
    const agentDirPath = path.join(agentsDir, agentDirName)

    // Read local test cases
    const localTestCases = await getLocalTestCases(agentDirPath)
    if (localTestCases.length === 0) continue

    // Fetch remote test cases
    const normalizedEngine =
      agent.response_engine.type === "retell-llm"
        ? {
            type: "retell-llm" as const,
            llm_id: agent.response_engine.llm_id,
            version: agent.response_engine.version ?? undefined,
          }
        : {
            type: "conversation-flow" as const,
            conversation_flow_id: agent.response_engine.conversation_flow_id,
            version: agent.response_engine.version ?? undefined,
          }

    let remoteTestCases: CanonicalTestCase[] = []
    try {
      const rawRemote = await getTestCaseDefinitions(normalizedEngine)
      remoteTestCases = canonicalizeTestCases(rawRemote)
    } catch {
      // If we can't fetch remote, skip this agent's test cases
      continue
    }

    // Compare (exclude metadata fields that aren't editable)
    const testCaseMetadataFields = [
      "_id",
      "creation_timestamp",
      "user_modified_timestamp",
      "type",
    ] as const
    const remoteTestCaseMap = new Map(remoteTestCases.map((tc) => [tc._id, tc]))
    for (const localTC of localTestCases) {
      const remoteTC = remoteTestCaseMap.get(localTC._id)
      if (!remoteTC) continue // New test case - can't deploy without creating

      // Normalize prompts for comparison (trim whitespace, normalize newlines)
      const normalizePrompt = (s: string) => s.trim().replace(/\r\n/g, "\n")
      const localComparable = {
        ...R.omit(localTC, testCaseMetadataFields),
        user_prompt: normalizePrompt(localTC.user_prompt),
      }
      const remoteComparable = {
        ...R.omit(remoteTC, testCaseMetadataFields),
        user_prompt: normalizePrompt(remoteTC.user_prompt),
      }
      const differences = diff(remoteComparable, localComparable)
      if (differences.length > 0) {
        testCaseChanges.push({
          id: localTC._id,
          name: localTC.name,
          current: localTC,
          differences,
        })
      }
    }
  }

  const changes: Changes = { ...baseChanges, testCases: testCaseChanges }
  const totalAgentChanges =
    changes.voiceAgents.length + changes.chatAgents.length
  spinner.stop(
    chalk.dim(
      `Found ${chalk.white(totalAgentChanges)} agent changes, ${chalk.white(changes.llms.length)} LLM changes, ${chalk.white(changes.flows.length)} flow changes, ${chalk.white(changes.testCases.length)} test case changes`,
    ),
  )

  const totalChanges =
    totalAgentChanges +
    changes.llms.length +
    changes.flows.length +
    changes.testCases.length

  // Collect affected agent IDs (agents with direct changes + agents whose LLMs/flows changed)
  const affectedAgentIds = new Set<string>()
  for (const change of changes.voiceAgents) {
    affectedAgentIds.add(change.id)
  }
  for (const change of changes.chatAgents) {
    affectedAgentIds.add(change.id)
  }
  const changedLlmIds = new Set(changes.llms.map((c) => c.id))
  const changedFlowIds = new Set(changes.flows.map((c) => c.id))

  // Check voice agents for affected LLMs/flows
  for (const agent of localState.voiceAgents) {
    if (
      agent.response_engine.type === "retell-llm" &&
      changedLlmIds.has(agent.response_engine.llm_id)
    ) {
      affectedAgentIds.add(agent._id)
    }
    if (
      agent.response_engine.type === "conversation-flow" &&
      changedFlowIds.has(agent.response_engine.conversation_flow_id)
    ) {
      affectedAgentIds.add(agent._id)
    }
  }

  // Check chat agents for affected LLMs/flows
  for (const agent of localState.chatAgents) {
    if (
      agent.response_engine.type === "retell-llm" &&
      changedLlmIds.has(agent.response_engine.llm_id)
    ) {
      affectedAgentIds.add(agent._id)
    }
    if (
      agent.response_engine.type === "conversation-flow" &&
      changedFlowIds.has(agent.response_engine.conversation_flow_id)
    ) {
      affectedAgentIds.add(agent._id)
    }
  }

  if (totalChanges === 0) {
    logger.success("No changes to deploy")
    return []
  }

  // Step 3: Show changes or deploy
  if (dryRun) {
    logger.warn("Dry run mode - no changes will be made")
    if (!logger.isQuiet()) printChangeSummary(changes, { verbose })
    return [...affectedAgentIds]
  }

  // Deploy changes to draft
  logger.bold("Deploying changes to draft...")

  spinner = logger.createSpinner(`Deploying ${totalChanges} changes...`)

  const client = getRetell()
  const updateResults = await Promise.allSettled([
    // Voice agent updates (response_engine is read-only for retell-llm/conversation-flow, but mutable for custom-llm)
    ...changes.voiceAgents.map(async (change) => {
      const { _id, _version, response_engine, ...baseData } = change.current
      const updateData =
        response_engine.type === "custom-llm"
          ? { ...baseData, response_engine }
          : baseData
      await client.agent.update(_id, updateData)
      return { type: "voice agent" as const, id: _id, name: change.name }
    }),
    // Chat agent updates
    ...changes.chatAgents.map(async (change) => {
      const { _id, _version, response_engine, ...baseData } = change.current
      const updateData =
        response_engine.type === "custom-llm"
          ? { ...baseData, response_engine }
          : baseData
      await client.chatAgent.update(_id, updateData)
      return { type: "chat agent" as const, id: _id, name: change.name }
    }),
    // LLM updates
    ...changes.llms.map(async (change) => {
      const { _id, _version, ...updateData } = change.current
      await client.llm.update(_id, updateData)
      return { type: "llm" as const, id: _id, name: change.name }
    }),
    // Flow updates
    ...changes.flows.map(async (change) => {
      const { _id, _version, ...updateData } = change.current
      await client.conversationFlow.update(_id, updateData)
      return { type: "flow" as const, id: _id, name: change.name }
    }),
    // Test case updates
    ...changes.testCases.map(async (change) => {
      const { _id, ...updateData } = change.current
      await updateTestCaseDefinition(_id, updateData)
      return { type: "test case" as const, id: _id, name: change.name }
    }),
  ])

  spinner.stop(chalk.dim("Done"))

  // Process results
  for (const result of updateResults) {
    if (result.status === "fulfilled") {
      const { type, name } = result.value
      logger.log(chalk.green(`Updated ${type} ${chalk.bold(name)}`))
    } else {
      logger.error(`Failed to update: ${result.reason}`)
    }
  }

  logger.success(`Deployed ${pluralize("change", totalChanges, true)}`)

  // Re-pull to get the updated state from Retell
  if (!logger.isQuiet()) {
    logger.bold("Syncing latest state...")
    await pull({ agentsDir, configFormat, agentIds })
  }

  return [...affectedAgentIds]
}

/** Formats a value for display, optionally truncating long strings. */
function formatValue(value: unknown, { verbose = false } = {}): string {
  const maxLen = verbose ? Infinity : 60

  if (value === undefined) return chalk.dim("undefined")
  if (value === null) return chalk.dim("null")
  if (typeof value === "string") {
    // In verbose mode, show actual newlines; otherwise escape them
    const display = verbose ? value : value.replace(/\n/g, "\\n")
    if (display.length > maxLen) {
      return `"${display.slice(0, maxLen)}…"`
    }
    return verbose ? display : `"${display}"`
  }
  // For objects, arrays, etc
  if (typeof value === "object") {
    const json = verbose
      ? JSON.stringify(value, null, 2)
      : JSON.stringify(value)
    if (json.length > maxLen) {
      return `${json.slice(0, maxLen)}…`
    }
    return json
  }
  // Remaining primitives: number, boolean, bigint, symbol
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  if (typeof value === "bigint") {
    return `${value.toString()}n`
  }
  return "[unknown]"
}

/** Prints a single diff entry with colors. */
function printDiff(
  d: ReturnType<typeof diff>[number],
  { verbose = false } = {},
) {
  const pathStr = d.path.join(".")

  if (d.type === "CREATE") {
    console.log(
      chalk.green(`    + ${pathStr}: ${formatValue(d.value, { verbose })}`),
    )
  } else if (d.type === "REMOVE") {
    console.log(
      chalk.red(`    - ${pathStr}: ${formatValue(d.oldValue, { verbose })}`),
    )
  } else if (d.type === "CHANGE") {
    console.log(chalk.yellow(`    ~ ${pathStr}:`))
    if (verbose) {
      console.log(chalk.red("        OLD:"))
      console.log(
        formatValue(d.oldValue, { verbose })
          .split("\n")
          .map((line) => chalk.red(`        ${line}`))
          .join("\n"),
      )
      console.log(chalk.green("        NEW:"))
      console.log(
        formatValue(d.value, { verbose })
          .split("\n")
          .map((line) => chalk.green(`        ${line}`))
          .join("\n"),
      )
    } else {
      console.log(chalk.red(`        - ${formatValue(d.oldValue)}`))
      console.log(chalk.green(`        + ${formatValue(d.value)}`))
    }
  }
}

/** Prints a summary of changes for dry run mode. */
function printChangeSummary(changes: Changes, { verbose = false } = {}) {
  if (changes.voiceAgents.length > 0) {
    console.log(chalk.cyan("\nVoice agents to update:"))
    for (const change of changes.voiceAgents) {
      console.log(`  ${chalk.bold(change.name)} ${chalk.dim(`(${change.id})`)}`)
      for (const d of change.differences) {
        printDiff(d, { verbose })
      }
    }
  }

  if (changes.chatAgents.length > 0) {
    console.log(chalk.cyan("\nChat agents to update:"))
    for (const change of changes.chatAgents) {
      console.log(`  ${chalk.bold(change.name)} ${chalk.dim(`(${change.id})`)}`)
      for (const d of change.differences) {
        printDiff(d, { verbose })
      }
    }
  }

  if (changes.llms.length > 0) {
    console.log(chalk.cyan("\nLLMs to update:"))
    for (const change of changes.llms) {
      console.log(`  ${chalk.bold(change.name)} ${chalk.dim(`(${change.id})`)}`)
      for (const d of change.differences) {
        printDiff(d, { verbose })
      }
    }
  }

  if (changes.flows.length > 0) {
    console.log(chalk.cyan("\nFlows to update:"))
    for (const change of changes.flows) {
      console.log(`  ${chalk.bold(change.name)} ${chalk.dim(`(${change.id})`)}`)
      for (const d of change.differences) {
        printDiff(d, { verbose })
      }
    }
  }

  if (changes.testCases.length > 0) {
    console.log(chalk.cyan("\nTest cases to update:"))
    for (const change of changes.testCases) {
      console.log(`  ${chalk.bold(change.name)} ${chalk.dim(`(${change.id})`)}`)
      for (const d of change.differences) {
        printDiff(d, { verbose })
      }
    }
  }
}
