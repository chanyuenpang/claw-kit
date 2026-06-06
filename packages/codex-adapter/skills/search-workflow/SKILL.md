---
name: search-workflow
description: Use when working with .claw project recall, indexed search, or pre-planning context lookup in Codex.
---

# claw-kit search workflow

Use this skill when the user asks to search project context, recall prior `.claw` knowledge, inspect truth/ADR material, or gather relevant context before writing a plan.

## Commands

- Inspect current harness context:
  - `claw context`
- Search project context:
  - `claw search --query "<text>"`
- Search truth or ADR context:
  - `claw search --query "<truth-or-adr-topic>"`

## Scope model

- `claw search` is the recommended Codex-facing recall command.
- `claw search` is project-scoped and uses the project-level `.claw/memory.sqlite`.
- The searchable project recall surface includes `.claw/truth/`, including ADR content under `.claw/truth/adr/`.
- Task-specific supporting documents should be captured in `plan.references` instead of relying on a task-local search mode.
- The underlying index remains a rebuildable `.claw` artifact, not Codex memory.
- Task-level working context should usually come from the active plan's structured fields, not from `memory.md` alone.
- If `.claw/project.json` has `gitnexus.enabled = true` and the question is really about current code relationships rather than project recall, prefer a researcher specialist that can discover and use GitNexus-oriented capabilities.
