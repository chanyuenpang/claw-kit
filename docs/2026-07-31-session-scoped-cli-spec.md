# Claw Session-Scoped CLI Product Specification

Status: approved product specification, 2026-07-31

Technical design:
[`2026-07-31-session-scoped-cli-tdd.md`](./2026-07-31-session-scoped-cli-tdd.md)

This document defines a host-neutral, process-backed session model for Claw.
It is the product contract for implementation and acceptance, not an MVP
outline. Implementation starts only after this specification is approved.

The words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are normative.

## 1. Product goal

An agent opens a Claw session once and then performs normal Claw operations
without repeatedly supplying host, workdir, or plan-target parameters.

The product MUST:

- work independently of Codex, OpenCode, Cindy, or any other host;
- provide one persistent terminal session and an equivalent typed Node API;
- keep one immutable workdir and one optional `currentPlan` in each session;
- preserve retained session data across terminal close and daemon restart;
- isolate sessions by both directory and agent session ID;
- make current-plan focus transitions explicit and deterministic;
- retain the existing stateless CLI as a compatible path;
- provide enough structured state and errors for an agent to recover safely;
- be implemented and verified to product quality.

## 2. Non-goals

This specification does not:

- make Codex or any host adapter the owner of session semantics;
- support remote or multi-user sessions;
- allow a session workdir to change after open;
- allow concurrent live clients to control the same session;
- add a durable host-action outbox;
- add cross-disconnect request replay, response caching, or mutation
  deduplication;
- replace canonical plan files or existing plan mutation rules;
- remove the stateless CLI.

## 3. Terminology

### 3.1 Agent session

An agent session is a retained Claw execution context identified by the
composite key:

```text
(canonicalWorkdir, agentSessionId)
```

It owns:

- immutable `workdir`;
- optional `currentPlan`;
- live/disconnected state;
- creation, update, connection, and expiry timestamps;
- protocol and daemon compatibility metadata.

The same `agentSessionId` MAY be used in different directories. Those sessions
MUST be independent.

### 3.2 Live session

A live session is the session currently attached to one terminal or one
programmatic client. A terminal or client MUST have at most one live session at
a time.

### 3.3 Retained session

A retained session is disconnected but still persisted and recoverable. Closing
a terminal or calling `session close` does not delete retained data.

### 3.4 Current plan

`currentPlan` is the plan that receives implicit plan and task operations in a
session.

A plan lifecycle status and current-plan focus are related:

- `process.active` means the plan is the active current execution context;
- `end.leave` means the plan has reached an end-state boundary and exited
  current-plan focus;
- an `end.leave` plan MAY later be resumed and restored to `process.active`.

`end.leave` is a terminal `end.*` state with an explicit resumability exception.
Like every `end.*` transition, entering it triggers end-state finalization.
Unlike `end.completed`, it does not assert that the plan goal was completed.

### 3.5 Session daemon

The session daemon is one local, shared process per user installation. It owns
session discovery, retained session state, connection handling, session command
serialization, and the local protocol.

### 3.6 Simple plan view

The simple plan view is the smallest machine-readable plan projection needed to
recover agent context. `claw plan show --simple` is its only authoritative
public query.

## 4. Public CLI experience

### 4.1 Open or reopen

```text
claw session open <dir> <session-id>
```

This is the only public open/connect command. It is create-or-open:

1. Canonicalize `<dir>`.
2. Resolve the session by `(canonicalDir, sessionId)`.
3. Close the caller's previous live session attachment, if any.
4. Create a new retained session or reopen the matching retained session.
5. Start the persistent Claw session command loop.

The session workdir MUST remain fixed until the session is closed. Opening a
different directory creates or opens a different composite-key session.

Example:

```text
claw session open G:\Projects\claw-kit agent-123
claw> plan show --simple
claw> task edit --id 2 --status in_progress
claw> session close
```

Commands in the loop MUST inherit:

- the session workdir;
- the agent session identity;
- the current-plan target;
- connection-level host metadata, when supplied by an adapter.

They MUST NOT require those values to be repeated.

### 4.2 Open response

A newly created session or a session with no recoverable current plan returns
session metadata without a `currentPlan` field.

When reopening an existing retained session and a current plan needs to be
restored, the open response MUST include:

```json
{
  "session": {
    "agentSessionId": "agent-123",
    "workdir": "G:/Projects/claw-kit",
    "state": "live"
  },
  "currentPlan": {
    "status": "process.active",
    "goal": {
      "text": "Implement the approved session product specification"
    },
    "tasks": [
      {
        "title": "Implement the daemon protocol"
      }
    ],
    "rules": [
      "Preserve stateless CLI compatibility"
    ]
  }
}
```

