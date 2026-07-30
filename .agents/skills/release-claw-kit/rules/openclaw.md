# OpenClaw artifact rule

- Scope: `packages/openclaw-adapter`.
- Version: bump only the fourth segment of the OpenClaw adapter version; keep CLI/core and other adapters unchanged.
- Verify OpenClaw plugin source, exact core dependency pin, tests, and the selected release tag.
- Tag `vopenclaw-<adapter-version>` and create the GitHub release; do not publish npm packages.
- Do not refresh the Codex installation unless the user separately requests it.
