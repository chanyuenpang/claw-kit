---
name: release-cindy-plugin
description: Handoff Cindy adapter releases to the independent claw-kit-cindy-adapter marketplace repository. Use only when the repository owner explicitly asks to publish or release the Cindy plugin.
---
# Release Cindy plugin

The Cindy adapter is independently released from
`https://github.com/chanyuenpang/claw-kit-cindy-adapter`. Do not modify the
main claw-kit repository for a Cindy-only release.

Open that repository, follow its `RELEASING.md`, and release only there. The
adapter repository owns the `vcindy-*` tag, its Cindy-only marketplace manifest,
and focused adapter verification. Do not build or upload a `.cindy` archive for
marketplace installation; installation refresh is a separate boundary.
