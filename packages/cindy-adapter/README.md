# Cindy adapter

This package is the Cindy-specific landing surface for the `claw-kit` workflow.

The first version keeps the plugin distribution Skills-only. Cindy Host
lifecycle integration remains a separate Host-side implementation boundary.

## Scope

- The plugin distribution surface is Skills-only.
- The `claw` CLI remains a separate installation and upgrade surface.
- The Cindy adapter is local-workspace-only in the first version.
- Cindy Desktop Host provides the lifecycle dispatcher for plugin-declared hooks.
- Cindy's native progress/Todo UI may be reused as a presentation aid, but
  bidirectional Todo or Goal synchronization is not a first-version
  requirement.

## Current design baseline

See [Cindy adapter design](references/cindy-adapter-design.md) for the confirmed
workflow, failure policy, permission boundary, and acceptance scenarios.

The installable Ghost source is under [plugin](plugin). It bundles the
`using-claw-kit` Skill. The Cindy Desktop Host implementation now covers local
session-start CLI/context execution, first-message wire injection, fail-open
CLI guidance, `process.active` turn-end continuation, and a separate
`end.completed` knowledge-writer closeout turn.
