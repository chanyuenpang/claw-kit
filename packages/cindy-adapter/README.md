# Cindy adapter

This package is the Cindy-specific landing surface for the `claw-kit` workflow.

The Cindy plugin is a workflow command gateway with Skills plus declared runtime hooks.
The `claw` CLI remains a separate user-installed dependency; it is not bundled
into the plugin.

## Scope

- The plugin distribution surface contains Skills, `subscribe` hooks, a typed
  Agent Tool gateway, trusted `session-context`, and narrowly declared
  `node` and background `agent` capabilities.
- The `claw` CLI remains a separate installation and upgrade surface.
- The Cindy adapter is local-workspace-only in the first version.
- Cindy Desktop Host provides the lifecycle dispatcher for plugin-declared
  Ghost hooks. User-facing Orca Lead sessions remain eligible for ordinary
  Ghost lifecycle hooks while Workers are excluded; that Host fix is independent
  of the subagent knowledge path, which does not require a Stop hook.
- `plan.create`, `plan.resume`, and `plan.done` create a Ghost progress card;
  later task and plan mutations update the current session card from canonical
  plan data: title, goal, completed/total tasks, and the next task. This is a
  one-way presentation projection, not a second workflow store.
- Cindy's native progress/Todo UI remains presentation-only. Goal-mode
  continuation is implemented inside the Ghost Hook: `.claw` stays canonical,
  and an active plan may queue one background `agent.run` continuation after
  each completed assistant turn.

## Current design baseline

See [Cindy adapter design](references/cindy-adapter-design.md) for the confirmed
workflow, failure policy, permission boundary, and acceptance scenarios.

The installable Ghost source is under [plugin](plugin). It bundles the
declared workflow Skills plus the runtime hook entry. Cindy normalizes either
configured knowledge execution policy to `subagent`; the active Lead pre-dispatches one
persistent, sidebar-visible Orca `knowledge-finalizer` Worker after the terminal
mutation has created the durable job. The Worker calls the plugin's atomic
`knowledge.claim`, which captures the originating Cindy task conclusions into
the adjacent report before issuing a token, executes the canonical assignments,
and acknowledges completion through `knowledge.done`. Cindy does not use an
errand or a Stop hook for knowledge finalization; legacy background jobs are
diagnostic-only and are not launched.
The plugin starts `auto-claw`, cleanup, and embedding warmup asynchronously
from `did-session-created`. `will-user-message` performs only a non-blocking
cache lookup: it leaves the message unchanged unless a completed background
run produced an actionable diagnostic or recovery prompt. It provides structured Agent Tool calls that execute workflow commands with
Cindy-owned host and session identity, and maintains a live workflow card
updated by those Tool calls. It does not recover a plan during session creation
or poll `claw context` at turn end. The Ghost Hook consumes the latest
typed plan projection to emulate Goal Mode without requiring a native Cindy
Goal API; paused, discussing, completed, and closed plans stop continuation.
The continuation guard keys retries by the current task id, resets when that
id advances, and pauses the plan after two unsuccessful attempts on one task.
