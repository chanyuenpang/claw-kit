# OpenClaw plugin release contract

## Candidate preparation versus promotion

Each new installable candidate allocates a fresh formal target number under this artifact family’s existing three-/four-segment rules; local unpublished/preparing candidates count as used. Use `beta:prepare -- --artifacts <selected-families>`, commit the prepared manifests locally, then `beta:pack -- --candidate <directory>`. No beta suffix is added. A failed same-input preparation may resume; a frozen candidate is reused, not rebuilt.

A tested candidate takes precedence over all bump/build/export instructions below: promotion preserves its exact version and frozen tgz/tree, consumes the candidate hash and trial, and performs zero workspace rebuild/pack/export. DSH npm mapping remains `<cli-base>-rc.<N>` in both testing and formal publication. Formal release authority does not arise from candidate preparation. See `docs/beta-release.md` for the shared contract.


- Scope: `packages/openclaw-adapter` only.
- Bump only the adapter fourth segment; keep CLI/core and other adapters unchanged.
- Keep its `@veewo/claw-core` dependency pinned exactly to the current CLI version.
- Keep `openclaw.plugin.json` aligned with the adapter version, declare the
  `skills` root, and verify the full `claw-kit-doc` payload before release.
- Run focused OpenClaw checks, synchronize required generated content, and review
  the full diff.
- Require clean `main`, `HEAD == origin/main`, `npm run verify:release`, tag
  `vopenclaw-<version>`, and the matching GitHub Release.
- Do not publish npm packages or refresh another platform installation.
