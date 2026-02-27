import { ExitPromptError } from "@inquirer/core"
import { confirm } from "@inquirer/prompts"
import { $ } from "bun"
import chalk from "chalk"
import type { Command } from "commander"
import {
  fetchAndWriteTestCases,
  getRemoteState,
  writeState,
} from "../lib/agents"
import { getRemoteComponents, writeComponents } from "../lib/components"
import { createSpinner } from "../lib/logger"
import { resolveAgentIds, resolveComponentIds } from "../lib/sync-config"
import { DEFAULT_AGENTS_DIR, pluralize } from "../lib/utils"

type GlobalOpts = {
  agentsDir?: string
  componentsDir?: string
}

export async function pullCommand(
  agentIdArgs: string[],
  opts: {
    all?: boolean
    select?: boolean
    yes?: boolean
    version?: string
    tests?: boolean
  },
  cmd: Command,
) {
  const globalOpts = cmd.optsWithGlobals<GlobalOpts>()

  // Parse and validate version option
  let version: number | undefined
  if (opts.version != null) {
    version = parseInt(opts.version, 10)
    if (Number.isNaN(version) || version < 0) {
      console.log(chalk.red("Error: --version must be a non-negative integer"))
      process.exitCode = 1
      return
    }
  }

  // Version flag requires specific agent IDs
  if (version != null && opts.all) {
    console.log(
      chalk.red(
        "Error: --version cannot be used with --all (must specify agent IDs)",
      ),
    )
    process.exitCode = 1
    return
  }

  try {
    const agentIds = await resolveAgentIds(agentIdArgs, {
      all: opts.all,
      select: opts.select,
    })

    // Version flag requires specific agent IDs
    if (version != null && !agentIds) {
      console.log(chalk.red("Error: --version requires specific agent IDs"))
      process.exitCode = 1
      return
    }

    const componentIds = await resolveComponentIds({
      all: opts.all,
      select: opts.select,
    })

    await pull({
      agentsDir: globalOpts.agentsDir,
      agentIds,
      yes: opts.yes,
      version,
      tests: opts.tests ?? true,
      componentsDir: globalOpts.componentsDir,
      componentIds,
    })
  } catch (err) {
    if (err instanceof ExitPromptError) {
      console.log(chalk.dim("Aborted"))
      return
    }
    throw err
  }
}

/**
 * Fetches state from Retell API and writes files to disk. Pulls draft (latest)
 * state by default, or a specific version if specified.
 */
export async function pull({
  agentsDir = DEFAULT_AGENTS_DIR,
  agentIds = null,
  yes = false,
  version,
  tests = true,
  componentsDir,
  componentIds,
}: {
  agentsDir?: string
  /** If null, pulls all agents. If array, pulls only those agent IDs. */
  agentIds?: string[] | null
  yes?: boolean
  /** If specified, pulls this specific version instead of the latest draft. */
  version?: number
  /** If true (default), also fetches and writes test case definitions. */
  tests?: boolean
  componentsDir?: string
  /** If undefined, skip component sync. If null, pull all. If array, filter. */
  componentIds?: string[] | null | undefined
} = {}) {
  const scopeLabel = agentIds ? `${agentIds.length} agent(s)` : "all agents"
  const versionLabel = version != null ? ` (version ${version})` : ""
  console.log(chalk.bold(`Pulling ${scopeLabel}${versionLabel} from Retell...`))

  // Check for uncommitted changes
  if (!yes) {
    const { stdout } = await $`git status --porcelain -- ${agentsDir}`
      .nothrow()
      .quiet()
    const hasChanges = stdout.toString().trim().length > 0

    if (hasChanges) {
      console.log(chalk.yellow("Warning: You have uncommitted changes:"))
      console.log(chalk.dim(stdout.toString()))

      const proceed = await confirm({
        message: "Pull will overwrite these files. Continue?",
        default: false,
      })

      if (!proceed) {
        throw new ExitPromptError()
      }
    }
  }

  const spinner = createSpinner("Fetching from Retell API...")
  const remoteState = await getRemoteState({ draft: true, agentIds, version })
  const totalAgents =
    remoteState.voiceAgents.length + remoteState.chatAgents.length
  spinner.stop(
    chalk.dim(
      `${pluralize("agent", totalAgents, true)} (${remoteState.voiceAgents.length} voice, ${remoteState.chatAgents.length} chat), ${pluralize("LLM", remoteState.llms.length, true)}, ${pluralize("flow", remoteState.conversationFlows.length, true)}`,
    ),
  )

  const writeSpinner = createSpinner("Writing files...")
  await writeState(remoteState, { agentsDir, agentIds })
  writeSpinner.stop(chalk.green("Done"))

  // Fetch and write test cases if requested
  if (tests) {
    const testSpinner = createSpinner("Fetching test cases...")
    const testResults = await fetchAndWriteTestCases({
      state: remoteState,
      agentsDir,
    })
    const totalTests = testResults.reduce((sum, r) => sum + r.testCount, 0)
    const agentsWithTests = testResults.filter((r) => r.testCount > 0).length
    testSpinner.stop(
      chalk.dim(
        `${pluralize("test case", totalTests, true)} across ${pluralize("agent", agentsWithTests, true)}`,
      ),
    )
  }

  // Pull shared components if configured
  if (componentIds !== undefined) {
    const compSpinner = createSpinner("Fetching shared components...")
    const remoteComponents = await getRemoteComponents({ componentIds })
    compSpinner.stop(
      chalk.dim(pluralize("component", remoteComponents.length, true)),
    )

    const compWriteSpinner = createSpinner("Writing component files...")
    await writeComponents(remoteComponents, { componentsDir, componentIds })
    compWriteSpinner.stop(chalk.green("Done"))
  }

  console.log(
    chalk.dim(
      `Files written to ${chalk.bold(agentsDir)}. Review with git diff.`,
    ),
  )
}
