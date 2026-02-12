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

/**
 * Simple English pluralizer. Handles common suffix rules (-y -> -ies, add -s).
 * Optionally prefixes the quantity.
 */
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

/**
 * Recursively searches through an object/array structure and replaces `file://`
 * placeholders with resolved file contents. Mutates the structure in place.
 *
 * @param resolveFileContent Called with the relative file path (after stripping
 *   the `file://` prefix) and should return the raw file content.
 * @param transformContent Optional post-processor applied to each resolved
 *   file's content before it replaces the placeholder (e.g. strip YAML
 *   frontmatter from markdown).
 */
export async function resolveFilePlaceholders(
  value: unknown,
  resolveFileContent: (filePath: string) => string | Promise<string>,
  transformContent?: (content: string) => string | Promise<string>,
): Promise<void> {
  const resolveValue = async (val: unknown) => {
    if (typeof val !== "string" || !val.startsWith("file://")) return undefined
    const filePath = val.slice(7) // strip "file://"
    const content = await resolveFileContent(filePath)
    return transformContent ? transformContent(content) : content
  }

  if (Array.isArray(value)) {
    await Promise.all(
      value.map(async (item, i) => {
        const resolved = await resolveValue(item)
        if (resolved) value[i] = resolved
        await resolveFilePlaceholders(
          item,
          resolveFileContent,
          transformContent,
        )
      }),
    )
  } else if (value != null && typeof value === "object") {
    const record = value as Record<string, unknown>
    await Promise.all(
      Object.entries(record).map(async ([key, propValue]) => {
        const resolved = await resolveValue(propValue)
        if (resolved) record[key] = resolved
        await resolveFilePlaceholders(
          propValue,
          resolveFileContent,
          transformContent,
        )
      }),
    )
  }
}
