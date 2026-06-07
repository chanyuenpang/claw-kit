# Project Schema Alignment

`claw-kit` now treats the current `OpenClaw` declaration fields as canonical in `.claw/project.json`.

## Canonical Fields

- `contextPaths`
- `memory.externalDocPaths`
- `gitnexus.enabled`

## Current Behavior

- `claw init` writes those fields explicitly when a project is created, so later commands do not need to guess the schema.
- `contextPaths` is preserved for schema alignment but is not currently consumed by the Codex-first `claw-kit` workflow.
- `memory.externalDocPaths` drives the project search index and supports both:
  - individual files
  - directory paths like `docs/`
- Codex-facing recall is `claw search --query "<topic>"`; this reads the indexed project context before planning or investigation.
- `claw memory ...` remains as legacy/debug and low-level index management, not the primary Codex workflow term.
- `claw plan done` rebuilds project/task search indexes and only refreshes GitNexus when `gitnexus.enabled` is `true`.
- When the installed GitNexus CLI does not support `--no-ai-context`, `claw plan done` falls back to plain `gitnexus analyze`.

## Evidence

- [packages/core/src/init.ts](D:/Users/chany/Documents/claw-kit/packages/core/src/init.ts)
- [packages/core/src/memory.ts](D:/Users/chany/Documents/claw-kit/packages/core/src/memory.ts)
- [packages/cli/src/cli.ts](D:/Users/chany/Documents/claw-kit/packages/cli/src/cli.ts)
- [packages/core/test/core.test.ts](D:/Users/chany/Documents/claw-kit/packages/core/test/core.test.ts)
- [docs/2026-06-06-project-schema-alignment-execution.md](D:/Users/chany/Documents/claw-kit/docs/2026-06-06-project-schema-alignment-execution.md)
