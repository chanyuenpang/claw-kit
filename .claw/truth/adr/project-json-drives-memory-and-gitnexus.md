# ADR: Project JSON Drives Memory And GitNexus

## Status

Accepted

## Context

`claw-kit` needs to stay compatible with the current `OpenClaw` project declaration semantics while still working in Codex-first flows. We already have many existing `.claw` projects, so changing field names or inferring configuration from ad hoc heuristics would create drift.

At the same time:

- Codex does not need `contextPaths` because session bootstrap already relies on `AGENTS.md`, plugin skills, and CLI guidance.
- memory indexing does need to respect project-declared extra documentation paths.
- `plan done` should refresh GitNexus only when the project explicitly enables it.
- the published `@veewo/gitnexus@1.5.8` CLI does not yet expose `--no-ai-context`, even though newer local source lines already support it.

## Decision

- Preserve the current `OpenClaw` field names in `.claw/project.json`:
  - `contextPaths`
  - `memory.externalDocPaths`
  - `gitnexus.enabled`
- Write those fields explicitly during `claw init`.
- Keep `contextPaths` as a schema field but do not consume it in current Codex-first `claw-kit` flows.
- Use `memory.externalDocPaths` to drive project memory indexing, including directory paths like `docs/`.
- Make `claw plan done` refresh GitNexus only when `gitnexus.enabled` is `true`.
- Prefer `gitnexus analyze --no-ai-context`, but automatically fall back to plain `gitnexus analyze` when the installed CLI reports that the flag is unsupported.

## Consequences

- Existing and future `.claw` projects can rely on stable canonical field names.
- Project creation no longer leaves schema interpretation implicit.
- Codex is not forced to adopt `contextPaths` semantics it does not need.
- `plan done` stays robust across the currently published GitNexus CLI and the newer local source line.
