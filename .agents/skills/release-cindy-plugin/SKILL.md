---
name: release-cindy-plugin
description: Release the claw-kit Cindy adapter as a vcindy GitHub Release with an installable .cindy asset. Use only when the repository owner explicitly asks to publish or release the Cindy plugin.
---
# Release Cindy plugin

Run only inside the claw-kit repository. This skill owns only
`packages/cindy-adapter` and the `vcindy-*` GitHub Release artifact.

Resolve `<skill-dir>` as this file's directory. For a whole release, create the
plan with `claw plan create --template-file "<skill-dir>/TEMPLATE.json" --title
"release-cindy-plugin"`. For an independent stage of an authorized batch, use
the template as a subplan. If claw planning is unavailable, follow `FALLBACK.md`.

Read `references/artifact.md` completely before editing or packaging. Require
explicit release authority; local packaging or testing belongs to
`test-claw-kit`. Never change CLI/core or another adapter version, and never
publish npm packages.

The GitHub Release must contain the matching `.cindy` installer asset. Build and
verify the target package before pruning old local artifacts. After verification,
keep the target plus at most one immediately older package as rollback; delete
all other matching build outputs. Installation refresh is a separate boundary.
