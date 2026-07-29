# Cindy adapter design baseline

Status: decision baseline, 2026-07-29

This document records the agreed Cindy migration contract and the current
implementation boundary. It is the source of truth for the first adapter pass.

## 1. Adapter boundary

Hook logic belongs to the `claw-kit` platform-adapter layer. Cindy should not
turn the hook into a Skill-only approximation.

The first Cindy integration uses this split:

1. The Cindy plugin declares the claw lifecycle hooks and carries the Cindy-side
   adapter logic.
2. Cindy Desktop Host exposes a generic lifecycle dispatcher and invokes the
   declared hooks.
3. The claw CLI remains outside the plugin and is checked or initialized by
   `claw init` / `claw context`.

The plugin must not automatically install the CLI, write PATH entries, or
modify the user's environment.

The first installable plugin package contains only Skills: `using-claw-kit`
and the explicitly dispatched `knowledge-writer`. Cindy Host lifecycle
changes are not hidden in those Skills and remain a separate Host
implementation task.

## 2. First-version scope

- Support local workspaces only.
- Start with workflow integration; do not build a task panel.
- Cindy's native progress/Todo presentation may be used as a Host-side execution
  aid when available, but claw does not require bidirectional Todo
  synchronization.
- Goal synchronization is optional and is not a correctness dependency; claw's
  plan remains the canonical workflow state.
- The adapter remains useful when lifecycle hooks are unavailable because the
  CLI and Skills remain the canonical workflow surfaces.

### Native Cindy progress and Goal are different surfaces

Cindy's visible progress checklist and its native Goal controller should not be
treated as one shared Todo API:

- Progress is a presentation/execution checklist for the current conversation.
- Goal is a Host-owned continuation controller with active, paused, blocked,
  complete, and budget-limited states, plus turn-end guards and follow-up
  dispatch.
- The current GoalController is an internal Desktop capability, not yet a
  stable third-party plugin persistence API.

The adapter should therefore use a one-way projection only when Cindy exposes a
supported Host API:

`claw plan (source of truth) -> Cindy progress/Goal presentation (optional)`

Cindy progress or Goal state must not be allowed to mutate the canonical claw
plan implicitly. The Host adapter may reuse the GoalController's continuation
mechanics, but it must still make the claw plan status the continuation gate.

## 3. Session-start flow

At local session start, the Cindy Host invokes the plugin-declared startup hook:

1. Resolve the session workspace.
2. Check whether the local `claw` CLI is available.
3. If it is available, run the claw startup/context entry for that workspace.
4. Inject the returned context into the first user message, following the
   OpenCode adapter's primary injection strategy.
5. If the CLI is missing, inject an actionable installation and initialization
   guide into the first user message, then continue the normal session.

The first version does not automatically install the CLI.

## 4. Failure policy

Startup and closeout hooks are fail-open enhancements:

- A missing CLI does not block an ordinary Cindy session.
- A failed `claw context` does not block the session.
- The first user message should receive an actionable error summary when the
  adapter has one; it must not silently convert a failed workflow into a
  successful one.
- Hook failure must not corrupt the canonical `.claw` plan state.
- Knowledge capture is a sidecar, but its required completion result is part
  of the accepted claw workflow closeout when the plan reaches completion.

This follows the current OpenCode behavior: startup recovery is an enhancement,
and turn-report capture never blocks the foreground session.

## 5. Turn-end continuation

Cindy should match the current OpenCode continuation rule:

- On turn-end, inspect the session-bound plan.
- Automatically dispatch the next prompt only when the plan is bound to the
  session and has status `process.active`.
- Do not auto-continue `process.discussing`, `process.wait`, or any `end.*`
  status.
- The continuation prompt must tell the agent to follow the current
  `workflowGuidance` and avoid unrelated work.

The Host must make this dispatch idempotent for a single completed turn.

## 6. Completion closeout

After all plan tasks are complete, the adapter dispatches a separate
knowledge-writer closeout turn through Cindy's existing Host session-send
worker path. The Skills-only plugin does not request the privileged Ghost
`agent` slot; the closeout prompt therefore runs in the current Cindy agent
context and remains bounded to the current project and plan.

The closeout must remain bounded to the current project and plan. A worker
failure must be visible and recoverable, rather than silently marking the plan
as fully closed.

## 7. Acceptance scenarios

The first version is accepted only after the complete local loop is verified:

1. CLI installed: startup context is obtained and injected into the first user
   message.
2. CLI missing: installation guidance is injected and the session continues.
3. `claw context` failure: an actionable failure is surfaced and the session
   continues.
4. A bound `process.active` plan triggers exactly one turn-end continuation.
5. `process.discussing`, `process.wait`, and `end.*` plans do not trigger
   automatic continuation.
6. All tasks complete and the knowledge-writer is dispatched and completes.
7. The adapter does not automatically install the CLI or modify user PATH.
8. The plugin remains Skills-only; Cindy native progress may be used for
   presentation, but no bidirectional Todo or Goal sync is required.

## 8. Current implementation status

Implemented in the Cindy Desktop Host working tree:

- local-only `claw hook auto-claw --host cindy` execution during session start;
- one-time, wire-only first-user-message context injection;
- actionable missing/failed CLI guidance with fail-open behavior;
- `claw context --host cindy` turn-end inspection;
- exactly-one guarded continuation for `process.active`.
- exactly-one Host-dispatched knowledge-writer turn for `end.completed`.

The Host currently keeps the native Cindy Goal controller and progress surface
optional; the claw plan remains the continuation gate. Closeout is dispatched
through Cindy's existing Host session-send worker path, because the Skills-only
plugin intentionally does not request the privileged Ghost `agent` slot.

## 9. Implementation constraints to verify next

Before adding runtime code, verify in Cindy Desktop Host:

- the plugin manifest shape for declaring lifecycle hooks;
- the host-to-plugin hook invocation contract and returned prompt mutation;
- the session event that represents a completed turn;
- the safe API for sending one follow-up prompt;
- the available subagent/worker API for mandatory knowledge closeout;
- local command execution and error reporting boundaries.

If any of these are not exposed to third-party plugins, the required change is
to add a documented Host extension point rather than hiding the behavior in a
Skills prompt.
