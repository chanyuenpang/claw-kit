---
name: search-workflow
description: Use when working with .claw project recall, indexed search, or pre-planning context lookup.
---

# claw-kit search workflow

Use this skill when the user asks to search project context, recall prior `.claw` knowledge, inspect truth/ADR material, or gather relevant context after task scope is bound or before starting research.

## Commands

- Search project context:
  - `claw search "<text>"`
  - `claw search --query "<text>"`
- Refresh the project recall index explicitly:
  - `claw search index --refresh`
- Search truth or ADR context:
  - `claw search "<truth-or-adr-topic>"`
  - `claw search --query "<truth-or-adr-topic>"`

## Scope model

- `claw search` is the recommended recall command.
- `claw search` is project-scoped and uses the project-level `.claw/memory.sqlite`.
- `claw search` is for documentation-style recall: project memory, truth docs, ADRs, and declared external markdown docs.
- For normal planned work, use `claw search` after `claw plan create` only when recall would materially improve the already-bound task scope.
- For lighter-weight planned work, use `claw search` before execution only when project context is relevant.
- Before research work, use `claw search` when documentation-style recall would help; it is not a mandatory template step.
- Use `claw search` to absorb a natural-language prompt or keyword query against project docs, recover truth/ADR context, and narrow the surface before later code-location work.
- Do not treat `claw search` as a code-search surface. For current code relationships or implementation tracing, use a researcher specialist and GitNexus-oriented capabilities when available.
- The searchable project recall surface includes `.claw/truth/`, including ADR content under `.claw/truth/adr/`.
- Task-specific supporting documents are captured in `plan.references`, not a task-local search mode.
- The underlying index remains a rebuildable `.claw` artifact, not agent memory.
- Task-level working context comes from the active plan's structured fields, not from `memory.md` alone.
- When `.claw/project.json` has `gitnexus = true` and the question is about current code relationships rather than project recall, use a researcher specialist that discovers and uses GitNexus-oriented capabilities.
