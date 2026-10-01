# Cindy plugin artifact delivery

- Source owner: main claw-kit repository, `packages/cindy-adapter`; no Git submodule.
- Artifact target: existing independent `chanyuenpang/claw-kit-cindy-adapter` repository; retain its marketplace URL and `claw-kit-cindy` identity.
- Version is not a separate three-segment version line. Resolve the authorized CLI candidate or published `@veewo/claw` version, and set package/Ghost manifests to `<cli-base>.<next-fourth>`.
- Build with `npm run export:cindy-plugin -- --output-root <fresh-artifact-root>` from reviewed source. The output includes `.agents/plugins/marketplace.json` with local `./plugin`, the unchanged Ghost runtime paths, six full skill resource packages and four registered skills, plus source/payload hashes.
- Shared skills are canonical inputs, not files to vendor into source. Build/validate the artifact before any publication.
- With explicit release authority, commit intended main-repository source and push main, then deliver the validated artifact to a separate checkout of artifact main, preserving its Git history. Tag the artifact commit `vcindy-<version>`; never force-move an existing tag. Source commit and artifact commit need not match; record both with the artifact hash.
- No .cindy archive, npm package or GitHub Release is required for Git marketplace installation.
- Refresh/permission review/install/activation is a separate authorized boundary. Installation does not prove the running host loaded the new version.