The `currentPlan` value MUST be obtained by reusing the authoritative
`plan show --simple` query. `session open` MUST NOT maintain a second
projection.

The field MUST be omitted when:

- a session is new;
- no current plan is bound;
- no current plan needs to be restored.

### 4.3 Close

```text
claw session close
```

`session close`:

- ends the caller's live attachment;
- exits the persistent terminal loop;
- preserves the retained session and cached data;
- does not change current-plan focus or plan status;
- updates the retained session timestamps.

### 4.4 Status

```text
claw session status
```

The command MUST return structured diagnostics containing at least:

- canonical workdir;
- agent session ID;
- live/disconnected state;
- daemon instance and protocol version;
- created, updated, connected, and expiry timestamps;
- whether a current plan is bound;
- the current plan identifier when one is bound.

It SHOULD include cold/warm open timing when diagnostic telemetry is enabled.

## 5. Programmatic Node API

The repository MUST publish a lightweight package:

```text
@veewo/claw-client
```

It contains:

- typed session APIs;
- request and response protocol types;
- local transport and daemon discovery;
- reconnect support;
- structured error types.

It MUST NOT contain canonical workflow logic, plan mutation implementation, or
heavy Core/model dependencies.

The primary open call is:

```ts
session.open(agentSessionId, workdir)
```

The parameter order is part of the public API. The returned session object
provides typed command methods or a typed command dispatcher. A Node worker
MUST NOT need to:

- launch a terminal;
- construct shell command strings;
- parse stdout;
- repeat host, workdir, session ID, or current plan on every operation.

CLI and Node callers MUST use the same protocol and receive equivalent
structured results and errors.

Host identity MAY be configured once on client construction or connection. It
is adapter metadata, not a Core plan-semantic input.

## 6. Authoritative simple plan view

```text
claw plan show --simple
```

This command MUST return JSON with exactly the following semantic projection:

```ts
type SimplePlanView = {
  status: PlanStatus;
  goal: {
    text: string;
  };
  tasks: Array<{
    title: string;
  }>;
  rules: string[];
};
```

Rules:

- `status` is the canonical plan status.
- `goal.text` preserves the canonical goal shape.
- `tasks` preserves canonical task order and includes only `title`.
- `rules` is always an array; absent canonical rules project to `[]`.
- no summary string, task detail, task status, references, requirements,
  retrospective, or internal path appears.

The existing one-line `planSummary` or `collapsedSummary` remains a separate
presentation concept and MUST NOT be used as `SimplePlanView`.

Core MUST implement one projection function. Both `plan show --simple` and the
conditional `session open.currentPlan` response MUST call it.

## 7. Current-plan focus model

### 7.1 Invariants

1. A session has zero or one `currentPlan`.
2. A plan resumed into current focus MUST enter `process.active`.
3. A newly created plan or subplan MAY become current in its
   template-owned preparation or discussion state.
4. A plan exiting current focus MUST enter `end.leave`.
5. `end.leave` MUST be resumable.
6. Replacing current plan A with plan B MUST validate B before leaving A.
7. Resuming the already-current plan MUST NOT emit a leave transition.
8. Commands requiring a current plan MUST fail explicitly when none exists.
9. The CLI MUST NOT guess a plan from recency, filesystem order, active status,
   or another session.
10. A canonical plan MUST be current in at most one session because its
    `end.leave` status represents global focus exit.

### 7.2 Leave reasons

The canonical plan records one of:

```ts
type PlanLeaveReason =
  | "manual_leave"
  | "switch_to_new_plan";
```

`leaveReason` MUST be cleared when the plan is resumed into `process.active`.

### 7.3 Shared transition operations

Core MUST own reusable focus-transition operations equivalent to:

```ts
leaveCurrentPlan(reason)
activatePlan(planId)
switchCurrentPlan(planId)
```

CLI commands and subplan lifecycle code MUST use these operations. They MUST
NOT independently edit bindings and plan statuses.

All focus transitions MUST run inside the existing serialized plan/session
mutation boundary and reload canonical state before applying changes.

### 7.4 `plan create`

```text
claw plan create "<title>"
```

If the session has current plan A:

1. Validate and create the new plan without changing focus.
2. A becomes `end.leave`.
3. A records `leaveReason="switch_to_new_plan"`.
4. The new plan becomes `process.active` when its normal planning lifecycle
   allows activation and becomes `currentPlan`.

If the normal plan template starts in a preparation or discussion stage, that
stage remains authoritative until activation. The binding still selects the
newly created plan; focus status MUST follow the canonical plan lifecycle
rather than bypass its planning gate.

