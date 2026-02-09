import { readdirSync, readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { describe, test, expect } from "bun:test"
import { z } from "zod"
import { CallSchemas, ChatSchemas, callSchemaDefaults, createCallSchemas } from "../src/index"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CALLS_DIR = join(import.meta.dirname, "fixtures", "calls")
const CHATS_DIR = join(import.meta.dirname, "fixtures", "chats")

function loadFixtures<T>(dir: string): { name: string; data: T }[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({
      name: f.replace(".json", ""),
      data: JSON.parse(readFileSync(join(dir, f), "utf-8")) as T,
    }))
}

const callFixtures = loadFixtures<Record<string, unknown>>(CALLS_DIR)
const chatFixtures = loadFixtures<Record<string, unknown>>(CHATS_DIR)

// ---------------------------------------------------------------------------
// Call fixture tests
// ---------------------------------------------------------------------------

describe("CallSchemas against real fixtures", () => {
  if (callFixtures.length === 0) {
    test.skip("no call fixtures found — run `bun scripts/pull-fixtures.ts` first", () => {})
    return
  }

  describe("base schema", () => {
    for (const { name, data } of callFixtures) {
      test(name, () => {
        const result = CallSchemas.base.safeParse(data)
        if (!result.success) {
          console.error(`base parse failed for ${name}:`, result.error.issues)
        }
        expect(result.success).toBe(true)
      })
    }
  })

  describe("ended schema", () => {
    const endedFixtures = callFixtures.filter(
      (f) => f.data.disconnection_reason != null,
    )

    for (const { name, data } of endedFixtures) {
      test(name, () => {
        const result = CallSchemas.ended.safeParse(data)
        if (!result.success) {
          console.error(`ended parse failed for ${name}:`, result.error.issues)
        }
        expect(result.success).toBe(true)

        if (result.success) {
          expect(result.data.start_timestamp).toBeInstanceOf(Date)
          expect(result.data.end_timestamp).toBeInstanceOf(Date)
          expect(typeof result.data.duration_ms).toBe("number")
          expect(
            result.data.recording_url === null ||
              typeof result.data.recording_url === "string",
          ).toBe(true)
        }
      })
    }
  })

  describe("analyzed schema", () => {
    const analyzedFixtures = callFixtures.filter(
      (f) => f.data.call_analysis != null,
    )

    for (const { name, data } of analyzedFixtures) {
      test(name, () => {
        const result = CallSchemas.analyzed.safeParse(data)
        if (!result.success) {
          console.error(
            `analyzed parse failed for ${name}:`,
            result.error.issues,
          )
        }
        expect(result.success).toBe(true)

        if (result.success) {
          const summary = result.data.call_analysis.call_summary
          expect(summary === null || typeof summary === "string").toBe(true)
          if (typeof summary === "string") {
            expect(summary.length).toBeGreaterThan(0)
          }
        }
      })
    }
  })

  describe("metadata is always an object (prefault default)", () => {
    const fixture = callFixtures[0]
    if (!fixture) return

    test("metadata is never undefined with defaults", () => {
      const result = CallSchemas.base.safeParse(fixture.data)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.metadata).toBeDefined()
        expect(typeof result.data.metadata).toBe("object")
      }
    })
  })
})

// ---------------------------------------------------------------------------
// Chat fixture tests
// ---------------------------------------------------------------------------

