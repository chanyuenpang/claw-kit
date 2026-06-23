# ADR: Dedicated config skill entrypoint

## Status

Accepted

## Context

`claw-kit` already has a canonical team config file, `.claw/project.json`, and a local personal overlay, `.claw/project-override.json`.
After flattening simple project-level toggles, the old nested examples became a source of confusion, especially for personal overrides.

Without a dedicated entrypoint, agents may answer configuration questions from scattered docs, guess whether a change is shared or personal, or put local preferences into the committed project config.

The `0.1.48` release closeout made this entrypoint part of the published adapter payload and local Codex plugin cache, so the skill is now a release-facing configuration contract rather than only repository-local guidance.

## Decision

- Add a dedicated `config` skill for claw-kit configuration questions and changes.
- The skill must first establish whether the user wants a shared team config change or a personal local override.
- Shared team changes go to `.claw/project.json`.
- Personal local changes go to `.claw/project-override.json`.
- Personal override examples use the current flat canonical fields, not legacy nested workflow/GitNexus shapes.
- Default local vector indexing remains runtime-enabled, but default config examples and repair output do not write `store.vector.enabled = true`.
- `store.vector` remains in config only for explicit intent: `enabled: false` or `extensionPath`.
- Maintain the config skill from a shared source at `shared/skills/config/SKILL.md`, then sync generated copies into both Codex and OpenCode adapter skill directories.
- Rename the active sync entrypoint to `scripts/sync-shared-skills.mjs`; keep `scripts/sync-planning-skill.mjs` as a compatibility wrapper.

## Consequences

- Users have a visible configuration route instead of hunting through references.
- Agents have a stable first question before editing config: team or personal.
- Personal preferences stay out of committed `.claw/project.json` unless the user explicitly wants a shared team change.
- Codex and OpenCode receive the same config skill text, reducing adapter drift.
- Plugin bundle tests now assert that the config skill is present in both adapter payloads.
- Release or local closeout checks must verify the actual global `claw` runtime files as well as the version number; same-version stale runtime can otherwise create a split-brain where startup writes legacy config and repo-local commands flatten it again.

## Related Code

- `shared/skills/config/SKILL.md`
- `scripts/sync-shared-skills.mjs`
- `scripts/sync-planning-skill.mjs`
- `packages/codex-adapter/skills/config/SKILL.md`
- `packages/opencode-adapter/skills/config/SKILL.md`
- `docs/project-json-reference.md`
- `scripts/codex-plugin-bundle.test.mjs`
- `scripts/opencode-plugin-bundle.test.mjs`
- `.claw/tasks/Publish-claw-kit-release-and-refresh-local-Codex-plugin/plan.json`

## Search Terms

- `config skill`
- `.claw/project-override.json`
- `.claw/project.json`
- `sync-shared-skills`
- `personal override`
- `team config`