### 7.5 `plan resume`

```text
claw plan resume
```

The command:

- requires an existing `currentPlan`;
- restores an `end.leave`, `process.wait`, or `process.discussing` plan to
  `process.active`;
- is idempotent when the current plan is already `process.active`;
- does not emit a leave transition for that same plan.

When no current plan exists, it MUST fail with `CURRENT_PLAN_REQUIRED` and
suggest `plan resume <planId>` or `plan create`.

### 7.6 `plan resume <planId>`

```text
claw plan resume <planId>
```

When the target differs from current plan A:

1. Validate that the target exists and can be resumed.
2. A becomes `end.leave`.
3. A records `leaveReason="switch_to_new_plan"`.
4. The target becomes `process.active`.
5. The target clears `leaveReason`.
6. The target becomes `currentPlan`.

A validation failure MUST leave the old current plan unchanged.

### 7.7 `plan leave`

```text
claw plan leave
```

The command:

1. requires a current plan;
2. changes it to `end.leave`;
3. records `leaveReason="manual_leave"`;
4. clears the session's `currentPlan`.

When no current plan exists, it MUST return `CURRENT_PLAN_REQUIRED`; it MUST
not silently select or mutate another plan.

### 7.8 `subplan create`

```text
claw subplan create ...
```

When parent A creates child B:

1. Validate and create B.
2. A becomes `end.leave`.
3. A records `leaveReason="switch_to_new_plan"`.
4. B becomes the session's `currentPlan`.
5. B follows its template-owned preparation/activation lifecycle.

When B completes successfully:

1. B commits its completion state.
2. The parent task is updated through the existing subplan completion rules.
3. A clears `leaveReason`.
4. A becomes `process.active`.
5. A becomes `currentPlan`.

The same shared focus-transition implementation used by `plan create`,
`plan resume <planId>`, and `plan leave` MUST own these state changes.

### 7.9 Wait and discussion

`process.wait` and `process.discussing` retain current-plan binding. They pause
or discuss the current plan; they do not transfer focus.

### 7.10 End-state finalization

Every `end.*` status is a terminal outcome. Entering `end.completed`,
`end.closed`, or `end.leave` MUST remove the plan from current-plan focus and
trigger the standard end-state completion refresh and knowledge-finalization
pipeline after the canonical mutation commits.

`end.leave` remains explicitly resumable because it represents a focus exit
rather than successful goal completion. It MUST NOT set `completedAt` or
trigger Goal Mode completion merely because it finalized the current end-state
boundary. Archival and retention remain governed by their existing completion
eligibility rules.

## 8. Implicit command targeting

Inside a live session, normal plan and task commands implicitly target
`currentPlan`, including:

```text
plan show
plan show --simple
plan edit ...
plan wait
plan done ...
task add ...
task edit --id <id> ...
task done --id <id>
```

Resolution order is:

1. an explicit administrative override, when that command supports one;
2. the live session's `currentPlan`;
3. `CURRENT_PLAN_REQUIRED`.

An explicit administrative override MUST NOT change `currentPlan` unless the
operation is one of the focus-changing commands defined in section 7.

## 9. Cross-directory search

The stateless and session-compatible search syntax is:

```text
claw search <query>
claw search --query <text>
claw search --dir <dir> <query>
claw search --dir <dir> --query <text>
```

`--dir`:

- overrides the search directory for that operation only;
- MUST NOT change session workdir;
- MUST NOT change current plan;
- MUST NOT open or create another session;
- is named because the existing positional argument belongs to the query.

## 10. Daemon architecture

### 10.1 Topology

There is one shared daemon per local user installation. It manages multiple
isolated composite-key sessions.

The daemon is an execution optimization and session-context owner. Canonical
workflow and plan data remain owned by Core and project files.

### 10.2 Local discovery and security

The first product release is local-only. The daemon MUST:

- listen only on a local transport or `127.0.0.1`;
- use a random per-instance authentication token;
- keep discovery state and tokens in a user-only runtime directory;
- validate protocol versions;
- publish state atomically;
- use startup locking so concurrent clients discover one daemon;
- never expose a remote-listening configuration.

The existing persistent daemon discovery and authentication patterns SHOULD be
reused where they satisfy these requirements.

### 10.3 Session serialization

Commands within one session MUST execute serially. Shared plan mutations MUST
also use the existing project/plan mutation queue and canonical state reload.

Different sessions MAY read or explicitly administer the same plan, but a plan
MUST have at most one current-session owner. Attempting to resume a plan already
owned by another live or retained session returns `PLAN_FOCUS_CONFLICT`.
Existing plan-level serialization remains the authority for explicit shared
writes.

