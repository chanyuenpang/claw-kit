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
| session-start `claw hook auto-claw` | `did-session-created` refreshes session state asynchronously without delivering `additionalContext` |
| OpenCode first-message synthetic context | unsupported in Cindy until the Host provides trusted message context |
| turn-end plan inspection | no CLI polling; the latest typed command result is the state source |
| `process.active` continuation | Ghost Hook queues one background `agent.run` continuation after the assistant turn; the `.claw` plan status remains the gate |
| completion knowledge closeout | Cindy normalizes every configured policy to `subagent`. The terminal mutation creates the durable job and returns an Orca `knowledge-finalizer` dispatch. The Worker atomically captures Cindy SQLite task conclusions during `knowledge.claim`, then owns claim/assignments/done without a Stop hook or errand. |

The plugin subscribes to the `session` topic, but its `did-session-created`
handler performs no awaited work: it records the event and defers preparation
to the next timer turn. Cindy does not currently expose enough trusted context
at a user-message boundary for prompt delivery, so the plugin does not
subscribe to `will-user-message`. The plugin does not execute `claw` from the
sandbox; the declared Node worker does it through PATH.

Knowledge finalization does not use `will-user-message`. Cindy supports only the
effective `subagent` lifecycle, regardless of the configured policy. The
Lead dispatches the complete immutable `knowledgeDispatch` before its final
response and does not wait. The Orca Worker inherits the Lead's project workdir,
claims the already-created job exactly once while atomically materializing its
report from the originating Cindy session. The
Ghost path inspects persisted legacy jobs for diagnosis but never claims or
launches an errand for them.

## 4. Session-created background flow

At `did-session-created`, Cindy schedules one zero-delay timer and returns.
The timer starts background preparation, which runs two operations in
parallel:

1. Refresh `auto-claw` session state without delivering its `additionalContext`.
2. Run daily cleanup, embedding warmup,
   and retryable knowledge-job discovery.

Session creation belongs to a new session, so a session-bound plan cannot
exist yet and there is nothing to recover. Plan recovery only becomes meaningful
after that same session creates a plan and is later restored following a Codex
restart or context compaction; Codex session-start handling owns that path.

No generic reminder or diagnostic is injected into a Cindy user message.
Prompt delivery is deferred until a future Host version supplies the required
trusted message context.

The first version does not automatically install the CLI.

## 5. Session context and Node worker cwd

Cindy injects trusted session identity only into the Ghost tool call as
`args.session_context`. The Host removes any Agent-supplied field with that name
and then forges `session_id`, `workdir`, `workdir_is_local`, and
`workdir_is_read_only` from the active session snapshot.

The Node worker cannot rediscover that workdir from `process.cwd()`. Current
Cindy starts every Ghost utility process with `cwd: os.tmpdir()` and intentionally
does not expose the plugin install directory. The worker is also shared across
requests and may serve multiple sessions. Therefore `main.js` must validate the
Host-forged context and pass the session id, local/read-only verdict, and workdir
in the Node request. Removing that transport requires a new Host API that injects
session context into `cindy.node.request`; using worker cwd or an ambient
environment variable would be incorrect.

## 6. Failure policy

First-message maintenance and closeout hooks are fail-open enhancements:

- A missing CLI does not block an ordinary Cindy session.
- A failed background maintenance request does not block the session.
- Hook failure must not corrupt the canonical `.claw` plan state.
- Knowledge capture is a sidecar, but its required completion result is part
  of the accepted claw workflow closeout when the plan reaches completion.

Foreground tool failures retain their layer and exact reason:

- Node broker failures become `NODE_<broker-code>` and include the method,
  broker code, message, and optional diagnostic data.
- Worker execution distinguishes unavailable CLI, timeout, non-zero exit,
  invalid JSON, invalid operation arguments, missing workdir, and read-only
  workspaces.
- Structured claw CLI error codes and messages pass through unchanged.
- An unexpected `main.js` dispatch exception becomes
  `CLAW_TOOL_DISPATCH_FAILED` with the original exception message.

This follows the current OpenCode behavior: startup recovery is an enhancement,
and turn-report capture never blocks the foreground session.

## 7. Goal-mode continuation

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

## 8. Completion closeout

After all plan tasks are complete, the terminal mutation creates one durable
subagent job and returns its immutable `knowledgeDispatch` to the active Lead.
The Lead sends that prompt unchanged to the persistent Orca
`knowledge-finalizer` and returns without waiting.

The Worker calls `knowledge.claim`. Before issuing the claim token, the Cindy
adapter opens Cindy's local SQLite database read-only, locates the originating
session and terminal mutation, extracts successful `task.done` conclusions, and
atomically materializes the adjacent `plan.report`. It then executes ordered
assignments and calls `knowledge.done`. Neither job creation nor report capture
depends on `did-turn-end`, `will-assistant-message`, or the Lead's final answer.
The closeout remains bounded to the originating project and plan; failures stay
visible and retryable rather than silently marking the job succeeded.

## 9. Acceptance scenarios

The first version is accepted only after the complete local loop is verified:

1. CLI installed: startup context is obtained and injected into the first user
   message.
2. CLI missing: installation guidance is injected and the session continues.
3. `auto-claw` failure: an actionable failure is surfaced and the session
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

## 10. Current implementation status

Implemented in the Cindy Ghost plugin package:

- fully asynchronous DSC preparation that runs bounded `auto-claw` diagnostics,
  cleanup, embedding warmup, and knowledge-job discovery in parallel;
- WAM-only cache consumption with no Node or CLI request, injecting guidance
  only when non-empty and without a generic claw-kit reminder;
- fail-open background maintenance;
- typed `list_tools` / `call_tool` operations that resolve the trusted Cindy
  session context in the Host rather than in the Agent prompt;
- structured Node broker and CLI failures that preserve the originating layer,
  stable error code, and exact reason;
- structured plan-state projection from the command result, with Hook-owned
  Goal-mode continuation and no dependency on a private Cindy Goal API;
- one progress card created by `plan.create`, with `plan.resume`, `plan.done`, and later
  task mutations updating that card instead of creating new cards;
- exactly one Lead-dispatched Orca knowledge-writer turn for `end.completed`.

The Host currently keeps the native Cindy Goal controller and progress surface
optional because no stable third-party Goal API is available. The claw plan
remains canonical; knowledge closeout is dispatched by the active Lead to its
Orca `knowledge-finalizer`. The CLI remains a separate user-installed dependency and is
invoked by the declared Node worker.

## 11. Remaining runtime verification

Before claiming full runtime parity, verify in Cindy:

- whether the persistent Orca Worker reliably inherits the originating project
  workdir and continues after the Lead returns;
- whether the Node worker can resolve the user's installed `claw` executable
  on Windows/macOS/Linux in the packaged runtime;
- the full installed-plugin loop with a local `.claw` project.

If any of these are not exposed to third-party plugins, the required change is
to add a documented Host extension point rather than hiding the behavior in a
Skills prompt.
