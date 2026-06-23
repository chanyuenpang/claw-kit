# ADR: Shared source for the planning skill

## Status

Accepted

## Context

`claw-kit` now treats `planning` as a more generic plan skill rather than a host-specific claw runtime surface.
At the same time, both Codex and OpenCode plugin payloads still need a physical `skills/planning/SKILL.md` file inside their own adapter directories so local skill loading and exported bundles continue to work.

Maintaining separate copies in:

- `packages/codex-adapter/skills/planning/SKILL.md`
- `packages/opencode-adapter/skills/planning/SKILL.md`

creates unnecessary drift, especially when only one copy is edited and the other is forgotten.

## Decision

Use a single shared planning skill source:

- canonical source: `shared/skills/planning/SKILL.md`

Generate adapter-local copies from that source:

- `packages/codex-adapter/skills/planning/SKILL.md`
- `packages/opencode-adapter/skills/planning/SKILL.md`

Enforce synchronization automatically:

- `scripts/sync-planning-skill.mjs` writes the generated copies
- Codex and OpenCode bundle export scripts call the sync step before reading plugin payloads
- adapter `build` / `check` scripts also call the sync step

Keep the shared planning skill host-agnostic:

- it defines plan quality, decomposition, and scope-writing rules
- it does not define claw-kit runtime flow, status semantics, writer dispatch, goal mode, or closeout policy

Keep claw-kit runtime-specific workflow rules in `using-claw-kit`, not in the generic `planning` skill.

## Consequences

- There is only one maintained planning skill source going forward.
- Exported plugin bundles still retain adapter-local `planning/SKILL.md` files, so no host runtime contract is broken.
- Host/runtime-specific workflow rules remain separated from generic planning guidance.
- Future edits to planning quality or decomposition rules should start from `shared/skills/planning/SKILL.md`; edits to status semantics or workflowGuidance handling should start from `using-claw-kit`.

## Related Code

- `shared/skills/planning/SKILL.md`
- `scripts/sync-planning-skill.mjs`
- `scripts/codex-plugin-bundle.mjs`
- `scripts/opencode-plugin-bundle.mjs`
- `packages/codex-adapter/package.json`
- `packages/opencode-adapter/package.json`
- `packages/codex-adapter/skills/planning/SKILL.md`
- `packages/opencode-adapter/skills/planning/SKILL.md`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