### 10.4 Persisted session record

The minimum retained record is:

```json
{
  "schemaVersion": 1,
  "agentSessionId": "agent-123",
  "canonicalWorkdir": "G:/Projects/claw-kit",
  "currentPlan": {
    "taskName": "session-scoped-cli",
    "planFile": "plan.json"
  },
  "createdAt": "2026-07-31T00:00:00.000Z",
  "updatedAt": "2026-07-31T00:00:00.000Z",
  "lastConnectedAt": "2026-07-31T00:00:00.000Z",
  "expiresAt": "2026-08-07T00:00:00.000Z"
}
```

`currentPlan` is omitted when no plan is current.

Raw workdirs and session IDs MUST NOT be used directly as runtime directory
names. Runtime paths MUST use a stable hash of the composite identity.

### 10.5 Retention

- A live terminal/client keeps its session live indefinitely.
- Soft close changes the session to disconnected and retained.
- Retention is seven days from the latest `updatedAt`.
- Reopen refreshes connection/update timestamps.
- Expired sessions are removed by normal maintenance.
- Session cleanup MUST NOT delete or mutate canonical plan files.
- Reopening a retained session SHOULD avoid reinitializing unchanged project
  context and SHOULD be measurably faster than cold initialization.

### 10.6 Daemon restart

After restart, the daemon MUST:

- rediscover retained session records;
- validate their schema and expiry;
- reconstruct in-memory session entries lazily;
- preserve workdir and current-plan identity;
- allow clients to reopen through the normal `session open` command.

## 11. Disconnect and recovery contract

The product deliberately does not add cross-disconnect request replay.

If a connection is lost while a command is in flight:

- the client MUST return a structured connection-lost error;
- the error MUST state that the command outcome may be unknown;
- the error MUST NOT automatically retry the command;
- the error MUST suggest:

```text
claw session open <dir> <session-id>
```

- after reopen, the agent MAY use the conditional `currentPlan` view or
  `claw plan show --simple` / `claw plan show` to inspect canonical state.

The implementation MUST NOT add:

- a durable response cache keyed by request ID;
- automatic mutation replay;
- a durable host-action outbox;
- rollback of an already committed canonical mutation.

Request IDs MAY remain protocol correlation identifiers. They do not imply
cross-reconnect idempotency.

## 12. Host-action boundary

Session processing preserves the current host-action model:

- canonical mutation returns its existing actions;
- the active caller consumes them immediately;
- session mode does not persist or acknowledge a new outbox;
- host-native capabilities remain outside daemon/Core semantics.

Failures MUST use the existing structured propagation rules. Session transport
must not reinterpret unrelated host-action behavior.

## 13. Error contract

Initial stable error codes are:

| Code | Meaning and recovery |
| --- | --- |
| `SESSION_NOT_FOUND` | No retained session matches `(dir, sessionId)` when an existing session was required. |
| `SESSION_EXPIRED` | The retained record exceeded seven days from `updatedAt`; open creates a new session only when create-or-open semantics allow it. |
| `SESSION_IDENTITY_INVALID` | Directory or session ID is invalid. |
| `SESSION_PROTOCOL_UNSUPPORTED` | Client and daemon protocol versions are incompatible. |
| `SESSION_CONNECTION_LOST` | Transport was lost; outcome may be unknown. Error includes the exact reopen command. |
| `CURRENT_PLAN_REQUIRED` | The command requires current-plan focus. |
| `PLAN_NOT_FOUND` | An explicit or retained plan identity no longer resolves. |
| `PLAN_NOT_RESUMABLE` | The target cannot enter `process.active` under canonical lifecycle rules. |
| `PLAN_FOCUS_CONFLICT` | Another live or retained session currently owns the target plan. |
| `PLAN_TRANSITION_CONFLICT` | Canonical plan state changed before a focus transition committed. |
| `SESSION_COMMAND_FAILED` | The daemon completed the request with a structured Core/CLI failure. |

Errors MUST include:

- stable code;
- human-readable message;
- retryability;
- whether the outcome is known;
- relevant non-secret identifiers;
- a suggested command when a deterministic recovery action exists.

## 14. Compatibility and migration

Session support is additive.

The first implementation starts from a new versioned session runtime. It does
not migrate legacy session workflow, binding, or daemon cache state. Existing
canonical plan files remain intact, while old session/cache state may be
ignored, aged out, or removed by an explicitly contained cleanup operation.

The following MUST remain compatible:

