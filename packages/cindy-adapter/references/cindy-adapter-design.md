# Cindy adapter design baseline

Status: decision baseline, 2026-07-29

This document records the agreed Cindy migration contract and the current
implementation boundary. It is the source of truth for the first adapter pass.

## 1. Adapter boundary

Hook logic belongs to the `claw-kit` platform-adapter layer. Cindy should not
turn the hook into a Skill-only approximation.

The first Cindy integration uses this split:

1. The Cindy Ghost plugin declares `subscribe`, `node`, and background `agent`
   capabilities and carries the adapter logic.
2. Cindy Desktop Host dispatches the declared Ghost capabilities; the plugin's
   Agent Tool calls receive trusted `session-context` and route workflow
   operations through the Node worker.
3. The claw CLI remains outside the plugin and is checked or initialized by
   `claw init` / `claw context`.

The plugin must not automatically install the CLI, write PATH entries, or
modify the user's environment.

The first installable plugin package contains the declared workflow Skills plus
the runtime Hook entry. Knowledge closeout is a private worker-side operation,
not an Agent-facing Skill. The CLI is never copied into the package.

## 2. First-version scope

- Support local workspaces only.
- Start with workflow integration; do not build a task panel.
- Agent-facing plan, task, subplan, and query operations use the Ghost Tool
  gateway. The worker maps typed operations to the existing claw CLI surface
  and injects the Cindy host/session identity for that child process.
- Cindy's native progress/Todo presentation may be used as a Host-side execution
  aid when available, but claw does not require bidirectional Todo
  synchronization.
- Goal synchronization is optional and is not a correctness dependency; claw's
  plan remains the canonical workflow state. The adapter implements Goal Mode
  through its resident Hook and background Agent slot, rather than attempting
  to mutate Cindy's private native Goal state.
- The adapter remains useful when lifecycle hooks are unavailable because the
  CLI and Skills remain the canonical workflow surfaces.

### Native Cindy progress and Goal are different surfaces

Cindy's visible progress checklist and its native Goal controller should not be
treated as one shared Todo API:

- Progress is a presentation/execution checklist for the current conversation.
- Goal is a Host-owned continuation controller with active, paused, blocked,
  complete, and budget-limited states, plus guarded follow-up dispatch.
- The current GoalController is an internal Desktop capability, not yet a
  stable third-party plugin persistence API.

The adapter should therefore use a one-way projection only when Cindy exposes a
supported Host API:

`claw plan (source of truth) -> Cindy progress/Goal presentation (optional)`

Cindy progress or Goal state must not be allowed to mutate the canonical claw
plan implicitly. The Host adapter may reuse the GoalController's continuation
mechanics, but it must still make the claw plan status the continuation gate.

## 3. Ghost Hook mapping

The Cindy mapping follows the existing OpenCode adapter's event responsibilities:

| Existing claw adapter behavior | Cindy Ghost implementation |
| --- | --- |
| session-start `claw hook auto-claw` | `will-user-message` calls the prompt path directly; `did-session-created` starts one independent background worker |
| OpenCode first-message synthetic context | `will-user-message` `rewrite` with the recovered context |
| turn-end plan inspection | no CLI polling; the latest typed command result is the state source |
| `process.active` continuation | Ghost Hook queues one background `agent.run` continuation after the assistant turn; the `.claw` plan status remains the gate |
| completion knowledge closeout | every `will-assistant-message` invokes the Core capture path, followed by a bounded background Agent prompt and private worker claim/done operations |

`did-*` topics are fire-and-forget metadata events. The `will-user-message`
hook is the only blocking message boundary and must return within Cindy's
three-second fail-open window. The plugin does not execute `claw` from the
sandbox; the declared Node worker does it through PATH.

## 4. Session-start flow

At local session start, Cindy separates prompt recovery from non-critical maintenance:

1. `did-session-created` fire-and-forgets one background worker for daily
   cleanup, embedding warmup, and retryable knowledge-job discovery.
2. `will-user-message` checks the session workspace and calls
   `claw hook auto-claw --host cindy` directly through the declared Node worker.
3. Inject the returned context into the first user message, following the
   OpenCode adapter's primary injection strategy.
4. If the CLI is missing, inject an actionable installation and initialization
   guide into the first user message, then continue the normal session.

The prompt path does not wait for, read, or depend on the background worker.
The background worker does not return knowledge jobs through `auto-claw`.

