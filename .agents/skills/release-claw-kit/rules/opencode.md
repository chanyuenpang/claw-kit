# OpenCode artifact rule

- Scope: `packages/opencode-adapter`.
- Version: bump only the fourth segment of the OpenCode adapter version; keep CLI/core and other adapters unchanged.
- Verify OpenCode plugin source, tests, and the selected release tag.
- Tag `vopencode-<adapter-version>` and create the GitHub release; do not publish npm packages.
- Do not refresh the Codex installation unless the user separately requests it.
