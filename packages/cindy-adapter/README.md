# Cindy adapter

This package is the Cindy-specific landing surface for the `claw-kit` workflow.

The Cindy plugin is a workflow command gateway with Skills plus declared runtime hooks.
The `claw` CLI remains a separate user-installed dependency; it is not bundled
into the plugin.

## Scope

- The plugin distribution surface contains Skills, `subscribe` hooks, a typed
  Agent Tool gateway, trusted `session-context`, and narrowly declared
  `node`/background `agent` capabilities.
- The `claw` CLI remains a separate installation and upgrade surface.
- The Cindy adapter is local-workspace-only in the first version.
- Cindy Desktop Host provides the lifecycle dispatcher for plugin-declared
  Ghost hooks; no Cindy source modification is required.
- Each workflow operation updates its own Ghost call card from canonical plan
  data: title, goal, completed/total tasks, and the next task. This is a
  one-way presentation projection, not a second workflow store.
- Cindy's native progress/Todo UI may be reused as a presentation aid later,
  but bidirectional Todo or Goal synchronization is not a first-version
  requirement.

## Current design baseline

See [Cindy adapter design](references/cindy-adapter-design.md) for the confirmed
workflow, failure policy, permission boundary, and acceptance scenarios.

The installable Ghost source is under [plugin](plugin). It bundles the
`using-claw-kit` and `knowledge-writer` Skills plus the runtime hook entry.
The plugin covers local session-start recovery, first-message context injection,
structured Agent Tool calls that execute workflow commands with Cindy-owned host
and session identity, and a live workflow card updated by those Tool calls. It
does not poll `claw context` at turn end. Native Cindy Goal/Progress projection
remains capability-gated until Cindy exposes a stable public plugin API.