describe("ChatSchemas against real fixtures", () => {
  if (chatFixtures.length === 0) {
    test.skip("no chat fixtures found — run `bun scripts/pull-fixtures.ts` first", () => {})
    return
  }

  describe("base schema", () => {
    for (const { name, data } of chatFixtures) {
      test(name, () => {
        const result = ChatSchemas.base.safeParse(data)
        if (!result.success) {
          console.error(`base parse failed for ${name}:`, result.error.issues)
        }
        expect(result.success).toBe(true)
      })
    }
  })

  describe("ended schema", () => {
    const endedFixtures = chatFixtures.filter(
      (f) => f.data.start_timestamp != null,
    )

    for (const { name, data } of endedFixtures) {
      test(name, () => {
        const result = ChatSchemas.ended.safeParse(data)
        if (!result.success) {
          console.error(`ended parse failed for ${name}:`, result.error.issues)
        }
        expect(result.success).toBe(true)

        if (result.success) {
          expect(result.data.start_timestamp).toBeInstanceOf(Date)
        }
      })
    }
  })

  describe("analyzed schema", () => {
    const analyzedFixtures = chatFixtures.filter(
      (f) => f.data.chat_analysis != null,
    )

    for (const { name, data } of analyzedFixtures) {
      test(name, () => {
        const result = ChatSchemas.analyzed.safeParse(data)
        if (!result.success) {
          console.error(
            `analyzed parse failed for ${name}:`,
            result.error.issues,
          )
        }
        expect(result.success).toBe(true)

        if (result.success) {
          const summary = result.data.chat_analysis.chat_summary
          expect(summary === null || typeof summary === "string").toBe(true)
        }
      })
    }
  })
})

// ---------------------------------------------------------------------------
// Transform behavior tests (inline data, no fixtures needed)
// ---------------------------------------------------------------------------

describe("opinionated transforms", () => {
  test("empty string call_summary becomes null", () => {
    const schema = z.object({
      call_summary: z.string().min(1).nullable().catch(null),
    })
    expect(schema.parse({ call_summary: "" })).toEqual({ call_summary: null })
    expect(schema.parse({ call_summary: null })).toEqual({
      call_summary: null,
    })
    expect(schema.parse({ call_summary: "hello" })).toEqual({
      call_summary: "hello",
    })
  })

  test("invalid URL for recording_url becomes null", () => {
    const schema = z.object({
      recording_url: z.url().nullable().catch(null),
    })
    expect(schema.parse({ recording_url: "not a url" })).toEqual({
      recording_url: null,
    })
    expect(schema.parse({ recording_url: "" })).toEqual({
      recording_url: null,
    })
    expect(
      schema.parse({ recording_url: "https://example.com/recording.wav" }),
    ).toEqual({ recording_url: "https://example.com/recording.wav" })
    expect(schema.parse({ recording_url: null })).toEqual({
      recording_url: null,
    })
  })

  test("numeric timestamp is coerced to Date", () => {
    const schema = z.object({
      start_timestamp: z.coerce.date().catch(new Date(0)),
    })
    const ts = 1700000000000
    const result = schema.parse({ start_timestamp: ts })
    expect(result.start_timestamp).toBeInstanceOf(Date)
    expect(result.start_timestamp.getTime()).toBe(ts)
  })

  test("missing metadata with defaults gets {}", () => {
    const schemas = createCallSchemas(callSchemaDefaults)
    // Build a minimal valid call object without metadata
    const minimalCall = {
      call_id: "call_test",
      agent_version: 0,
      call_status: "ongoing",
      call_type: "web_call",
      access_token: "token",
    }
    const result = schemas.base.safeParse(minimalCall)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.metadata).toEqual({})
      expect(result.data.retell_llm_dynamic_variables).toEqual({})
      expect(result.data.collected_dynamic_variables).toEqual({})
    }
  })

  test("invalid phone number for from_number becomes null", () => {
    const schema = z.object({
      call_type: z.literal("phone_call"),
      from_number: z.string().regex(/^\+[1-9]\d{1,14}$/).nullable().catch(null),
      to_number: z.string().regex(/^\+[1-9]\d{1,14}$/),
      direction: z.enum(["inbound", "outbound"]),
    })
    const result = schema.parse({
      call_type: "phone_call",
      from_number: "Restricted",
      to_number: "+12025551234",
      direction: "inbound",
    })
    expect(result.from_number).toBeNull()
  })

  test("timestamp catch fallback on garbage input", () => {
    const schema = z.object({
      start_timestamp: z.coerce.date().catch(new Date(0)),
    })
    const result = schema.parse({ start_timestamp: "not-a-date" })
    expect(result.start_timestamp).toBeInstanceOf(Date)
    expect(result.start_timestamp.getTime()).toBe(0)
  })

  test("duration_ms catch fallback on missing", () => {
    const schema = z.object({
      duration_ms: z.number().catch(0),
    })
    const result = schema.parse({ duration_ms: "oops" })
    expect(result.duration_ms).toBe(0)
  })
})
