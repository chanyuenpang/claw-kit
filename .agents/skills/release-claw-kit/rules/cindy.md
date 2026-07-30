# Cindy artifact rule

- Scope: `packages/cindy-adapter`.
- Version: bump only the fourth segment of the Cindy adapter version; keep CLI/core and other adapters unchanged.
- Verify Cindy plugin source, package metadata, tests, and the selected release tag.
- Tag `vcindy-<adapter-version>` and create the GitHub release; do not publish npm packages.
- Do not refresh the Codex installation unless the user separately requests it.
