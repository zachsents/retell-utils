/**
 * One-shot script to pull real call/chat data from the Retell API and save as
 * JSON fixtures for schema tests.
 *
 * Usage: bun scripts/pull-fixtures.ts
 */

import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const API_KEY = "key_12a24954adfaf146f4a3cd6616a3"
const BASE_URL = "https://api.retellai.com/v2"

const CALL_AGENTS = [
  "agent_5c99a93f3b252cfad546c78db2", // Tier 1 Base
  "agent_9016e2c142d7485c5e3de2239c", // Tier 2 Base
]
const CHAT_AGENT = "agent_a1c4931d36746b1108892fafd6" // Tier 2 Chat

const PER_AGENT = 67
const CALLS_DIR = join(import.meta.dirname, "..", "test", "fixtures", "calls")
const CHATS_DIR = join(import.meta.dirname, "..", "test", "fixtures", "chats")

interface RetellCall {
  call_id: string
  [key: string]: unknown
}

interface RetellChat {
  chat_id: string
  [key: string]: unknown
}

async function fetchCalls(agentId: string, limit: number) {
  const res = await fetch(`${BASE_URL}/list-calls`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filter_criteria: { agent_id: [agentId] },
      sort_order: "descending",
      limit,
    }),
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch calls for ${agentId}: ${res.status} ${await res.text()}`)
  }

  return (await res.json()) as RetellCall[]
}

async function fetchChats(limit: number) {
  const params = new URLSearchParams({
    sort_order: "descending",
    limit: String(limit),
  })

  const res = await fetch(`https://api.retellai.com/list-chat?${params}`, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
    },
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch chats: ${res.status} ${await res.text()}`)
  }

  return (await res.json()) as RetellChat[]
}

function writeFixtures(dir: string, items: { id: string; data: unknown }[]) {
  mkdirSync(dir, { recursive: true })
  for (const item of items) {
    const path = join(dir, `${item.id}.json`)
    writeFileSync(path, JSON.stringify(item.data, null, 2))
  }
}

async function main() {
  console.log("Pulling call fixtures...")

  const allCalls: RetellCall[] = []
  for (const agentId of CALL_AGENTS) {
    console.log(`  Fetching up to ${PER_AGENT} calls from ${agentId}...`)
    const calls = await fetchCalls(agentId, PER_AGENT)
    console.log(`    Got ${calls.length} calls`)
    allCalls.push(...calls)
  }

  writeFixtures(
    CALLS_DIR,
    allCalls.map((c) => ({ id: c.call_id, data: c })),
  )
  console.log(`Wrote ${allCalls.length} call fixtures to ${CALLS_DIR}`)

  console.log("\nPulling chat fixtures...")
  console.log(`  Fetching up to ${PER_AGENT} chats...`)
  const chats = await fetchChats(PER_AGENT)
  console.log(`    Got ${chats.length} chats`)

  writeFixtures(
    CHATS_DIR,
    chats.map((c) => ({ id: c.chat_id, data: c })),
  )
  console.log(`Wrote ${chats.length} chat fixtures to ${CHATS_DIR}`)

  console.log(`\nDone! Total: ${allCalls.length} calls + ${chats.length} chats`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
