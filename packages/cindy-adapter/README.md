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
declared workflow Skills plus the runtime hook entry. Knowledge closeout is
handled by the private worker operation and does not require exposing a
separate Agent-facing Skill.
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
