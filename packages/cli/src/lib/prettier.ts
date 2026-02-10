import prettier from "prettier"
import { sortJsonKeys, sortYamlKeys } from "./prettier-plugin-sort-keys"

let resolvedConfig: prettier.Options | null | undefined

const defaultPrettierConfig: prettier.Options = {
  tabWidth: 2,
  useTabs: false,
}

export type FormatOptions = prettier.Options & {
  sortKeys?: boolean
  sortKeysRecursive?: boolean
  /** Comments to add to top-level YAML keys (key -> comment). */
  yamlComments?: Record<string, string>
}

export async function formatWithPrettier(
  content: string,
  opts?: FormatOptions,
) {
  if (resolvedConfig === undefined) {
    resolvedConfig = await prettier.resolveConfig(process.cwd())
  }

  const {
    sortKeys = true,
    sortKeysRecursive = false,
    yamlComments = {},
    ...prettierOpts
  } = opts ?? {}

  let processed = content

  // Sort keys before formatting (for JSON and YAML)
  if (sortKeys && prettierOpts.parser) {
    if (prettierOpts.parser === "json") {
      processed = sortJsonKeys(content, { recursive: sortKeysRecursive })
    } else if (prettierOpts.parser === "yaml") {
      processed = sortYamlKeys(content, {
        recursive: sortKeysRecursive,
        comments: yamlComments,
      })
    }
  }

  return prettier.format(processed, {
    ...defaultPrettierConfig,
    ...resolvedConfig,
    ...prettierOpts,
  })
}
