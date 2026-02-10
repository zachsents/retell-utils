import boxen from "boxen"
import * as R from "remeda"
import type { Promisable } from "type-fest"
import YAML from "yaml"
import z, { type ZodType } from "zod"
import { formatWithPrettier } from "./prettier"

export const DEFAULT_AGENTS_DIR = "./agents"
export const FILE_HASH_LENGTH = 6
export const CONFIG_FORMATS = ["yaml", "yml", "json", "jsonc"] as const
export type ConfigFormat = (typeof CONFIG_FORMATS)[number]
export const DEFAULT_CONFIG_FORMAT: ConfigFormat = "yaml"

export function pluralize(word: string, q: number, includeQuantity = false) {
  let pluralWord = word
  if (q !== 1) {
    if (word.endsWith("y") && !/[aeiou]y$/i.test(word)) {
      pluralWord = `${word.slice(0, -1)}ies`
    } else if (!word.endsWith("s")) {
      pluralWord = `${word}s`
    }
  }
  const quantity = includeQuantity ? `${q} ` : ""
  return `${quantity}${pluralWord}`
}

/** Converts a string to snake_case, stripping non-alphanumeric characters. */
export function toSnakeCase(str: string) {
  return str
    .replace(/\s+/g, "_")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-z0-9_]/gi, "")
    .toLowerCase()
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
}

/** Parses markdown content with optional YAML frontmatter. */
export async function readMarkdown(content: string) {
  const trimmed = content.trim()

  // No frontmatter - return content as body
  if (!trimmed.startsWith("---")) {
    return {
      frontmatter: {},
      body: await formatWithPrettier(trimmed, { parser: "markdown" }),
    }
  }

  const [, frontmatter, ...rest] = trimmed.split("---")
  const body = rest.join("---").trim()

  return {
    frontmatter: z
      .looseObject({})
      .catch({})
      .parse(Bun.YAML.parse(frontmatter ?? "")),
    body: await formatWithPrettier(body, { parser: "markdown" }),
  }
}

/**
 * Formats markdown content with optional YAML frontmatter. Skips frontmatter if
 * empty. The body is auto-formatted with prettier.
 */
export async function writeMarkdown(
  body: string,
  frontmatter: Record<string, unknown> = {},
) {
  const formattedBody = await formatWithPrettier(body, { parser: "markdown" })
  const hasFrontmatter = Object.keys(frontmatter).length > 0

  if (!hasFrontmatter) {
    return formattedBody.trim()
  }

  const yamlStr = YAML.stringify(frontmatter, {
    doubleQuotedMinMultiLineLength: 40,
  }).trim()

  return `
---
${yamlStr}
---

${formattedBody}
`.trim()
}

/** Parses a JSON string, optionally validating against a Zod schema. */
export function readJson(content: string): unknown
export function readJson<T extends ZodType>(
  content: string,
  schema: T,
): z.infer<T>
export function readJson(content: string, schema?: ZodType) {
  const parsed = JSON.parse(content)
  if (schema) {
    return schema.parse(parsed)
  }
  return parsed
}

/** Strips single-line // comments from JSONC content. */
function stripJsoncComments(content: string): string {
  return content
    .split("\n")
    .map((line) => {
      // Find // that's not inside a string
      let inString = false
      let escaped = false
      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (escaped) {
          escaped = false
          continue
        }
        if (char === "\\") {
          escaped = true
          continue
        }
        if (char === '"') {
          inString = !inString
          continue
        }
        if (!inString && char === "/" && line[i + 1] === "/") {
          return line.slice(0, i).trimEnd()
        }
      }
      return line
    })
    .join("\n")
}

/** Parses a JSONC string, optionally validating against a Zod schema. */
export function readJsonc(content: string): unknown
export function readJsonc<T extends ZodType>(
  content: string,
  schema: T,
): z.infer<T>
export function readJsonc(content: string, schema?: ZodType) {
  const stripped = stripJsoncComments(content)
  return readJson(stripped, schema as ZodType)
}

export async function writeJson(obj: unknown) {
  return formatWithPrettier(JSON.stringify(obj), { parser: "json" })
}

/**
 * Writes an object as JSONC (JSON with Comments). Adds documentation comments
 * before each top-level key.
 */
