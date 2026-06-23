# ADR: Shared source for host-neutral skills

## Status

Accepted

## Context

`claw-kit` now treats `planning` and `config` as generic host-neutral skills rather than host-specific claw runtime surfaces.
At the same time, both Codex and OpenCode plugin payloads still need physical skill files inside their own adapter directories so local skill loading and exported bundles continue to work.

Maintaining separate copies in adapter directories creates unnecessary drift, especially when only one copy is edited and the other is forgotten.

The final `0.1.49` release line extended this shared-source rule from `planning` to the user-facing `config` skill and verified that generated Codex/OpenCode adapter payloads stay synchronized from `shared/skills`.

## Decision

Use shared sources for host-neutral skills:

- canonical source: `shared/skills/planning/SKILL.md`
- canonical source: `shared/skills/config/SKILL.md`

Generate adapter-local copies from those sources:

- `packages/codex-adapter/skills/planning/SKILL.md`
- `packages/opencode-adapter/skills/planning/SKILL.md`
- `packages/codex-adapter/skills/config/SKILL.md`
- `packages/opencode-adapter/skills/config/SKILL.md`

Enforce synchronization automatically:

- `scripts/sync-shared-skills.mjs` writes the generated copies
- `scripts/sync-planning-skill.mjs` remains as a compatibility wrapper
- Codex and OpenCode bundle export scripts call the sync step before reading plugin payloads
- adapter `build` / `check` scripts also call the sync step

Keep the shared planning skill host-agnostic:

- it defines plan quality, decomposition, and scope-writing rules
- it does not define claw-kit runtime flow, status semantics, writer dispatch, goal mode, or closeout policy

Keep the shared config skill host-agnostic:

- it asks whether a config change is shared team config or personal local override
- it routes shared config to `.claw/project.json`
- it routes personal config to `.claw/project-override.json`
- it documents flat canonical field shapes and legacy compatibility boundaries
- it does not own claw lifecycle, status, writer dispatch, or direct mutation semantics

Keep claw-kit runtime-specific workflow rules in `using-claw-kit`, not in generic shared skills.

## Consequences

- There is only one maintained source for each host-neutral shared skill going forward.
- Exported plugin bundles still retain adapter-local skill files, so no host runtime contract is broken.
- Host/runtime-specific workflow rules remain separated from generic planning and config guidance.
- Future edits to planning quality or decomposition rules should start from `shared/skills/planning/SKILL.md`.
- Future edits to config routing or override-format guidance should start from `shared/skills/config/SKILL.md`.
- Edits to status semantics or workflowGuidance handling should start from `using-claw-kit`.

## Related Code

- `shared/skills/planning/SKILL.md`
- `shared/skills/config/SKILL.md`
- `scripts/sync-shared-skills.mjs`
- `scripts/sync-planning-skill.mjs`
- `scripts/codex-plugin-bundle.mjs`
- `scripts/opencode-plugin-bundle.mjs`
- `packages/codex-adapter/package.json`
- `packages/opencode-adapter/package.json`
- `packages/codex-adapter/skills/planning/SKILL.md`
- `packages/opencode-adapter/skills/planning/SKILL.md`
- `packages/codex-adapter/skills/config/SKILL.md`
- `packages/opencode-adapter/skills/config/SKILL.md`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `.claw/tasks/Publish-claw-kit-release-and-refresh-local-Codex-plugin/plan.json`

## Search Terms

- `planning`
- `config`
- `shared skill source`
- `shared planning skill`
- `shared config skill`
