# Cindy plugin artifact delivery

## Candidate preparation versus promotion

Each new installable candidate allocates a fresh formal target number under this artifact family’s existing three-/four-segment rules; local unpublished/preparing candidates count as used. Use `beta:prepare -- --artifacts <selected-families>`, commit the prepared manifests locally, then `beta:pack -- --candidate <directory>`. No beta suffix is added. A failed same-input preparation may resume; a frozen candidate is reused, not rebuilt.

A tested candidate aligned with the target CLI base takes precedence over bump/build/export instructions below: promotion preserves its exact version and frozen tgz/tree, consumes the candidate hash and trial, and performs zero workspace rebuild/pack/export. DSH npm mapping remains `<cli-base>-rc.<N>` in both testing and formal publication. Formal release authority does not arise from candidate preparation. See `docs/beta-release.md` for the shared contract.


- Source owner: main claw-kit repository, `packages/cindy-adapter`; no Git submodule.
- Artifact target: existing independent `chanyuenpang/claw-kit-cindy-adapter` repository; retain its marketplace URL and `claw-kit-cindy` identity.
- Version is not a separate three-segment version line. Resolve the authorized CLI candidate or published `@veewo/claw` version, and set package/Ghost manifests to `<cli-base>.<next-fourth>`.
- Build with `npm run export:cindy-plugin -- --output-root <fresh-artifact-root>` from reviewed source. The output includes `.agents/plugins/marketplace.json` with local `./plugin`, Ghost runtime paths, no bundled public skills, and an exact shared-package content contract. Cindy candidate packing freezes the separate shared skill tree and npm tarball in the same inventory.
- Shared skills are canonical inputs, not files to vendor into source. Build/validate the artifact before any publication.
- With explicit release authority, commit intended main-repository source and push main, then deliver the validated artifact to a separate checkout of artifact main, preserving its Git history. Tag the artifact commit `vcindy-<version>`; never force-move an existing tag. Source commit and artifact commit need not match; record both with the artifact hash.
- No .cindy archive or GitHub Release is required for Git marketplace installation. The matching @veewo/claw-skills tarball must be published and retrieved before the dependent plugin is delivered; this does not authorize CLI or other platform publication.
- Refresh/permission review/install/activation is a separate authorized boundary. Installation does not prove the running host loaded the new version.
