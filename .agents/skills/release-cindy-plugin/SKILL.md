---
name: release-cindy-plugin
description: Handoff Cindy adapter releases to the independent claw-kit-cindy-adapter marketplace repository. Use only when the repository owner explicitly asks to publish or release the Cindy plugin.
---
# Release Cindy plugin

The Cindy adapter is independently released from
`https://github.com/chanyuenpang/claw-kit-cindy-adapter`. Its checked-out
`packages/cindy-adapter` submodule is the normal local worktree for that
repository; do not require or create a second parallel clone. Do not modify
the main claw-kit repository for a Cindy-only release.

Open that repository (normally the submodule), follow its `RELEASING.md`, and
release only there. Classify and commit the intended adapter changes on its
`main`, push `origin/main`, then create and push the immutable `vcindy-*` tag
at that exact commit. The adapter repository owns the tag, its Cindy-only
marketplace manifest, and focused adapter verification. Do not build or upload
a `.cindy` archive for marketplace installation; custom-marketplace refresh,
permission review, installation/update, and enabled-runtime verification are a
separate boundary.
