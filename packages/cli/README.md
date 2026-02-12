# retell-sync-cli

CLI for syncing [Retell AI](https://www.retellai.com/) agent configurations between the API and your local filesystem.

## Install

```bash
bun add -g retell-sync-cli
```

Set your API key:

```bash
export RETELL_API_KEY=your_key_here
```

## Commands

### `retell pull`

Pull agent configs from the Retell API to local files.

```bash
retell pull                  # interactive agent selection
retell pull <agentId>        # pull a specific agent
retell pull -a               # pull all agents
retell pull -v 3             # pull a specific version
retell pull --no-tests       # skip test cases
```

### `retell deploy`

Deploy local changes to Retell (draft state).

```bash
retell deploy                # interactive selection
retell deploy <agentId>      # deploy a specific agent
retell deploy -a             # deploy all
retell deploy -n             # dry run -- show changes without applying
retell deploy -n -v          # dry run with full diffs
```

### `retell publish`

Publish agents that have unpublished draft changes.

```bash
retell publish               # interactive selection
retell publish <agentId>     # publish a specific agent
retell publish -a            # publish all
retell publish -n            # dry run
```

## Options

| Flag                           | Description                                   |
| ------------------------------ | --------------------------------------------- |
| `-w, --agents-dir <dir>`       | Directory for agent files (default: `agents`) |
| `-f, --config-format <format>` | Config file format (`json`, `jsonc`, `yaml`)  |

## License

MIT
