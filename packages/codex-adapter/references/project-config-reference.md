# Claw Kit Project Config Reference

This note is the Codex adapter copy of the canonical project config guide in [docs/project-json-reference.md](../../../docs/project-json-reference.md).

Use it when a Codex thread needs to understand or explain the project-level config surfaces that affect `claw-kit` behavior.

## Core mental model

- `.claw/project.json` is the canonical team-owned declaration surface
- `.claw/project-override.json` is a local runtime-only overlay
- effective runtime behavior comes from the merged config
- project memory, workflow toggles, writer overrides, and GitNexus integration all live on that project config surface

## Config layers

### `.claw/project.json`

- canonical team-owned project declaration
- normalized by `claw init` and protocol repair
- commit this file when the workflow behavior should be shared

### `.claw/project-override.json`

- local runtime-only override layer
- gitignored by default
- deep-merges over `.claw/project.json`
- can override any field from `.claw/project.json`
- explicit `null` is a real override value, not "fall back to team config"

## Key fields

- `maxTasksToKeep`
  - active task retention limit
  - default: `9`
- `externalTruthSkill`
  - optional truth-writer override
- `externalAdrSkill`
  - optional ADR-writer override
- `memory.enabled`
  - master switch for project memory behavior
- `memory.externalDocPaths`
  - markdown recall roots for `claw search`
- `memory.embedding`
  - embedding provider and recall-index behavior
- `gitnexus.enabled`
  - enables GitNexus-related closeout behavior
- `workflow.goalMode.enabled`
  - suppresses `goalMode` guidance when set to `false`
- `workflow.truthDispatch.mode`
  - `per_task` or `final_only`

## Practical guidance

- Use `.claw/project.json` for shared team workflow behavior.
- Use `.claw/project-override.json` for personal runtime preferences.
- Treat explicit `null` as an intentional override, not inheritance.
- Do not tell users they need to write `store.vector.enabled = true` just to keep default vector indexing behavior.
- `final_only` suppresses mid-task truth handoff, not closeout truth or ADR deposition.

For field explanations and copyable examples, use the full guide in [docs/project-json-reference.md](../../../docs/project-json-reference.md).
