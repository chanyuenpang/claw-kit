# Host-specific update skills

## Status

Accepted working truth for the current Codex and OpenCode update surfaces.

## Core facts

- `update` is a host-selected skill name, not a cross-platform router. The loaded adapter determines which implementation is available, and the workflow must not ask the user to choose Codex, OpenCode, or a conservative route.
- Codex owns `packages/codex-adapter/skills/update/`; OpenCode owns `packages/opencode-adapter/skills/update/`. Each package independently maintains `SKILL.md`, `TEMPLATE.json`, `non-claw-fallback.md`, and `CONTENT-COVERAGE.md`.
- `scripts/sync-shared-skills.mjs` deliberately excludes `update` from `SHARED_SKILL_NAMES`. `shared/skills/update/` no longer exists, and shared-skill synchronization must not overwrite either adapter-owned implementation.
- Both implementations keep the same high-level update unit: confirm the published target, refresh the global CLI together with the current host plugin, verify both surfaces, and report exact per-surface success or failure.
- Both `TEMPLATE.json` files are fixed three-task `process.active` plans. Neither template has a host-selection task or `guidance.onDone.choices` for platform routing.

## Codex contract

- Refresh the published global CLI first, then refresh the official Codex plugin from the `chanyuenpang/claw-kit` GitHub marketplace.
- Only `claw-kit@claw-kit` may be enabled; `claw-kit@claw-kit-local` must be disabled. Unpublished workspace files and local marketplaces are not valid update sources.
- Cache presence alone is not activation proof. Verification covers the published CLI version, official marketplace source, enabled identity, matching source/cache manifests, required skills, and the restart/new-task loaded-skill boundary.

## OpenCode contract

- In the maintained repository checkout, `npm run install:opencode-plugin` is the update entry. It rebuilds and reinstalls the global CLI before deploying the OpenCode plugin payload, root shim, discovery skill copies, agent definitions, references, and workflow guidance.
- Installed OpenCode copies are outputs, not authoring surfaces. A CLI-only refresh or manual edit under `~/.config/opencode` is incomplete.
- Verification covers the global CLI, all deployed OpenCode surfaces, removal of retired writer discovery directories, and the restart boundary before validating the loaded plugin version.

## Maintenance and verification anchors

- `packages/codex-adapter/skills/update/SKILL.md`
- `packages/codex-adapter/skills/update/TEMPLATE.json`
- `packages/codex-adapter/skills/update/non-claw-fallback.md`
- `packages/codex-adapter/skills/update/CONTENT-COVERAGE.md`
- `packages/opencode-adapter/skills/update/SKILL.md`
- `packages/opencode-adapter/skills/update/TEMPLATE.json`
- `packages/opencode-adapter/skills/update/non-claw-fallback.md`
- `packages/opencode-adapter/skills/update/CONTENT-COVERAGE.md`
- `scripts/sync-shared-skills.mjs`
- `scripts/sync-shared-skills.test.mjs`
- `scripts/codex-plugin-bundle.test.mjs`
- `scripts/opencode-plugin-bundle.test.mjs`
- `packages/opencode-adapter/references/opencode-plugin-update.md`

## Search terms

- `platform-specific update skills`
- `adapter-owned update`
- `no host route choice`
- `SHARED_SKILL_NAMES excludes update`
- `Codex update official marketplace`
- `OpenCode update maintained installer`
