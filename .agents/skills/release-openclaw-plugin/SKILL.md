---
name: release-openclaw-plugin
description: Release the claw-kit OpenClaw adapter and its vopenclaw GitHub artifact. Use only when the repository owner explicitly asks to publish or release the OpenClaw plugin.
---
# Release OpenClaw plugin

Run only inside the claw-kit repository. This skill owns only
`packages/openclaw-adapter`.

Resolve `<skill-dir>` as this file's directory. For a whole release, create the
plan with `claw plan create --template-file "<skill-dir>/TEMPLATE.json" --title
"release-openclaw-plugin"`. For an authorized batch stage, use the template as a
subplan. If claw planning is unavailable, follow `FALLBACK.md`.

Read `references/artifact.md` before editing. Require explicit release authority;
package-only work belongs to `test-claw-kit`. Never change CLI/core or another
adapter version, publish npm packages, or refresh another platform installation.
