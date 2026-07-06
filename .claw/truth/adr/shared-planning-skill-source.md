# ADR: Shared source for host-neutral skills

## Status

Accepted

## Context

`claw-kit` keeps the intentionally maintained host-neutral skills in a small shared set, and the shared-skill sync pipeline only needs to manage the skills that are meant to stay in the repo long term.
At the same time, both Codex and OpenCode plugin payloads still need physical skill files inside their own adapter directories so local skill loading and exported bundles continue to work.

Maintaining separate copies in adapter directories creates unnecessary drift, especially when only one copy is edited and the other is forgotten.

The current shared-source line keeps the built-in skills that are meant to stay canonical. One-off generated skill trees created while testing `create-claw-skill` should not be treated as formal shared skills/templates unless they are explicitly promoted later.

Some shared skills ship helper files beside `SKILL.md` or a non-claw fallback surface. Copying only the top-level markdown would silently drop those assets and make adapter bundles diverge from the shared source tree.

## Decision

Use shared sources for the maintained host-neutral skills:

- canonical source: `shared/skills/planning/SKILL.md`
- canonical source: `shared/skills/config/SKILL.md`
- canonical source: `shared/skills/create-claw-skill/SKILL.md`

Generate adapter-local copies from those sources:

- `packages/codex-adapter/skills/planning/SKILL.md`
- `packages/opencode-adapter/skills/planning/SKILL.md`
- `packages/codex-adapter/skills/config/SKILL.md`
- `packages/opencode-adapter/skills/config/SKILL.md`
- `packages/codex-adapter/skills/create-claw-skill/SKILL.md`
- `packages/opencode-adapter/skills/create-claw-skill/SKILL.md`

Enforce synchronization automatically:

- `scripts/sync-shared-skills.mjs` writes the generated copies and mirrors the full skill directory tree, not just `SKILL.md`
- `scripts/sync-planning-skill.mjs` remains as a compatibility wrapper
- Codex and OpenCode bundle export scripts call the sync step before reading plugin payloads
- adapter `build` / `check` scripts also call the sync step
- the sync step uses a repo-scoped lock so concurrent Codex/OpenCode packaging runs stay race-free on Windows

Keep shared skill helper assets in the shared source tree:

- helper scripts, prompt docs, and fallback files live beside the shared skill source
- adapter bundles receive those helper assets through the directory sync step
- the shared source tree remains the only place to edit host-neutral skill content

Keep the shared planning skill host-agnostic:

- it defines plan quality, decomposition, and scope-writing rules
- it assumes `using-claw-kit` has already decided whether the request belongs in the formal claw workflow
- it does not own or duplicate the entry-time complexity scoring heuristic
- it does not define claw-kit runtime flow, status semantics, writer dispatch, goal mode, or closeout policy

Keep the shared config skill host-agnostic:

- it asks whether a config change is shared team config or personal local override
- it routes shared config to `.claw/project.json`
- it routes personal config to `.claw/project-override.json`
- it documents flat canonical field shapes and legacy compatibility boundaries
- it does not own claw lifecycle, status, writer dispatch, or direct mutation semantics

Keep the shared create-claw-skill entry host-agnostic:

- it converts an existing skill or user idea into a claw-template-backed skill
- it does not own claw-kit runtime flow, complexity scoring, status semantics, writer dispatch, goal mode, or closeout policy

Keep claw-kit runtime-specific workflow rules in `using-claw-kit`, not in generic shared skills.

## Consequences

- There is only one maintained source for each intentionally shared host-neutral skill going forward.
- Exported plugin bundles still retain adapter-local skill files and their helper assets, so no host runtime contract is broken.
- Host/runtime-specific workflow rules remain separated from generic planning and config guidance.
- The complexity gate now has a single owner at workflow entry, so low-score tasks do not create drift by entering planning first and bypassing later.
- Future edits to planning quality or decomposition rules should start from `shared/skills/planning/SKILL.md`.
- Future edits to config routing or override-format guidance should start from `shared/skills/config/SKILL.md`.
- Future edits to the claw-native conversion entry should start from `shared/skills/create-claw-skill/SKILL.md`.
- One-off generated test skill trees stay out of the default sync list unless they are explicitly promoted into the maintained shared set.
- Edits to complexity admission, status semantics, or workflowGuidance handling should start from `using-claw-kit`.

## Related Code

- `shared/skills/planning/SKILL.md`
- `shared/skills/config/SKILL.md`
- `shared/skills/create-claw-skill/SKILL.md`
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
- `packages/codex-adapter/skills/create-claw-skill/SKILL.md`
- `packages/opencode-adapter/skills/create-claw-skill/SKILL.md`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `.claw/tasks/Publish-claw-kit-release-and-refresh-local-Codex-plugin/plan.json`

## Search Terms

- `planning`
- `config`
- `create-claw-skill`
- `shared skill source`
- `shared planning skill`
- `shared config skill`
- `complexity heuristic`
- `workflow admission`
