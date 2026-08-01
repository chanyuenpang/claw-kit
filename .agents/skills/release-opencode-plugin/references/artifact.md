# OpenCode plugin release contract

- Scope: `packages/opencode-adapter` only.
- Bump only the adapter fourth segment; keep CLI/core and other adapters unchanged.
- Build and verify the OpenCode plugin payload, synchronize required generated
  content, and review the full diff.
- Require clean `main`, `HEAD == origin/main`, `npm run verify:release`, tag
  `vopencode-<version>`, and the matching GitHub Release.
- Do not publish npm packages or refresh another platform installation.
