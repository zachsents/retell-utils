import fs from "node:fs/promises"
import path from "node:path"
import { ConversationFlowComponentResponseSchema, toSnakeCase } from "@core"
import type { Except } from "type-fest"
import z from "zod"
import { retellFetch } from "./agents"
import { extractNodePrompts, extractPositions } from "./flow-helpers"
import {
  FILE_HASH_LENGTH,
  readJson,
  readYaml,
  resolveFilePlaceholders,
  writeJson,
  writeYaml,
} from "./utils"

export const DEFAULT_COMPONENTS_DIR = "./components"

type ComponentResponse = z.infer<typeof ConversationFlowComponentResponseSchema>

export type CanonicalComponent = Except<
  ComponentResponse,
  "conversation_flow_component_id" | "user_modified_timestamp"
> & { _id: string; _timestamp: number }

/** Builds a directory name for a component (e.g. `customer_info_abc123`). */
export function getComponentDirName(component: {
  _id: string
  name?: string | null
}) {
  const label = component.name ?? component._id
  return `${toSnakeCase(label)}_${component._id.slice(-FILE_HASH_LENGTH)}`
}

/**
 * Fetches all shared components from the Retell API. Optionally filters to a
 * set of IDs. Returns canonicalized form.
 */
export async function getRemoteComponents({
  componentIds = null,
}: {
  componentIds?: string[] | null
} = {}): Promise<CanonicalComponent[]> {
  const all = z
    .array(ConversationFlowComponentResponseSchema)
    .parse(await retellFetch("/list-conversation-flow-components"))

  const filtered = componentIds
    ? all.filter((c) => componentIds.includes(c.conversation_flow_component_id))
    : all

  return filtered.map(
    ({ conversation_flow_component_id, user_modified_timestamp, ...rest }) => ({
      ...rest,
      _id: conversation_flow_component_id,
      _timestamp: user_modified_timestamp,
    }),
  )
}

