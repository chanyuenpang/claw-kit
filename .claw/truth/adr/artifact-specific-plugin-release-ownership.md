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
- When one authorized request names multiple artifact families, keep each family
  in its own parent task or subplan with its own version, exact-source commit,
  tag/release shape, and terminal acceptance gate. One family's success or
  version baseline does not complete or select another family.
- Route testing, local packaging, and dry-run work to `test-claw-kit` unless
  publication authority is explicit.
- Give Cindy release ownership to release-cindy-plugin: maintain source in the main repository, assemble a complete detached ./plugin marketplace, and publish only that artifact to the existing claw-kit-cindy-adapter remote. Preserve its market URL and vcindy-* versioned delivery; never copy generated skills back into source. No archive or GitHub Release is required. Source commit, artifact commit and installed activation are distinct proof boundaries.
- Do not publish a Cindy-specific update skill through Cindy's
  cross-application skill slot. Keep existing workflow entries unchanged in
  this update-only decision. Keep Cindy's documentation route without adding an update registration;
  entry ownership now follows the [shared-source decision](<shared-planning-skill-source.md>).
  The complete multi-host documentation selects the actual host and directs
  users through Plugins → Market → Installed Markets → refresh, then back to
  Plugins for the confirmation-gated update.

## Alternatives

- Keep one combined release skill with per-platform rule files. Rejected because
  the entry contract would still own incompatible artifact and verification
  boundaries.
- Use a GitHub Release or prebuilt `.cindy` asset for Cindy update. Rejected
  because the current distribution owner is the repository marketplace and
  Cindy already packages verified source locally.

- Keep Cindy source independent and choose a new artifact Git target/ref: rejected in favor of main-repository source consolidation and the existing artifact remote, avoiding a marketplace URL migration.
- Treat local source migration/export as publication: rejected; the implemented migration did not alter remote history or activate a host.

## Consequences

- Maintainers get a smaller, artifact-scoped release contract and cannot
  accidentally treat a platform request as CLI release authority.
- A multi-family release can be coordinated in one parent plan without merging
  artifact ownership, terminal evidence, or failure handling.
- Cindy release completion is proven by the tagged marketplace source and
  manifest version, while local installation remains an opt-in follow-up
  workflow.
- Cindy users cannot mistake a refreshed marketplace cache for an activated
  plugin: the documentation separates market refresh from the plugin-page
  confirmation and enabled/running-version checks.

<!-- state: history -->
## Decision evolution

<!-- dated: 2026-10-01 -->
### Source consolidation without remote publication

Cindy was formerly an independent source submodule. Source is now main-repository-owned while the existing remote is reserved for artifact-only delivery. Original Git metadata was preserved; the ownership change did not authorize or perform publication. Keeping the market URL avoids an installation migration while separating authoring from complete Git delivery.

<!-- dated: 2026-08-05 -->
### Removed the Cindy-only updater from the global skill slot

Cindy publishes enabled Ghost skill items through the cross-application user
skill root. Keeping the Cindy-specific updater there leaked the wrong update
route into standalone Codex, so that entry was removed while existing workflow
entries remain unchanged. Update execution now stays in Cindy's plugin UI.

<!-- dated: 2026-08-02 -->
### Replaced prebuilt Cindy installer distribution

The earlier decision used an immutable GitHub Release asset and retained one
local rollback archive. `vcindy-0.2.8.2` moved the distribution boundary to the
committed repository marketplace, where Cindy performs local packaging during
install/update. The former asset contract remains historical evidence only.

<!-- dated: 2026-08-03 -->
### Clarified the independent Cindy source repository release order

The checked-out Cindy submodule is the independent marketplace repository worktree. Its `main` must be committed and pushed before the matching `vcindy-*` tag is created; this source-release proof does not include installation.

## Related code

- `.agents/skills/release-claw-kit/SKILL.md`
- `.agents/skills/release-cindy-plugin/`
- [Documentation source](<../../../.agents/skills/claw-kit-doc/references/update.md>)
- [Artifact builder](<../../../scripts/cindy-plugin-artifact.mjs>)

## Search terms

- `release router artifact family`
- `claw-kit-cindy marketplace`
- `Cindy custom marketplace update`
