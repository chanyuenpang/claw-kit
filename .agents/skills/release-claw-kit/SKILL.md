---
name: release-claw-kit
description: Route an explicit claw-kit release request to the one artifact-specific release skill. Use when the user says release claw-kit without clearly naming CLI, Codex, Cindy, OpenClaw, or OpenCode, or when an authorized batch spans multiple artifact families.
---
# Release claw-kit router

This skill routes only; it does not change versions, build, commit, push, tag,
publish, or install artifacts.

Choose exactly one artifact skill from the user's named product and changed
scope:

- CLI, core, npm, or a three-segment version: `release-claw-cli`
- Codex plugin or `vcodex-*`: `release-codex-plugin`
- Cindy plugin or `vcindy-*`: `release-cindy-plugin`
- OpenClaw plugin or `vopenclaw-*`: `release-openclaw-plugin`
- OpenCode plugin or `vopencode-*`: `release-opencode-plugin`

A platform request never selects the CLI flow. If the request is ambiguous, ask
which artifact family to release. If multiple families are explicitly authorized,
create one parent task per family and invoke each artifact skill as an independent
subplan. Packaging, testing, export, or dry-run without publish authority routes
to `test-claw-kit`, not a release skill.
