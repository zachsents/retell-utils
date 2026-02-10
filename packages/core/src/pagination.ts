/**
 * Fetches all pages from a paginated Retell API list endpoint. The Retell API
 * uses cursor-based pagination where the last item's ID and version are passed
 * as the cursor for the next page.
 */
export async function retellPagination<T>(
  /** The list API call, receiving pagination options. */
  op: (opts: {
    limit?: number
    pagination_key?: string
    pagination_key_version?: number
  }) => Promise<T[]>,
  /** The property name used as the pagination key (e.g. "agent_id", "llm_id"). */
  idKey: keyof T & string,
  limit = 1000,
) {
  const results: T[] = []
  let paginationKey: string | undefined
  let paginationKeyVersion: number | undefined

  while (true) {
    const page = await op({
      limit,
      pagination_key: paginationKey,
      pagination_key_version: paginationKeyVersion,
    })

    for (const item of page) results.push(item)

    if (page.length < limit) break

    const lastItem = page.at(-1)
    if (!lastItem) break

    const id = lastItem[idKey]
    if (typeof id !== "string") break

    paginationKey = id
    const version = (lastItem as Record<string, unknown>).version
    paginationKeyVersion = typeof version === "number" ? version : undefined
  }

  return results
}
