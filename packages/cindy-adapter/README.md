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
- Source is maintained in the main claw-kit repository. The existing
  `https://github.com/chanyuenpang/claw-kit-cindy-adapter.git` address remains
  the artifact-only Git marketplace, with `claw-kit-cindy` pointing to the
  assembled `plugin/`. Do not publish this incomplete source subtree directly.
- Cindy Desktop Host provides the lifecycle dispatcher for plugin-declared
  Ghost hooks. User-facing Orca Lead sessions remain eligible for ordinary
  Ghost lifecycle hooks while Workers are excluded; that Host fix is independent
  of the Orca Worker knowledge path, which does not require a Stop hook.
- `plan.create` creates the Ghost progress card; `plan.resume`, `plan.done`,
  and all later task and plan mutations update the current session card from canonical
  plan data: title, goal, completed/total tasks, and the next task. This is a
  one-way presentation projection, not a second workflow store.
- Cindy's native progress/Todo UI remains presentation-only. Goal-mode
  continuation is implemented inside the Ghost Hook: `.claw` stays canonical,
  and an active plan may queue one background `agent.run` continuation after
  each completed assistant turn.

## Updating in Cindy

Cindy does not expose an `update` Skill for claw-kit. Follow the Cindy section
in the canonical [claw-kit update reference](../../.agents/skills/claw-kit-doc/references/update.md)
for the plugin-page and installed-market refresh sequence.

## Current design baseline

See [Cindy adapter design](references/cindy-adapter-design.md) for the confirmed
workflow, failure policy, permission boundary, and acceptance scenarios.

The Ghost runtime source is under [plugin](plugin). Build the installable tree
with `npm run export:cindy-plugin -- --output-root <fresh-output-directory>`
from the main repository: it combines these unchanged runtime assets and the
declared canonical skill packages without writing generated source copies.
The artifact keeps the existing `plugin/skills/` and manifest paths. Cindy normalizes either
configured knowledge execution policy to the compatibility value `subagent`; the active
Lead pre-dispatches one persistent, sidebar-visible Orca `knowledge_finalizer` Worker after the terminal
mutation has created the durable job. The Worker creates the packaged session
delegate plan and calls the plugin's atomic `knowledge.claim`, which captures
the originating Cindy task conclusions into the adjacent report before issuing
a token. It executes the returned assignment template as a subplan and
acknowledges completion through `knowledge.done`. Cindy does not use an
errand or a Stop hook for knowledge finalization; legacy background jobs are
diagnostic-only and are not launched.
The Ghost Node worker owns a separate persistent CLI session transport per workdir/session ID. A successful `plan.done` releases that CLI after sending its response (including any knowledge-dispatch envelope), unless a newer request already began; quiescent unfinished-plan transports expire after 10 minutes without queued or running commands. The same session ID then reopens against retained CLI state. This does not stop the independent Orca finalizer Worker. `claw/session-transports` is a read-only worker RPC reporting workspace/session ID, direct child PID, active/idle/reclaiming state, pending count and close reason; `session-transport-*` events in the worker log record opens, exits and reclamation. `CLAW_CINDY_SESSION_IDLE_MS` may set a positive integer of at least 1000 ms for controlled tests or deployment tuning.
Cindy does not inject `additionalContext` into user messages. The plugin starts
session-state refresh, cleanup, and embedding warmup asynchronously from
`did-session-created`; it will reconsider prompt delivery only when a future
Cindy Host version supplies suitable trusted message context. It provides structured Agent Tool calls that execute workflow commands with
Cindy-owned host and session identity, and maintains a live workflow card
updated by those Tool calls. It does not recover a plan during session creation
or poll `claw context` at turn end. The Ghost Hook consumes the latest
typed plan projection to emulate Goal Mode without requiring a native Cindy
Goal API; paused, discussing, completed, and closed plans stop continuation.
The continuation guard keys retries by the current task id, resets when that
id advances, and pauses the plan after two unsuccessful attempts on one task.
