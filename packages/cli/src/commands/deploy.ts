import { ExitPromptError } from "@inquirer/core"
import chalk from "chalk"
import type { Command } from "commander"
import diff from "microdiff"
import path from "node:path"
import * as R from "remeda"
import {
  type CanonicalTestCase,
  canonicalizeTestCases,
  findAffectedAgentIds,
  getAgentDirName,
  getLocalState,
  getLocalTestCases,
  getRemoteState,
  getTestCaseDefinitions,
  normalizeResponseEngine,
  retellFetch,
  updateTestCaseDefinition,
} from "../lib/agents"
import {
  type Changes,
  type ComponentChange,
  type TestCaseChange,
  computeChanges,
  computeComponentChanges,
} from "../lib/changes"
import { getLocalComponents, getRemoteComponents } from "../lib/components"
import * as logger from "../lib/logger"
import { resolveAgentIds, resolveComponentIds } from "../lib/sync-config"
import { DEFAULT_AGENTS_DIR, pluralize } from "../lib/utils"
import { pull } from "./pull"

type GlobalOpts = {
  agentsDir?: string
  componentsDir?: string
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

    const componentIds = await resolveComponentIds({
      all: opts.all,
      select: opts.select,
    })

    const affectedIds = await deploy({
      agentsDir: globalOpts.agentsDir,
      agentIds,
      dryRun: opts.dryRun,
      verbose: opts.verbose,
      componentsDir: globalOpts.componentsDir,
      componentIds,
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
  agentIds = null,
  dryRun = false,
  verbose = false,
  componentsDir,
  componentIds,
}: {
  agentsDir?: string
  /** If null, deploys all agents. If array, deploys only those agent IDs. */
  agentIds?: string[] | null
  dryRun?: boolean
  verbose?: boolean
  componentsDir?: string
  /** If undefined, skip component sync. If null, deploy all. If array, filter. */
  componentIds?: string[] | null | undefined
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

    const agentDirPath = path.join(agentsDir, getAgentDirName(agent))

    // Read local test cases
    const localTestCases = await getLocalTestCases(agentDirPath)
    if (localTestCases.length === 0) continue

    // Fetch remote test cases
    const engine = normalizeResponseEngine(agent.response_engine)
    if (!engine) continue

    let remoteTestCases: CanonicalTestCase[] = []
    try {
      const rawRemote = await getTestCaseDefinitions(engine)
      remoteTestCases = canonicalizeTestCases(rawRemote)
    } catch (err) {
      logger.warn(
        `Could not fetch remote test cases: ${err instanceof Error ? err.message : String(err)}`,
      )
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

  // Step 2c: Compute component diffs
  let componentChanges: ComponentChange[] = []
  if (componentIds !== undefined) {
    const [localComponents, remoteComponents] = await Promise.all([
      getLocalComponents({ componentsDir, componentIds }),
      getRemoteComponents({ componentIds }),
    ])
    componentChanges = computeComponentChanges(
      localComponents,
      remoteComponents,
    )
  }

  const changes: Changes = {
    ...baseChanges,
    testCases: testCaseChanges,
    components: componentChanges,
  }
  const totalAgentChanges =
    changes.voiceAgents.length + changes.chatAgents.length
  spinner.stop(
    chalk.dim(
      `Found ${chalk.white(totalAgentChanges)} agent, ${chalk.white(changes.llms.length)} LLM, ${chalk.white(changes.flows.length)} flow, ${chalk.white(changes.testCases.length)} test case, ${chalk.white(changes.components.length)} component changes`,
    ),
  )

  const totalChanges =
    totalAgentChanges +
    changes.llms.length +
    changes.flows.length +
    changes.testCases.length +
    changes.components.length

  // Collect affected agent IDs (agents with direct changes + agents whose LLMs/flows changed)
  const affectedAgentIds = findAffectedAgentIds(changes, localState)

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

  const updateResults = await Promise.allSettled([
    // Voice agent updates
    ...changes.voiceAgents.map(async (change) => {
      const { _id, _version, response_engine, ...baseData } = change.current
      const updateData =
        response_engine.type === "custom-llm"
          ? { ...baseData, response_engine }
          : baseData
      await retellFetch(`/update-agent/${_id}`, {
        method: "PATCH",
        body: JSON.stringify(updateData),
      })
      return { type: "voice agent" as const, id: _id, name: change.name }
    }),
    // Chat agent updates
    ...changes.chatAgents.map(async (change) => {
      const { _id, _version, response_engine, ...baseData } = change.current
      const updateData =
        response_engine.type === "custom-llm"
          ? { ...baseData, response_engine }
          : baseData
      await retellFetch(`/update-chat-agent/${_id}`, {
        method: "PATCH",
        body: JSON.stringify(updateData),
      })
      return { type: "chat agent" as const, id: _id, name: change.name }
    }),
    // LLM updates
    ...changes.llms.map(async (change) => {
      const { _id, _version, ...updateData } = change.current
      await retellFetch(`/update-retell-llm/${_id}`, {
        method: "PATCH",
        body: JSON.stringify(updateData),
      })
      return { type: "llm" as const, id: _id, name: change.name }
    }),
    // Flow updates
    ...changes.flows.map(async (change) => {
      const { _id, _version, ...updateData } = change.current
      await retellFetch(`/update-conversation-flow/${_id}`, {
        method: "PATCH",
        body: JSON.stringify(updateData),
      })
      return { type: "flow" as const, id: _id, name: change.name }
    }),
    // Test case updates
    ...changes.testCases.map(async (change) => {
      const { _id, ...updateData } = change.current
      await updateTestCaseDefinition(_id, updateData)
      return { type: "test case" as const, id: _id, name: change.name }
    }),
    // Component updates
    ...changes.components.map(async (change) => {
      const {
        _id,
        _timestamp,
        linked_conversation_flow_ids: _linkedFlows,
        ...updateData
      } = change.current
      await retellFetch(`/update-conversation-flow-component/${_id}`, {
        method: "PATCH",
        body: JSON.stringify(updateData),
      })
      return { type: "component" as const, id: _id, name: change.name }
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
    await pull({ agentsDir, agentIds, componentsDir, componentIds })
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

  if (changes.components.length > 0) {
    console.log(chalk.cyan("\nShared components to update:"))
    for (const change of changes.components) {
      console.log(`  ${chalk.bold(change.name)} ${chalk.dim(`(${change.id})`)}`)
      for (const d of change.differences) {
        printDiff(d, { verbose })
      }
    }
  }
}
