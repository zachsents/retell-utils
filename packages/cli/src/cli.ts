#!/usr/bin/env bun

import { Command } from "commander"
import { deployCommand } from "./commands/deploy"
import { publishCommand } from "./commands/publish"
import { pullCommand } from "./commands/pull"
import { DEFAULT_AGENTS_DIR } from "./lib/utils.js"

const program = new Command()

program
  .name("retell")
  .description("Retell AI agent management CLI")
  .option(
    "-w, --agents-dir <dir>",
    "Directory for agent files",
    DEFAULT_AGENTS_DIR,
  )

program
  .command("pull [agentIds...]")
  .description(
    "Pull agents from Retell API (pulls latest draft state by default)",
  )
  .option("-a, --all", "Pull all agents in the account")
  .option("-s, --select", "Force interactive agent selection")
  .option("-y, --yes", "Skip confirmation prompts")
  .option(
    "-v, --version <number>",
    "Pull a specific version (requires agent IDs)",
  )
  .option("--no-tests", "Skip pulling test case definitions")
  .action(pullCommand)

program
  .command("deploy [agentIds...]")
  .description("Deploy local changes to Retell draft")
  .option("-a, --all", "Deploy all agents in the account")
  .option("-s, --select", "Force interactive agent selection")
  .option("-n, --dry-run", "Show changes without applying")
  .option("-v, --verbose", "Show full diff details (use with --dry-run)")
  .option("-q, --quiet", "Output only affected agent IDs (for piping)")
  .action(deployCommand)

program
  .command("publish [agentIds...]")
  .description("Publish agents with unpublished draft changes")
  .option("-a, --all", "Publish all agents in the account")
  .option("-s, --select", "Force interactive agent selection")
  .option("-n, --dry-run", "Show what would be published without publishing")
  .option("-q, --quiet", "Output only published agent IDs (for piping)")
  .action(publishCommand)

program.parse()
