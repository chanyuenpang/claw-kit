---
name: release-codex-plugin
description: Release the claw-kit Codex adapter and official GitHub marketplace snapshot. Use only when the repository owner explicitly asks to publish or release the Codex plugin or a vcodex version.
---
# Release Codex plugin

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
