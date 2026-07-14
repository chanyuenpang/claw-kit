# ADR: Shared source for host-neutral skills

## Status

Accepted

## Context

`claw-kit` now treats `planning` and `config` as generic host-neutral skills rather than host-specific claw runtime surfaces.
At the same time, both Codex and OpenCode plugin payloads still need physical skill files inside their own adapter directories so local skill loading and exported bundles continue to work.

Maintaining separate copies in adapter directories creates unnecessary drift, especially when only one copy is edited and the other is forgotten.

The final `0.1.49` release line extended this shared-source rule from `planning` to the user-facing `config` skill and verified that generated Codex/OpenCode adapter payloads stay synchronized from `shared/skills`.

The original synchronization implementation wrote those adapter-local copies into the checkout before bundling or installing. That made a normal local plugin refresh modify tracked source files, despite those files being generated artifacts. The `0.1.61` release replaces that checkout-writing path with temporary staging generation.

## Decision

Use shared sources for host-neutral skills, including future shared workflow skills that ship additional resources:

- canonical source: `shared/skills/planning/SKILL.md`
- canonical source: `shared/skills/config/SKILL.md`

Generate adapter-local copies from those sources only in the bundle/install staging directory:

- `packages/codex-adapter/skills/planning/SKILL.md`
- `packages/opencode-adapter/skills/planning/SKILL.md`
- `packages/codex-adapter/skills/config/SKILL.md`
- `packages/opencode-adapter/skills/config/SKILL.md`

When a shared skill is materialized into staging, copy its complete directory recursively rather than only `SKILL.md`. This preserves template manifests, fallback guidance, and other adjacent resources required by the skill contract.

Enforce synchronization automatically without mutating the checkout:

- `scripts/sync-shared-skills.mjs` writes generated copies to an explicitly supplied adapter directory
- `scripts/sync-planning-skill.mjs` remains as a compatibility wrapper
- Codex and OpenCode bundle export/install scripts copy the adapter source into a temporary staging directory, then call the sync step there before reading the plugin payload
- adapter `build` / `check` scripts validate the shared source and bundle result without generating adapter copies in the checkout
- generated adapter-local `planning` and `config` files are not tracked by Git

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

Keep claw-kit runtime-specific workflow rules in `using-claw-kit`, not in generic shared skills.

## Consequences

- There is only one maintained source for each host-neutral shared skill going forward.
- Exported plugin bundles still retain adapter-local skill files, so no host runtime contract is broken.
- Plugin installation and export no longer leave generated skill changes in a developer checkout.
- The temporary staging directory is an intentional distribution boundary: it is the only location where adapter-local shared-skill copies are materialized for bundle or install work.
- A shared skill directory is an atomic distribution unit: the generated plugin must retain every required resource beside `SKILL.md`, not only the entry instruction file.
- Host/runtime-specific workflow rules remain separated from generic planning and config guidance.
- The complexity gate now has a single owner at workflow entry, so low-score tasks do not create drift by entering planning first and bypassing later.
- Future edits to planning quality or decomposition rules should start from `shared/skills/planning/SKILL.md`.
- Future edits to config routing or override-format guidance should start from `shared/skills/config/SKILL.md`.
- Edits to complexity admission, status semantics, or workflowGuidance handling should start from `using-claw-kit`.

## Related Code

- `shared/skills/planning/SKILL.md`
- `shared/skills/config/SKILL.md`
- `scripts/sync-shared-skills.mjs`
- `scripts/sync-planning-skill.mjs`
- `scripts/codex-plugin-bundle.mjs`
- `scripts/opencode-plugin-bundle.mjs`
- `packages/codex-adapter/package.json`
- `packages/opencode-adapter/package.json`
- `.gitignore`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `.claw/tasks/发布共享技能-staging-修复并刷新本地运行时/plan.json`

## Search Terms

- `planning`
- `config`
- `shared skill source`
- `shared planning skill`
- `shared config skill`
- `shared skill staging`
- `generated adapter skill`
- `complexity heuristic`
- `workflow admission`
- `recursive shared skill copy`
- `skill template fallback`
