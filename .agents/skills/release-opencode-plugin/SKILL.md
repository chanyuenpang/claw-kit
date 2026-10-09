---
name: release-opencode-plugin
description: Release the claw-kit OpenCode adapter and its vopencode GitHub artifact. Use only when the repository owner explicitly asks to publish or release the OpenCode plugin.
---
# Release OpenCode plugin

## Candidate preparation versus promotion

Each new installable candidate allocates a fresh formal target number under this artifact family’s existing three-/four-segment rules; local unpublished/preparing candidates count as used. Use `beta:prepare -- --artifacts <selected-families>`, commit the prepared manifests locally, then `beta:pack -- --candidate <directory>`. No beta suffix is added. A failed same-input preparation may resume; a frozen candidate is reused, not rebuilt.

A tested candidate takes precedence over all bump/build/export instructions below: promotion preserves its exact version and frozen tgz/tree, consumes the candidate hash and trial, and performs zero workspace rebuild/pack/export. DSH npm mapping remains `<cli-base>-rc.<N>` in both testing and formal publication. Formal release authority does not arise from candidate preparation. See `docs/beta-release.md` for the shared contract.


Run only inside the claw-kit repository. This skill owns only
`packages/opencode-adapter`.

Resolve `<skill-dir>` as this file's directory. For a whole release, create the
plan with `claw plan create --template-file "<skill-dir>/TEMPLATE.json" --title
"release-opencode-plugin"`. For an authorized batch stage, use the template as a
subplan. If claw planning is unavailable, follow `FALLBACK.md`.

Read `references/artifact.md` before editing. Require explicit release authority;
package-only work belongs to `test-claw-kit`. Never change CLI/core or another
adapter version, publish npm packages, or refresh another platform installation.
