# Local claw CLI

## Status

Accepted working truth for local development on this machine.

## Core facts

- `claw init` now exists and bootstraps a minimal `.claw` project.
- The local CLI command surface includes:
  - `claw init`
  - `claw context`
  - `claw search`
  - `claw plan write`
  - `claw plan edit`
  - `claw switch-task`
  - `claw memory index/search/get` for legacy/debug and low-level index management
  - `claw truth ingest`
- Codex-facing recall should use `claw search --query "<topic>"`.
- Before writing a new plan, agents may run `claw search --query "<topic>"` to recover relevant project context.
- `claw memory ...` remains available, but it is not the recommended Codex workflow concept.
- Local installation is currently done through `npm link .\\packages\\cli`.
- On this machine, the global wrappers are created under `C:\\nvm4w\\nodejs`.

## Practical implications

- `claw` can now be used as a normal shell command during local development.
- New projects do not need manual `.claw` scaffolding before they can enter the harness flow.
- Workflow docs and skills should say `claw search`, not OpenClaw-style "memory search", when explaining recall to Codex agents.
