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
  - change `memory.enabled`, `memory.externalDocPaths`, or `memory.embedding`
- Add ordered external skills for knowledge finalization
  - set `knowledgeWriter.externalSkills`
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

- `version`
  - expected project protocol version
  - if the project version is ahead of the current CLI, `claw context` returns lagging info in `startupRecovery.versionSync`
  - healthy matching version information is omitted from the public `claw context` output
- `autoUpdate`
  - default: `true`
  - when `true` and a newer published claw-kit exists, startup recovery tells the agent to make `claw-kit:update` the first action
  - when `false`, startup recovery only reports the version mismatch and does not instruct the agent to update

When memory embedding or GitNexus is enabled, `claw context` adds optional `searchGuidance`: use `claw search` to narrow document context and GitNexus to narrow code context as available, then use the default search for exact locations. The field is omitted when neither capability is enabled.
- `maxTasksToKeep`
  - archived task retention limit before oldest-archive pruning
  - default: `9`
- `knowledgeWriter.externalSkills`
  - optional ordered documentation-governance skill sequence replacing the default `["claw-kit:knowledge-writer"]`; every skill receives the same unattended prompt, and external skills need no claw session workflow
- `memory.enabled`
  - master switch for project memory, task memory, embedding refresh, and `claw search`
- `memory.externalDocPaths`
  - markdown recall roots for `claw search`
- `memory.embedding`
  - embedding provider and recall-index behavior
- `gitnexus`
  - enables GitNexus-related closeout behavior
- `goalMode`
  - suppresses `goalMode` guidance when set to `false`
- `knowledgeWriter.model`
  - optional Codex SDK model override; `null` uses the SDK default
- `knowledgeWriter.reasoningEffort`
  - one of `minimal`, `low`, `medium`, `high`, or `xhigh`

## Practical guidance

- Ask whether the change is shared team config or personal local config before editing.
- Use `.claw/project.json` for shared team workflow behavior.
- Use `.claw/project-override.json` for personal runtime preferences.
- Use the canonical field names in both files: `planning`, `autoUpdate`, `externalPlanningSkill`, `goalMode`, `knowledgeWriter`, and `gitnexus`.
- Treat explicit `null` as an intentional override, not inheritance.
- `memory.enabled = false` disables project memory, task memory, embedding refresh, and `claw search` together.

## When to use the canonical guide

Use [docs/project-json-reference.md](../../../docs/project-json-reference.md) when you need:

- complete field-by-field explanations
- copyable config examples
- the canonical backup reference instead of the short adapter note

This adapter note stays intentionally short so it remains a practical backup instead of turning into another full schema document.
