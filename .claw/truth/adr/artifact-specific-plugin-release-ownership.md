# ADR: Artifact-specific plugin release ownership

## Status

Accepted

## Context

The former repository-level release skill accumulated CLI and every plugin's
packaging, publication, rollback, and installation rules. Those artifact
families have distinct versioning, release targets, verification evidence, and
post-release update behavior. In particular, Cindy needs a versioned `vcindy-*`
GitHub Release with a matching `.cindy` asset and a narrowly scoped local
rollback-retention rule; treating it as a generic plugin or a CLI release risks
mixing unrelated source and acceptance boundaries.

The Cindy update surface also cannot use repository-wide latest-release
selection because a newer release can belong to another artifact family.

## Decision

- Keep `release-claw-kit` as a selection-only router.
- Give the CLI, Codex, Cindy, OpenClaw, and OpenCode artifact families separate
  repository-maintainer release skills with independent templates and
  fallbacks.
- Route testing, local packaging, and dry-run work to `test-claw-kit` unless
  publication authority is explicit.
- Give Cindy release ownership to `release-cindy-plugin`: build and verify the
  target installer before pruning, keep only the target plus one numerically
  latest lower rollback package, and publish the matching asset on its
  `vcindy-*` GitHub Release.
- Make the Cindy update skill select the numerically newest stable official
  `vcindy-*` release with a matching installer asset and embedded manifest;
  keep CLI refresh and confirmed enabled/running plugin state as the two
  required update surfaces.

## Alternatives considered

- Keep one combined release skill with per-platform rule files. Rejected because
  the entry contract would still own incompatible artifact and verification
  boundaries.
- Use repository-wide latest GitHub Release for Cindy update. Rejected because
  it can select a newer CLI or another plugin artifact instead of a Cindy
  installer.
- Retain rollback packages by modification time. Rejected because timestamps do
  not represent adapter-version ordering and would make the retained fallback
  non-deterministic.

## Consequences

- Maintainers get a smaller, artifact-scoped release contract and cannot
  accidentally treat a platform request as CLI release authority.
- Cindy release completion is proven by the immutable installer asset, while
  local installation remains an opt-in follow-up workflow.
- Cindy users cannot accidentally install a different artifact family's latest
  release, or mistake a downloaded package for an activated plugin.

## Related code

- `.agents/skills/release-claw-kit/SKILL.md`
- `.agents/skills/release-cindy-plugin/`
- `packages/cindy-adapter/plugin/skills/update/`

## Search terms

- `release router artifact family`
- `vcindy rollback artifact`
- `Cindy GitHub Release update`
