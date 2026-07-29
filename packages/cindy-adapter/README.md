# Cindy adapter

This package is the Cindy-specific landing surface for the `claw-kit` workflow.

The first version is intentionally documentation-first. It preserves the agreed
adapter contract before Cindy Host integration code is added.

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

Runtime implementation is intentionally pending verification of the Cindy Host
plugin hook and subagent interfaces.
