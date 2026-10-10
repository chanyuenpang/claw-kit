---
name: release-codex-plugin
description: Release the claw-kit Codex adapter and official GitHub marketplace snapshot. Use only when the repository owner explicitly asks to publish or release the Codex plugin or a vcodex version.
---
# Release Codex plugin

## Mandatory version reconciliation

Before selecting any beta or formal candidate, read docs/beta-release.md and resolve the target CLI base and authorized families. Run npm run audit:release-versions with --phase beta|release, --artifacts <authorized-families>, and each frozen --candidate when applicable. Show source/candidate/known-public versions and exact CLI pins for all families. A selected platform with a missing/stale candidate needs fresh latest-source preparation and freezing at that base before promotion; never relabel frozen artifacts or publish an older CLI to disguise mismatch. Other platforms are inventory only until scope expansion is authorized. Each new candidate requires its own trial or explicit owner waiver.

## Candidate preparation versus promotion

Each new installable candidate allocates a fresh formal target number under this artifact family’s existing three-/four-segment rules; local unpublished/preparing candidates count as used. Use `beta:prepare -- --artifacts <selected-families>`, commit the prepared manifests locally, then `beta:pack -- --candidate <directory>`. No beta suffix is added. A failed same-input preparation may resume; a frozen candidate is reused, not rebuilt.

A tested candidate aligned with the target CLI base takes precedence over bump/build/export instructions below: promotion preserves its exact version and frozen tgz/tree, consumes the candidate hash and trial, and performs zero workspace rebuild/pack/export. DSH npm mapping remains `<cli-base>-rc.<N>` in both testing and formal publication. Formal release authority does not arise from candidate preparation. See `docs/beta-release.md` for the shared contract.


## Promoting a tested beta

For a supplied candidate, follow `docs/beta-release.md`. Preserve its version and
`artifacts/marketplace` tree; skip bumps and export/build steps in this template.
Verify hashes, seven-day trial and source revision. Require matching CLI npm
retrieval before any GitHub push; publish the stored tree to the existing immutable
artifact tag and compare its files against the candidate. A beta request itself
authorizes no remote writes.

Run only inside the claw-kit repository. This skill owns only
`packages/codex-adapter`, its declared canonical skill inputs, and Codex
marketplace packaging metadata. Skills are assembled into the existing flat
plugin layout only at build time, never synchronized back into source.

Resolve `<skill-dir>` as this file's directory. For a whole release, create the
plan with `claw plan create --template-file "<skill-dir>/TEMPLATE.json" --title
"release-codex-plugin"`. For an independent stage of an authorized batch, use
the template as a subplan. If claw planning is unavailable, follow `FALLBACK.md`.

Read `references/artifact.md` before editing. Require explicit release authority;
package-only or verification-only work belongs to `test-claw-kit`. Never change
CLI/core or another adapter version, publish npm packages, or attach a plugin ZIP.
Refresh the maintainer installation only when separately requested and only from
the published GitHub source.
