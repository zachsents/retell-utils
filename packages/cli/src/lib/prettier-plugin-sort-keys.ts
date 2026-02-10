import YAML from "yaml"

/** Sorts object keys alphabetically. */
function sortObjectKeys(obj: unknown, recursive: boolean): unknown {
  if (Array.isArray(obj)) {
    return recursive ? obj.map((item) => sortObjectKeys(item, recursive)) : obj
  }

  if (obj !== null && typeof obj === "object") {
    const sorted: Record<string, unknown> = {}
    const keys = Object.keys(obj).sort()

    for (const key of keys) {
      const value = (obj as Record<string, unknown>)[key]
      sorted[key] = recursive ? sortObjectKeys(value, recursive) : value
    }

    return sorted
  }

  return obj
}

/** Sorts keys in JSON content. */
export function sortJsonKeys(
  content: string,
  { recursive = false } = {},
): string {
  const parsed = JSON.parse(content)
  const sorted = sortObjectKeys(parsed, recursive)
  return JSON.stringify(sorted)
}

/** Sorts keys in YAML content, optionally adding comments for top-level keys. */
export function sortYamlKeys(
  content: string,
  {
    recursive = false,
    comments = {},
  }: {
    recursive?: boolean
    comments?: Record<string, string>
  } = {},
): string {
  const parsed = YAML.parse(content)
  const sorted = sortObjectKeys(parsed, recursive)

  // Create a document so we can add comments
  const doc = new YAML.Document(sorted)

  // Add comments to top-level keys
  if (doc.contents && YAML.isMap(doc.contents)) {
    let isFirst = true
    for (const item of doc.contents.items) {
      if (YAML.isScalar(item.key) && typeof item.key.value === "string") {
        const comment = comments[item.key.value]
        if (comment) {
          item.key.commentBefore = ` ${comment}`
          // Add blank line before comments (except the first)
          if (!isFirst) {
            item.key.spaceBefore = true
          }
        }
      }
      isFirst = false
    }
  }

  return doc.toString()
}
