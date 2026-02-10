# retell-utils

Monorepo for Retell AI developer tooling.

## Packages

| Package | Description | npm |
| --- | --- | --- |
| [`retell-utils`](packages/core) | Zod schemas for Retell AI API resources | [![npm](https://img.shields.io/npm/v/retell-utils)](https://www.npmjs.com/package/retell-utils) |
| [`retell-sync-cli`](packages/cli) | CLI for syncing Retell agents between filesystem and API | [![npm](https://img.shields.io/npm/v/retell-sync-cli)](https://www.npmjs.com/package/retell-sync-cli) |

## Development

Requires [Bun](https://bun.sh).

```bash
bun install
```

Each package has its own scripts:

```bash
cd packages/core  # or packages/cli
bun run check     # typecheck + lint
bun run fix       # lint + format
bun test          # core only
bun run build     # build for publishing
```

## Releasing

Releases are automatic. Bump the `version` in a package's `package.json`, merge to `main`, and CI publishes to npm.
