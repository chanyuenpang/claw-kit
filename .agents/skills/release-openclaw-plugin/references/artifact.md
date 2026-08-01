# OpenClaw plugin release contract

- Scope: `packages/openclaw-adapter` only.
- Bump only the adapter fourth segment; keep CLI/core and other adapters unchanged.
- Keep its `@veewo/claw-core` dependency pinned exactly to the current CLI version.
- Run focused OpenClaw checks, synchronize required generated content, and review
  the full diff.
- Require clean `main`, `HEAD == origin/main`, `npm run verify:release`, tag
  `vopenclaw-<version>`, and the matching GitHub Release.
- Do not publish npm packages or refresh another platform installation.
