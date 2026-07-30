# CLI artifact rule

- Scope: `packages/core`, `packages/cli`, or shared CLI/runtime changes.
- Version: one three-segment CLI version shared by root, core, and CLI.
- Reset every adapter to `<cli>.0`; pin CLI and OpenClaw core dependencies exactly.
- Synchronize templates and materialized shared skills, update the changelog and lockfile.
- Verify and publish `@veewo/claw-core` first, then `@veewo/claw`.
- Tag `v<cli-version>`; verify npm metadata/retrieval and the committed marketplace payload.
- Refresh the maintainer installation only when explicitly requested after publication.