/** Reads all component directories and returns canonicalized state. */
export async function getLocalComponents({
  componentsDir = DEFAULT_COMPONENTS_DIR,
  componentIds = null,
}: {
  componentsDir?: string
  componentIds?: string[] | null
} = {}): Promise<CanonicalComponent[]> {
  const dirExists = await fs
    .stat(componentsDir)
    .then((s) => s.isDirectory())
    .catch(() => false)
  if (!dirExists) return []

  const componentIdSet = componentIds ? new Set(componentIds) : null
  const components: CanonicalComponent[] = []

  const glob = new Bun.Glob("*/.component.json")
  for await (const metaPath of glob.scan(componentsDir)) {
    const metaContent = await Bun.file(
      path.join(componentsDir, metaPath),
    ).text()
    const meta = readJson(
      metaContent,
      z.object({
        id: z.string(),
        linked_flow_ids: z.array(z.string()).optional(),
      }),
    )

    if (componentIdSet && !componentIdSet.has(meta.id)) continue

    const dirName = path.dirname(metaPath)
    const dirFull = path.join(componentsDir, dirName)

    const configContent = await Bun.file(
      path.join(dirFull, "config.yaml"),
    ).text()
    const config = readYaml(configContent, z.looseObject({}))

    const resolveFileContent = (filePath: string) => {
      const normalizedPath = filePath.replace(/^\.\//, "")
      const fullPath = path.join(dirFull, normalizedPath)
      return Bun.file(fullPath).text()
    }
    await resolveFilePlaceholders(config, resolveFileContent)

    // Merge positions back
    const positionsPath = path.join(dirFull, ".positions.json")
    const positionsFile = Bun.file(positionsPath)
    if (await positionsFile.exists()) {
      const positions = readJson(await positionsFile.text(), z.looseObject({}))
      if (positions.begin_tag)
        config.begin_tag_display_position = positions.begin_tag
      if (positions.nodes && Array.isArray(config.nodes)) {
        const nodePositions = positions.nodes as Record<
          string,
          { x: number; y: number }
        >
        for (const node of config.nodes as Array<Record<string, unknown>>) {
          if (node.id && nodePositions[node.id as string])
            node.display_position = nodePositions[node.id as string]
        }
      }
    }

    components.push({
      ...config,
      _id: meta.id,
      _timestamp: 0,
    } as CanonicalComponent)
  }

  return components
}

/**
 * Converts canonical components to a file map (path -> content). Extracts node
 * prompts into markdown files and positions into a dotfile.
 */
export async function serializeComponents(
  components: CanonicalComponent[],
  { componentsDir = DEFAULT_COMPONENTS_DIR }: { componentsDir?: string } = {},
): Promise<Record<string, string>> {
  const files: Record<string, string> = {}

  for (const component of components) {
    const dirName = getComponentDirName(component)
    const dirPath = path.join(componentsDir, dirName)

    const { _id, _timestamp, linked_conversation_flow_ids, ...config } =
      component

    // .component.json -- immutable metadata
    files[path.join(dirPath, ".component.json")] = await writeJson({
      id: _id,
      ...(linked_conversation_flow_ids?.length && {
        linked_flow_ids: linked_conversation_flow_ids,
      }),
    })

    // Extract node prompts to markdown files
    if (config.nodes) {
      await extractNodePrompts(config.nodes, dirPath, files)
    }

    // Extract positions to dotfile
    await extractPositions(config, dirPath, files)

    // config.yaml -- everything else
    files[path.join(dirPath, "config.yaml")] = await writeYaml(config)
  }

  return files
}

/**
 * Writes component files to disk and cleans up removed component directories.
 * When componentIds is provided, only manages directories for those IDs.
 */
export async function writeComponents(
  components: CanonicalComponent[],
  {
    componentsDir = DEFAULT_COMPONENTS_DIR,
    componentIds = null,
  }: {
    componentsDir?: string
    componentIds?: string[] | null
  } = {},
) {
  const files = await serializeComponents(components, { componentsDir })

  const writtenFiles = new Set<string>()

  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.resolve(filePath)
    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await Bun.write(fullPath, content)
    writtenFiles.add(path.relative(componentsDir, filePath))
  }

  const writtenDirs = new Set(
    [...writtenFiles].map((f) => f.split(path.sep)[0]).filter(Boolean),
  )

  const managedIds = componentIds ? new Set(componentIds) : null

  const dirExists = await fs
    .stat(componentsDir)
    .then((s) => s.isDirectory())
    .catch(() => false)
  if (!dirExists) return

  const existingDirs = await fs.readdir(componentsDir, { withFileTypes: true })

  for (const dirent of existingDirs) {
    if (!dirent.isDirectory()) continue

    const dirName = dirent.name
    const dirPath = path.join(componentsDir, dirName)

    if (managedIds) {
      const metaPath = path.join(dirPath, ".component.json")
      const metaFile = Bun.file(metaPath)
      if (await metaFile.exists()) {
        const meta = z
          .object({ id: z.string() })
          .safeParse(JSON.parse(await metaFile.text()))
        if (!meta.success || !managedIds.has(meta.data.id)) continue
      }
    }

    if (!writtenDirs.has(dirName)) {
      await fs.rm(dirPath, { recursive: true })
    } else {
      const existingFiles = await listFilesRecursive(dirPath)
      for (const existingFile of existingFiles) {
        const relativePath = path.join(dirName, existingFile)
        if (!writtenFiles.has(relativePath)) {
          await fs.rm(path.join(dirPath, existingFile))
        }
      }
    }
  }
}

async function listFilesRecursive(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subFiles = await listFilesRecursive(path.join(dir, entry.name))
      files.push(...subFiles.map((f) => path.join(entry.name, f)))
    } else {
      files.push(entry.name)
    }
  }

  return files
}
