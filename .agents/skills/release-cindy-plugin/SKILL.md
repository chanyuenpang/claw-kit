---
name: release-cindy-plugin
description: Handoff Cindy adapter releases to the independent claw-kit-cindy-adapter marketplace repository. Use only when the repository owner explicitly asks to publish or release the Cindy plugin.
---
# Release Cindy plugin

## Candidate preparation versus promotion

Each new installable candidate allocates a fresh formal target number under this artifact family’s existing three-/four-segment rules; local unpublished/preparing candidates count as used. Use `beta:prepare -- --artifacts <selected-families>`, commit the prepared manifests locally, then `beta:pack -- --candidate <directory>`. No beta suffix is added. A failed same-input preparation may resume; a frozen candidate is reused, not rebuilt.

A tested candidate takes precedence over all bump/build/export instructions below: promotion preserves its exact version and frozen tgz/tree, consumes the candidate hash and trial, and performs zero workspace rebuild/pack/export. DSH npm mapping remains `<cli-base>-rc.<N>` in both testing and formal publication. Formal release authority does not arise from candidate preparation. See `docs/beta-release.md` for the shared contract.


The Cindy adapter source is owned by `packages/cindy-adapter` in the main
claw-kit repository. The existing independent marketplace repository
`https://github.com/chanyuenpang/claw-kit-cindy-adapter` is an artifact-only
delivery target, not a source submodule. Build the complete flat plugin with
`npm run export:cindy-plugin -- --output-root <fresh-artifact-root>`; never
copy generated skills back into source or publish the incomplete source subtree.

Independent distribution does **not** create an independent version line.
Before editing Cindy, resolve the CLI base version: use the authorized CLI
candidate in a multi-artifact release, or the currently published
`@veewo/claw` version for a Cindy-only release. Set both Cindy manifests to
`<cli-base>.<next-fourth-segment>`. Derive only the fourth segment from prior
`vcindy-<cli-base>.*` tags; never carry forward the first three segments from
an older Cindy tag. Stop if the CLI base is not known or the resulting manifest
does not share its first three segments.

Follow `packages/cindy-adapter/RELEASING.md`. Commit/review the intended source
in main claw-kit, assemble from that exact revision, and verify the detached
artifact. Only with publication authorization, deliver that complete tree to
the independent artifact repository's `main`, then tag its artifact commit
with immutable `vcindy-*`. Record source revision and artifact hash separately.
The artifact repository owns the published tag and Cindy-only marketplace. Do not build or upload
a `.cindy` archive for marketplace installation; custom-marketplace refresh,
permission review, installation/update, and enabled-runtime verification are a
separate boundary.
