---
name: release-claw-cli
description: Release the claw-kit CLI and core npm packages. Use only when the repository owner explicitly asks to publish or release the CLI, core, npm packages, or a three-segment claw version.
---
# Release claw CLI

Run only inside the claw-kit repository. This skill owns the CLI/core artifact
family; it never publishes a platform adapter as an independent plugin release.

Resolve `<skill-dir>` as this file's directory. For a whole release, create the
plan with `claw plan create --template-file "<skill-dir>/TEMPLATE.json" --title
"release-claw-cli"`. For an independent stage of a broader authorized batch,
create the same template as a subplan. If claw planning is unavailable, follow
`FALLBACK.md`.

Read `references/artifact.md` before changing versions. Require explicit release
authority; packaging, testing, or dry-run requests belong to `test-claw-kit`.
Follow repository `AGENTS.md`, keep direct delivery on `main`, classify every
worktree change, and stop at the first failed release boundary.

Do not invoke a platform release skill unless the user explicitly authorizes that
additional artifact family. Resetting adapter versions to `<cli>.0` is part of
the CLI compatibility baseline, not permission to publish those adapters.