export async function writeJsonc(
  obj: unknown,
  { comments = {} }: { comments?: Record<string, string> } = {},
) {
  // First format as regular JSON to get proper structure
  const json = await formatWithPrettier(JSON.stringify(obj), {
    parser: "json",
  })

  // If no comments, just return JSON (but with .jsonc extension it's still valid)
  if (Object.keys(comments).length === 0) {
    return json
  }

  // Add comments before top-level keys
  const lines = json.split("\n")
  const result: string[] = []
  let isFirstKey = true

  for (const line of lines) {
    // Match top-level key (2-space indent, starts with ")
    const keyMatch = line.match(/^ {2}"([^"]+)":\s*/)
    if (keyMatch?.[1]) {
      const key = keyMatch[1]
      const comment = comments[key]
      if (comment) {
        // Add blank line before comment (except first key)
        if (!isFirstKey) {
          result.push("")
        }
        result.push(`  // ${comment}`)
      }
      isFirstKey = false
    }
    result.push(line)
  }

  return result.join("\n")
}

/** Parses a YAML string, optionally validating against a Zod schema. */
export function readYaml(content: string): unknown
export function readYaml<T extends ZodType>(
  content: string,
  schema: T,
): z.infer<T>
export function readYaml(content: string, schema?: ZodType) {
  const parsed = YAML.parse(content)
  if (schema) {
    return schema.parse(parsed)
  }
  return parsed
}

export async function writeYaml(
  obj: unknown,
  { comments = {} }: { comments?: Record<string, string> } = {},
) {
  return formatWithPrettier(YAML.stringify(obj), {
    parser: "yaml",
    yamlComments: comments,
  })
}

/**
 * Recursively searches through an object/array structure and replaces file://
 * placeholders with file contents, extracting markdown frontmatter. Mutates the
 * structure in place.
 */
export async function resolveFilePlaceholders(
  value: unknown,
  resolveFileContent: (
    /** File path relative to the current agent directory */
    filePath: string,
  ) => Promisable<string>,
): Promise<void> {
  const resolveValue = async (value: unknown) => {
    const result = z
      .string()
      .startsWith("file://")
      .transform((f) => f.replace("file://", ""))
      .safeParse(value)
    if (!result.success) return undefined
    const content = await resolveFileContent(result.data)
    const { body } = await readMarkdown(content)
    return body
  }

  if (Array.isArray(value)) {
    await Promise.all(
      value.map(async (item, i) => {
        const resolved = await resolveValue(item)
        if (resolved) value[i] = resolved
        await resolveFilePlaceholders(item, resolveFileContent)
      }),
    )
  } else if (R.isPlainObject(value)) {
    await Promise.all(
      Object.entries(value).map(async ([key, propValue]) => {
        const resolved = await resolveValue(propValue)
        if (resolved) value[key] = resolved
        await resolveFilePlaceholders(propValue, resolveFileContent)
      }),
    )
  }
}

/**
 * Creates an ASCII flow visualization showing previous -> current -> next
 * nodes.
 */
export function createFlowVisualization(
  current: string,
  previous: string[],
  next: string[],
): string {
  // Box height ensures arrows never connect to top/bottom borders
  const maxArrows = Math.max(previous.length, next.length)
  const totalLines = Math.max(3, maxArrows + 2)

  const box = boxen(current, {
    padding: { left: 2, right: 2 },
    borderStyle: "round",
    height: totalLines,
  })
  const boxLines = box.split("\n")
  const boxWidth = boxLines[0]!.length

  // Pad previous/next arrays to center them vertically
  const padPrev = Math.floor((totalLines - previous.length) / 2)
  const padNext = Math.floor((totalLines - next.length) / 2)

  // Find max width of previous labels for alignment
  const prevWidth = Math.max(0, ...previous.map((p) => p.length))

  const lines: string[] = []
  for (let i = 0; i < totalLines; i++) {
    // Previous column
    const prevIdx = i - padPrev
    const prevLabel =
      prevIdx >= 0 && prevIdx < previous.length ? previous[prevIdx]! : ""
    const prevPadded = prevLabel.padStart(prevWidth)
    const prevArrow = prevLabel ? " ─→ " : "    "

    // Box column (box height matches totalLines exactly)
    const boxLine = boxLines[i] ?? ""
    const boxPadded = boxLine.padEnd(boxWidth)

    // Next column
    const nextIdx = i - padNext
    const nextLabel = nextIdx >= 0 && nextIdx < next.length ? next[nextIdx] : ""
    const nextArrow = nextLabel ? " ─→ " : "    "

    lines.push(`${prevPadded}${prevArrow}${boxPadded}${nextArrow}${nextLabel}`)
  }

  return lines.join("\n")
}
