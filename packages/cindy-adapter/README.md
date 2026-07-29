# Cindy adapter

This package is the Cindy-specific landing surface for the `claw-kit` workflow.

The first version is a Ghost plugin with Skills plus declared runtime hooks.
The `claw` CLI remains a separate user-installed dependency; it is not bundled
into the plugin.

## Scope

- The plugin distribution surface contains Skills, `subscribe` hooks, and the
  narrowly declared `node`/background `agent` capabilities needed to mirror
  the existing Codex/OpenCode adapters.
- The `claw` CLI remains a separate installation and upgrade surface.
- The Cindy adapter is local-workspace-only in the first version.
- Cindy Desktop Host provides the lifecycle dispatcher for plugin-declared
  Ghost hooks; no Cindy source modification is required.
- Cindy's native progress/Todo UI may be reused as a presentation aid, but
  bidirectional Todo or Goal synchronization is not a first-version
  requirement.

## Current design baseline

See [Cindy adapter design](references/cindy-adapter-design.md) for the confirmed
workflow, failure policy, permission boundary, and acceptance scenarios.

The installable Ghost source is under [plugin](plugin). It bundles the
`using-claw-kit` and `knowledge-writer` Skills plus the runtime hook entry.
The plugin now covers local
session-start CLI/context execution, first-message wire injection, fail-open
CLI guidance, `process.active` turn-end continuation, and a separate
`end.completed` knowledge-writer closeout turn.
