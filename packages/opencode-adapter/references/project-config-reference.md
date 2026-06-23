# Claw Kit Project Config Reference

This note is a backup config reference for the OpenCode adapter. It is not part of the harness contract or required startup flow.

Use it when an OpenCode thread needs to explain or tune `.claw/project.json` or `.claw/project-override.json`, and fall back to the canonical guide in [docs/project-json-reference.md](../../../docs/project-json-reference.md) when deeper field-by-field detail is needed.

When the user asks to change claw configuration, use the `config` skill as the dedicated entrypoint before recommending edits.

## Core mental model

- `.claw/project.json` is the canonical team-owned declaration surface
- `.claw/project-override.json` is a local runtime-only overlay
- effective runtime behavior comes from the merged config
- project memory, workflow toggles, writer overrides, and GitNexus integration all live on that project config surface

## Common routes

- Shared team workflow
  - put it in `.claw/project.json`
- Personal runtime preference
  - put it in `.claw/project-override.json`
- Tune recall or embeddings
  - change `memory.externalDocPaths` or `memory.embedding`
- Add external truth or ADR writers
  - set `externalTruthSkill` or `externalAdrSkill`
- Pair the workflow with GitNexus
  - set `gitnexus` to `true` only when the project actually wants that integration

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
- `memory.externalDocPaths`
  - markdown recall roots for `claw search`
- `memory.embedding`
  - embedding provider and recall-index behavior
- `gitnexus`
  - enables GitNexus-related closeout behavior
- `goalMode`
  - suppresses `goalMode` guidance when set to `false`
- `truthDispatch`
  - `per_task` or `final_only`

## Practical guidance

- Ask whether the change is shared team config or personal local config before editing.
- Use `.claw/project.json` for shared team workflow behavior.
- Use `.claw/project-override.json` for personal runtime preferences.
- Use the flat field names in both files: `planning`, `externalPlanningSkill`, `goalMode`, `truthDispatch`, and `gitnexus`.
- Treat explicit `null` as an intentional override, not inheritance.
- Do not tell users they need to write `store.vector.enabled = true` just to keep default vector indexing behavior.
- `final_only` suppresses mid-task truth handoff, not closeout truth or ADR deposition.

## When to use the canonical guide

Use [docs/project-json-reference.md](../../../docs/project-json-reference.md) when you need:

- complete field-by-field explanations
- copyable config examples
- the canonical backup reference instead of the short adapter note

This adapter note stays intentionally short so it remains a practical backup instead of turning into another full schema document.
