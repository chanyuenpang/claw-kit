# Codex artifact rule

- Scope: `packages/codex-adapter`.
- Version: bump only the fourth segment of the adapter version; keep the CLI/core version unchanged.
- Keep `.codex-plugin/plugin.json` equal to the adapter package version.
- Verify the materialized marketplace payload and `.agents/plugins/marketplace.json` source path.
- Tag `vcodex-<adapter-version>` and create the GitHub release; do not publish npm packages.
- Refresh the maintainer installation only after the published GitHub source is verified and only when requested.
