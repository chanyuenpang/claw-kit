---
name: release-codex-plugin
description: Release the claw-kit Codex adapter and official GitHub marketplace snapshot. Use only when the repository owner explicitly asks to publish or release the Codex plugin or a vcodex version.
---
# Release Codex plugin

Run only inside the claw-kit repository. This skill owns only
`packages/codex-adapter` and the committed Codex marketplace metadata.

Resolve `<skill-dir>` as this file's directory. For a whole release, create the
plan with `claw plan create --template-file "<skill-dir>/TEMPLATE.json" --title
"release-codex-plugin"`. For an independent stage of an authorized batch, use
the template as a subplan. If claw planning is unavailable, follow `FALLBACK.md`.

Read `references/artifact.md` before editing. Require explicit release authority;
package-only or verification-only work belongs to `test-claw-kit`. Never change
CLI/core or another adapter version, publish npm packages, or attach a plugin ZIP.
Refresh the maintainer installation only when separately requested and only from
the published GitHub source.
