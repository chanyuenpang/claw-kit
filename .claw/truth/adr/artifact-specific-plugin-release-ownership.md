# ADR: Artifact-specific plugin release ownership

## Status

Accepted

## Context

The former repository-level release skill accumulated CLI and every plugin's
packaging, publication, rollback, and installation rules. Those artifact
families have distinct versioning, release targets, verification evidence, and
post-release update behavior. Cindy now distributes its committed plugin tree
through the repository custom marketplace and a versioned `vcindy-*` tag;
treating it as a generic plugin or a CLI release risks mixing unrelated source
and acceptance boundaries.

The Cindy update surface also cannot use repository-wide latest-release
selection because a newer release can belong to another artifact family.

## Decision

- Keep `release-claw-kit` as a selection-only router.
- Give the CLI, Codex, Cindy, OpenClaw, and OpenCode artifact families separate
  repository-maintainer release skills with independent templates and
  fallbacks.
- Route testing, local packaging, and dry-run work to `test-claw-kit` unless
  publication authority is explicit.
- Give Cindy release ownership to `release-cindy-plugin`: verify the committed
  `claw-kit-cindy` marketplace entry and target manifest before pushing the
  matching `vcindy-*` tag; do not build an archive or create a GitHub Release.
- Make the Cindy update skill refresh the unpinned custom Git marketplace and
  use Cindy's confirmation-gated local packaging/install action; keep CLI
  refresh and confirmed enabled/running plugin state as the two required
  update surfaces.

## Alternatives considered

- Keep one combined release skill with per-platform rule files. Rejected because
  the entry contract would still own incompatible artifact and verification
  boundaries.
- Use a GitHub Release or prebuilt `.cindy` asset for Cindy update. Rejected
  because the current distribution owner is the repository marketplace and
  Cindy already packages verified source locally.

## Consequences

- Maintainers get a smaller, artifact-scoped release contract and cannot
  accidentally treat a platform request as CLI release authority.
- Cindy release completion is proven by the tagged marketplace source and
  manifest version, while local installation remains an opt-in follow-up
  workflow.
- Cindy users cannot mistake a refreshed marketplace cache for an activated
  plugin: confirmation plus enabled/running-version checks remain required.

<!-- state: history -->
## Decision evolution

<!-- dated: 2026-08-02 -->
### Replaced prebuilt Cindy installer distribution

The earlier decision used an immutable GitHub Release asset and retained one
local rollback archive. `vcindy-0.2.8.2` moved the distribution boundary to the
committed repository marketplace, where Cindy performs local packaging during
install/update. The former asset contract remains historical evidence only.

## Related code

- `.agents/skills/release-claw-kit/SKILL.md`
- `.agents/skills/release-cindy-plugin/`
- `packages/cindy-adapter/plugin/skills/update/`

## Search terms

- `release router artifact family`
- `claw-kit-cindy marketplace`
- `Cindy custom marketplace update`
