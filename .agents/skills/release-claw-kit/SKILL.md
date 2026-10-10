---
name: release-claw-kit
description: Route an explicit claw-kit release request to the one artifact-specific release skill. Use when the user says release claw-kit without clearly naming CLI, Codex, Cindy, OpenClaw, or OpenCode, or when an authorized batch spans multiple artifact families.
---
# Release claw-kit router

This skill routes only; it does not change versions, build, commit, push, tag,
publish, or install artifacts.

Local beta requests route to `beta-claw-kit`, which permits local main commits
but no push/publication. For formal promotion, read `docs/beta-release.md` and
pass the frozen candidate directory to the artifact skills. Preserve versions
and bytes; verify npm retrieval before any GitHub push.

Before routing beta or formal release, resolve the target CLI base and show all platforms' source, selected frozen, known-public versions and exact pins using docs/beta-release.md and npm run audit:release-versions. Partial beta is valid, but formal scope must be reconciled anew. Missing/stale authorized platforms need fresh preparation and freezing before promotion; never ship an older beta or publish an old CLI just to hide mismatch. Inventory unselected platforms and ask before expanding scope; do not automatically release them.

Choose exactly one artifact skill from the user's named product and changed
scope:

- CLI, core, npm, or a three-segment version: `release-claw-cli`
- Codex plugin or `vcodex-*`: `release-codex-plugin`
- Cindy plugin or `vcindy-*`: `release-cindy-plugin` (a handoff to the `claw-kit-cindy-adapter` repository); do not release it from this repository.
- DSH adapter or `vdsh-*`: `release-dsh-plugin`
- OpenClaw plugin or `vopenclaw-*`: `release-openclaw-plugin`
- OpenCode plugin or `vopencode-*`: `release-opencode-plugin`

A platform request never selects the CLI flow. If the request is ambiguous, ask
which artifact family to release. If multiple families are explicitly authorized,
create one parent task per family and invoke each artifact skill as an independent
subplan. Packaging, testing, export, or dry-run without publish authority routes
to `test-claw-kit`, not a release skill.