The first version does not automatically install the CLI.

## 5. Failure policy

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

## 6. Goal-mode continuation

The worker returns a one-way state projection with each mutating workflow
operation. The resident Ghost Hook stores only a per-session continuation
marker derived from that projection. `process.active` arms Goal Mode and
permits one background continuation after `did-turn-end`;
`process.wait`, `process.discussing`, and all `end.*` states clear the marker.
The marker records the current task id and retry count. A task-id change resets
the count; if the same task fails to advance twice, the adapter invokes
`plan.wait`, clears Goal continuation, and stops automatically. A failed
background dispatch is fail-open and contributes to the same retry budget.

This emulates OpenCode's continuation behavior through Cindy's public Hook and
Agent APIs. It does not read or mutate Cindy's private native Goal controller;
the `.claw` plan remains the continuation gate and source of truth.

## 7. Completion closeout

After all plan tasks are complete, the adapter dispatches a separate
knowledge-writer closeout turn through the declared background `agent` slot.
The closeout prompt remains bounded to the current Cindy session, project, and
plan.

The closeout must remain bounded to the current project and plan. Cindy's
`will-assistant-message` is a single post-turn hook: the Host calls it once
with the completed assistant text, not once per streamed or intermediate
assistant message. Its public payload has no turn transcript, turn id, or
tool-call history. The adapter therefore uses the WAM as the trigger, then
opens Cindy's local SQLite database read-only in the Node worker to recover the
current session's persisted messages. It scopes the query to the current turn
by locating the WAM final text and the preceding user boundary, then extracts
successful `task.done` results and their preceding assistant conclusions.

The SQLite reader is an adapter-private implementation detail: it never writes
the database, never depends on a Host IPC endpoint, and fails open to the WAM
text when the database path or schema is unavailable. Core receives only the
standard `taskConclusions` shape. Core's session/turn idempotency still prevents
duplicate entries and duplicate writer dispatch. `did-turn-end` remains a Goal
continuation boundary only. A worker failure must be visible and recoverable,
rather than silently marking the plan as fully closed.

## 8. Acceptance scenarios

The first version is accepted only after the complete local loop is verified:

1. CLI installed: startup context is obtained and injected into the first user
   message.
2. CLI missing: installation guidance is injected and the session continues.
3. `claw context` failure: an actionable failure is surfaced and the session
   continues.
4. A bound plan operation returns a structured projection for the Cindy Host.
5. `process.active`, `process.discussing`, `process.wait`, and `end.*` are
   projected one-way; active state can queue one Hook-owned continuation while
   paused and terminal states cannot.
6. All tasks complete and the knowledge-writer is dispatched and completes.
7. The adapter does not automatically install the CLI or modify user PATH.
8. The plugin uses Skills plus Ghost runtime hooks; Cindy native progress may
   be used for presentation, but no bidirectional Todo or Goal sync is
   required.

## 9. Current implementation status

Implemented in the Cindy Ghost plugin package:

- local-only `claw hook auto-claw --host cindy` execution during session start;
- one-time, wire-only first-user-message context injection;
- actionable missing/failed CLI guidance with fail-open behavior;
- typed `list_tools` / `call_tool` operations that resolve the trusted Cindy
  session context in the Host rather than in the Agent prompt;
- structured plan-state projection from the command result, with Hook-owned
  Goal-mode continuation and no dependency on a private Cindy Goal API;
- one progress card created for `plan.create`, `plan.resume`, and `plan.done`, with later task
  mutations updating that card instead of creating new cards;
- exactly-one Host-dispatched knowledge-writer turn for `end.completed`.

The Host currently keeps the native Cindy Goal controller and progress surface
optional because no stable third-party Goal API is available. The claw plan
remains canonical; closeout is dispatched through the declared background
`agent` slot. The CLI remains a separate user-installed dependency and is
invoked by the declared Node worker.

## 10. Remaining runtime verification

Before claiming full runtime parity, verify in Cindy:

- whether the background Agent slot is associated with a session before a user
  has clicked a plugin card; Cindy's documented background path requires a
  prior user association and may limit unattended continuation;
- whether the Node worker can resolve the user's installed `claw` executable
  on Windows/macOS/Linux in the packaged runtime;
- the full installed-plugin loop with a local `.claw` project.

If any of these are not exposed to third-party plugins, the required change is
to add a documented Host extension point rather than hiding the behavior in a
Skills prompt.
