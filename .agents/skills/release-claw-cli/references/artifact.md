# CLI release contract

- Scope: root `package.json`, `packages/core`, `packages/cli`, shared CLI/runtime
  code, lockfile, synchronized templates/shared skills, and compatibility version
  resets required by the CLI baseline.
- Version: one three-segment version shared by root, `@veewo/claw-core`, and
  `@veewo/claw`. Pin core exactly from CLI and OpenClaw.
- Reset every adapter version to `<cli>.0`; this does not publish an adapter.
- Publish `@veewo/claw-core` before `@veewo/claw`, then create tag `v<version>`
  and the GitHub Release.
- Before publishing, require clean `main`, `HEAD == origin/main`, focused checks,
  package dry-runs, `npm run verify:release`, and reviewed release diff.
- After publishing, verify npm metadata and real retrieval for both packages.
  Never reuse an already-published version or force-move an existing tag.
- Refresh local installations only when separately requested and only from the
  published npm/GitHub artifacts.
