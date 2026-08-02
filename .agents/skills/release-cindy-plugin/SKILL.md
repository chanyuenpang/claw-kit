---
name: release-cindy-plugin
description: Release the claw-kit Cindy adapter through the repository custom marketplace and a vcindy tag. Use only when the repository owner explicitly asks to publish or release the Cindy plugin.
---
# Release Cindy plugin

Run only inside the claw-kit repository. This skill owns only
`packages/cindy-adapter`, its repository marketplace entry, and the `vcindy-*`
tag.

Resolve `<skill-dir>` as this file's directory. For a whole release, create the
plan with `claw plan create --template-file "<skill-dir>/TEMPLATE.json" --title
"release-cindy-plugin"`. For an independent stage of an authorized batch, use
the template as a subplan. If claw planning is unavailable, follow `FALLBACK.md`.

Read `references/artifact.md` completely before editing or packaging. Require
explicit release authority; local packaging or testing belongs to
`test-claw-kit`. Never change CLI/core or another adapter version, and never
publish npm packages.

The committed repository marketplace is the Cindy distribution source. Do not
build or upload a `.cindy` archive and do not create a GitHub Release for the
adapter. Verify the marketplace entry and plugin tree before pushing the
`vcindy-*` tag. Installation refresh is a separate boundary.