- stateless `claw plan`, `claw task`, and `claw search` calls;
- existing hooks and host adapters;
- environment-derived session identity used by current integrations;
- explicit workdir and plan overrides used by automation;
- existing canonical plan storage and mutation rules.

Migration order:

1. Add the authoritative Core focus transitions and `plan show --simple`.
2. Add daemon protocol and retained session storage.
3. Publish `@veewo/claw-client`.
4. Route the interactive CLI through the client.
5. Migrate Node workers and adapters incrementally.
6. Keep stateless behavior covered throughout migration.

No adapter is required to migrate in the same release merely because the
session path exists.

## 15. Observability

Structured diagnostics MUST make these events observable without exposing
tokens or private plan content:

- daemon started, discovered, reused, and stopped;
- session created, opened, reopened, closed, and expired;
- current-plan focus left, switched, resumed, and cleared;
- protocol mismatch and authentication failure;
- command start, completion, structured failure, timeout, and disconnect;
- cold and warm open duration.

Logs MUST identify sessions by a safe hash, not raw filesystem directory names
or raw agent session IDs.

`session status` is the user-facing diagnostic entry. A future general doctor
command MAY aggregate it, but is not required to own session semantics.

## 16. Product-quality acceptance

Implementation is complete only when all applicable scenarios pass in source,
the packaged CLI, and the published Node client.

### 16.1 Parameter reduction

1. Open a session with directory and session ID.
2. Create or resume a plan.
3. Run plan and task operations without repeating host, workdir, session ID, or
   plan target.
4. Verify equivalent Node worker operations use typed APIs without a shell.

### 16.2 Identity and workdir isolation

1. Open the same session ID in two directories.
2. Verify separate retained sessions, current plans, caches, and timestamps.
3. Run `search --dir` and verify it changes neither session.
4. Verify session workdir cannot be mutated in place.

### 16.3 Focus transitions

1. `plan create` leaves the previous current plan with
   `switch_to_new_plan` and selects the new plan.
2. `plan resume` restores wait, discussing, or leave to active.
3. `plan resume <planId>` leaves the old current plan and activates the target.
4. Re-resuming the same active current plan does not emit leave.
5. `plan leave` records `manual_leave`, enters `end.leave`, and clears focus.
6. `subplan create` leaves parent and selects child.
7. Child completion restores parent to `process.active` and current focus.
8. Commands without current focus return `CURRENT_PLAN_REQUIRED` and never
   guess.
9. A second session cannot make an already-owned plan current and receives
   `PLAN_FOCUS_CONFLICT`.

### 16.4 Simple view

1. `plan show --simple` returns only `status`, `goal.text`,
   `tasks[].title`, and `rules`.
2. Missing rules return `[]`.
3. A new/no-plan open response omits `currentPlan`.
4. Reopening a retained session with a recoverable current plan includes
   exactly the authoritative simple view.
5. Existing one-line summary behavior remains unchanged.

### 16.5 Retention and recovery

1. Soft close preserves retained state and canonical plans.
2. Reopen restores the composite-key session quickly.
3. Daemon restart preserves retained-session recovery.
4. Retained sessions expire seven days after the latest `updatedAt`.
5. A live session is not removed by disconnected-session cleanup.

### 16.6 Disconnect behavior

1. Kill the connection before a command response.
2. Verify no automatic replay occurs.
3. Verify `SESSION_CONNECTION_LOST` marks the outcome as potentially unknown
   and includes the exact reopen command.
4. Reopen and inspect canonical state using the conditional simple view or
   `plan show`.

### 16.7 Compatibility

1. Existing stateless CLI tests remain green.
2. Existing hooks and adapters retain their current behavior.
3. Existing immediate host-action consumption remains unchanged.
4. Package/install smoke tests prove the CLI and `@veewo/claw-client` expose
   the documented surfaces.

### 16.8 Performance evidence

Measure and report:

- daemon cold start;
- new session open;
- retained session warm reopen;
- warm plan/task command latency;
- memory use across multiple isolated sessions.

The product goal is a meaningful reduction in repeated agent input and warm
execution overhead. No arbitrary millisecond pass/fail threshold is normative
until a stable baseline is recorded.

## 17. Delivery requirements

This work is not an MVP. Delivery includes:

- the complete public CLI and Node API;
- versioned protocol and schema;
- canonical current-plan transition implementation;
- retained storage and seven-day cleanup;
- daemon lifecycle and local security;
- structured errors and diagnostics;
- all product-quality acceptance coverage;
- stateless compatibility;
- package and real-install verification;
- updated user and maintainer documentation.

The implementation MUST NOT be considered complete merely because one
interactive happy path works.
