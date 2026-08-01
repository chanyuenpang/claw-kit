# Codex plugin release contract

- Scope: `packages/codex-adapter` and `.agents/plugins/marketplace.json` only.
- Bump only the adapter fourth segment; keep CLI/core and other adapters unchanged.
- Keep `.codex-plugin/plugin.json` equal to the adapter package version.
- Synchronize templates/shared skills, verify the exported marketplace payload,
  and review the complete diff.
- Require clean `main`, `HEAD == origin/main`, `npm run verify:release`, tag
  `vcodex-<version>`, and a GitHub Release.
- The immutable committed Git ref is the plugin artifact; do not attach a ZIP and
  do not publish npm packages.
- Refresh the maintainer installation only when separately requested, after the
  GitHub source is verified.
