---
name: release-claw-cli
description: Release the claw-kit CLI and core npm packages. Use only when the repository owner explicitly asks to publish or release the CLI, core, npm packages, or a three-segment claw version.
---
# Release claw CLI

## Mandatory version reconciliation

Before selecting any beta or formal candidate, read docs/beta-release.md and resolve the target CLI base and authorized families. Run npm run audit:release-versions with --phase beta|release, --artifacts <authorized-families>, and each frozen --candidate when applicable. Show source/candidate/known-public versions and exact CLI pins for all families. A selected platform with a missing/stale candidate needs fresh latest-source preparation and freezing at that base before promotion; never relabel frozen artifacts or publish an older CLI to disguise mismatch. Other platforms are inventory only until scope expansion is authorized. Each new candidate requires its own trial or explicit owner waiver.

## Candidate preparation versus promotion

Each new installable candidate allocates a fresh formal target number under this artifact family’s existing three-/four-segment rules; local unpublished/preparing candidates count as used. Use `beta:prepare -- --artifacts <selected-families>`, commit the prepared manifests locally, then `beta:pack -- --candidate <directory>`. No beta suffix is added. A failed same-input preparation may resume; a frozen candidate is reused, not rebuilt.

A tested candidate aligned with the target CLI base takes precedence over bump/build/export instructions below: promotion preserves its exact version and frozen tgz/tree, consumes the candidate hash and trial, and performs zero workspace rebuild/pack/export. DSH npm mapping remains `<cli-base>-rc.<N>` in both testing and formal publication. Formal release authority does not arise from candidate preparation. See `docs/beta-release.md` for the shared contract.


## Beta promotion

Follow `docs/beta-release.md` with the tested candidate directory. Preserve its
version and source commit; skip new version bumps, builds and packing. After
seven days run `verify:release -- --candidate <dir>` and
`publish:release -- --candidate <dir>`. This publishes the exact tarballs before
pushing source main. Finish immutable source tags and GitHub Release verification.
If no aligned beta exists, prepare it with beta-claw-kit and wait for its own trial or an explicitly recorded owner waiver before publication.

Run only inside the claw-kit repository. This skill owns the CLI/core artifact
family; it never publishes a platform adapter as an independent plugin release.

Resolve `<skill-dir>` as this file's directory. For a whole release, create the
plan with `claw plan create --template-file "<skill-dir>/TEMPLATE.json" --title
"release-claw-cli"`. For an independent stage of a broader authorized batch,
create the same template as a subplan. If claw planning is unavailable, follow
`FALLBACK.md`.

Read `references/artifact.md` before changing versions. Require explicit release
authority; packaging, testing, or dry-run requests belong to `test-claw-kit`.
Follow repository `AGENTS.md`, keep direct delivery on `main`, classify every
worktree change, and stop at the first failed release boundary.

Do not invoke a platform release skill unless the user explicitly authorizes that
additional artifact family. Resetting adapter versions to `<cli>.0` is part of
the CLI compatibility baseline, not permission to publish those adapters.
