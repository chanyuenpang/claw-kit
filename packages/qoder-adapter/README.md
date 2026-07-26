# Claw Kit — Qoder Plugin

Structured agent workflow with plan lifecycle, knowledge capture, and hook automation for Qoder.

## What it does

Claw Kit brings a structured agent workflow to Qoder:

- **Plan lifecycle** — create, discuss, execute, and close plans with status-driven guidance
- **Knowledge capture** — automatic Truth/ADR deposition at plan completion
- **Project recall** — semantic search over project knowledge
- **Hook automation** — `SessionStart` and `Stop` hooks run automatically, no manual invocation needed

## Requirements

- **claw CLI** — install globally: `npm install -g @veewo/claw`
- A `.claw` project directory (run `claw init` to create one)

## Plugin components

### Skills

| Skill | Description |
|---|---|
| `using-claw-kit` | Main-agent contract for guidance and lifecycle handling |
| `planning` | Requirement refinement and task decomposition |
| `researcher` | Delegate code investigation to a focused subagent |
| `config` | Project configuration management |
| `update` | Refresh claw CLI and plugin surfaces |
| `create-claw-skill` | Create new claw-kit workflow skills |
| `knowledge-writer` | Maintain canonical Truth and ADR knowledge |

### Hooks

| Event | Command | Purpose |
|---|---|---|
| `SessionStart` | `claw hook auto-claw --host qoder` | Recover startup harness state, inject workflow guidance |
| `Stop` | `claw hook auto-doc --host qoder` | Capture turn report, queue knowledge finalization |

Hooks fire automatically at session start (including after context compaction) and at every agent stop.

### Assets

- `assets/avatar.svg` — plugin logo (teal "K" mark with amber accent)

## Installation

### From source (development)

Import the `packages/qoder-adapter` directory as a local plugin in Qoder Settings → Plugins.

### Prerequisites

1. Build and install the claw CLI:
   ```bash
   npm run build -w @veewo/claw-core && npm run build -w @veewo/claw
   npm install -g packages/cli
   ```

2. Verify the CLI is available:
   ```bash
   claw --version
   ```

3. Initialize a `.claw` project (if not already done):
   ```bash
   claw init --name "My Project"
   ```

## Validation

```bash
python3 create-plugin/skills/create-plugin/scripts/validate_qoder_plugin.py packages/qoder-adapter
```

## Source

- **Repository**: https://github.com/chanyuenpang/claw-kit
- **Author**: chanyuenpang
- **License**: MIT

## Non-component files

The following files exist in the adapter directory but are not Qoder plugin components:

- `references/` — adapter reference docs, consumed by claw CLI and agent for reasoning
- `package.json` — npm workspace metadata for the monorepo

> Workflow guidance is no longer shipped as an adapter file. The claw CLI selects the Qoder-native guidance config internally when invoked with `--host qoder` (see the hooks table above).
