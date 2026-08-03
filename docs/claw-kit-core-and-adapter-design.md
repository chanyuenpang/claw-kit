# Claw Kit Core and Adapter Design

Status: canonical design baseline, 2026-07-30

This document is the shared design contract for `claw-kit`. It separates the
platform-neutral workflow from host-specific adapters so that new integrations
do not silently fork lifecycle, prompt, state, or failure behavior.

The document is normative for new adapter work. Existing adapter references may
describe implementation details, but they must not contradict this document.

Runtime file classes, retention, and cleanup ownership are defined separately
in [Claw Runtime State and Cleanup Specification](claw-runtime-state-lifecycle-spec.md).

## 1. Design goals

Claw Kit has two layers:

```text
Core Spec
  .claw state, CLI operations, workflow lifecycle, context, closeout,
  retention, memory, and failure semantics

Adapter Spec
  host lifecycle mapping, identity transport, prompt injection, tool bridge,
  UI projection, background scheduling, and packaging
```

The core is authoritative for workflow meaning. An adapter is an integration
boundary, not a second workflow implementation.

The design must preserve these properties:

1. A plan has one canonical state in `.claw`.
2. Prompt recovery is deterministic and host-independent at the data level.
3. Host hooks may change how core behavior is entered, but not what a plan
   status means.
4. Non-essential maintenance never blocks the host's prompt path.
5. Host presentation is one-way unless the host exposes an explicit, stable,
   documented mutation API.
6. A platform limitation is recorded as an adapter limitation, not hidden in a
   Skill or duplicated in the core.

## 2. Normative language

The words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY describe requirements.

- MUST: a conformance requirement.
- SHOULD: the default design; deviation needs a documented reason.
- MAY: an optional capability that must not become a core dependency.

## 3. Terminology

### 3.1 Core

The `@veewo/claw-core` package and the platform-neutral behavior exposed by the
`claw` CLI. Core owns state transitions, persistence, plan interpretation,
context snapshots, maintenance semantics, and closeout records.

### 3.2 Adapter

A package or plugin that connects a host such as Codex, Cindy, OpenCode, or
OpenClaw to the core. An adapter owns host protocol details and must call the
core instead of reimplementing its rules.

### 3.3 Blocking path

The host lifecycle path that must return before the user message or agent turn
continues. Prompt recovery belongs here. The blocking path MUST contain only
work required for a correct prompt or explicit host decision.

### 3.4 Background path

A detached or fire-and-forget path for non-essential work such as daily cleanup,
embedding warmup, retryable knowledge-job discovery, and completion refresh.
Failure on this path MUST NOT invalidate prompt recovery.

### 3.5 Projection

A host presentation derived from canonical core state. Progress cards, Todo
lists, Goal state, and status badges are projections unless the host exposes a
documented mutation contract and the adapter explicitly opts into it.

## 4. Core Spec

### 4.1 Canonical state and ownership

The `.claw` directory is the canonical workflow store. Core owns:

- project and session plan files;
- plan status and task status transitions;
- session bindings and expiry;
- project protocol and version checks;
- task retention and daily maintenance;
- memory and embedding configuration;
- knowledge finalization jobs and their claim state;
- context and active-workflow snapshots.

Adapters MUST NOT create a parallel plan database, infer task completion from
host UI state, or use a host progress surface as the source of truth.

`.claw/project.json` is team-owned configuration. Local runtime overrides belong
in `.claw/project-override.json` and MUST NOT be promoted into shared project
configuration accidentally.

### 4.2 Core operation contract

Core operations are exposed through the CLI and typed adapter gateways. The
operation name and result semantics are core contracts; command-line syntax is
an invocation detail.

The baseline operation groups are:

| Group | Operations | Core responsibility |
| --- | --- | --- |
| Plan | `plan.create`, `plan.start`, `plan.edit`, `plan.wait`, `plan.resume`, `plan.done`, `plan.show` | Validate and persist workflow lifecycle |
| Task | `task.add`, `task.edit`, `task.done`, task removal where supported | Persist task state and completion choices |
| Subplan | `subplan.create` | Create a nested plan with inherited context |
| Context | `context`, `hook auto-claw` | Recover project/session state and build context data |
| Search | `search`, index refresh | Recall project knowledge using configured memory |
| Knowledge | capture, claim, wait, complete, fail | Persist and finalize closeout jobs |
| Maintenance | daily cleanup, embedding warmup, completion refresh | Run non-essential housekeeping |

Adapters MAY expose a smaller surface, but MUST NOT change the meaning of an
operation. If a host cannot support an operation, the adapter should return a
clear unsupported result and preserve the core state.

### 4.3 Workflow lifecycle

The canonical lifecycle is:

```text
process.discussing
        |
        v
process.active <----> process.wait
        |
        +----> end.completed
        +----> end.closed
        +----> end.leave
```

The exact legal transitions are enforced by core. Adapters MUST use core
operations to transition state.

Meaning of the stable statuses:

- `process.discussing`: requirements or plan decisions are not settled.
- `process.active`: one current task may be executed.
- `process.wait`: execution is paused and must not auto-continue.
- `end.completed`: the plan finished and closeout may be required.
- `end.closed`: the plan was explicitly closed.
- `end.leave`: the workflow was left without claiming completion.

An adapter MAY use a host Goal or continuation feature as a projection of
`process.active`, but the core status remains the gate.

### 4.4 Context and auto-claw

`auto-claw` is the prompt-recovery entry point. Its core responsibility is to:

1. resolve the project or session workspace;
2. validate or initialize the `.claw` protocol when the host flow permits it;
3. resolve the bound active workflow;
4. produce a structured context snapshot;
5. produce host-neutral guidance inputs and any required host projection data.

The prompt path MUST NOT synchronously perform optional housekeeping. Daily
cleanup, embedding warmup, knowledge-job discovery, and completion refresh are
background responsibilities.

Host-specific wording MAY be added after the structured snapshot is produced,
but the adapter must not reconstruct plan state from raw files.

The core output should remain structured enough for an adapter to choose its
transport:

```json
{
  "project": { "projectRoot": "...", "projectId": "..." },
  "activeWorkflow": {
    "taskName": "...",
    "planStatus": "process.active",
    "planSummary": "..."
  },
  "protocolCheck": { "ok": true },
  "startupRecovery": {}
}
```

An adapter may render this as `additionalContext`, a synthetic first message,
or another host-native prompt channel.

### 4.5 Background work

The following work is non-essential to the prompt result and SHOULD run in one
background worker per host lifecycle event:

- lock-protected daily cleanup;
- local embedding warmup;
- retryable knowledge-job discovery and detached finalizer launch;
- completion refresh and optional GitNexus refresh.

The worker MAY report diagnostics, but its result MUST NOT be required before a
blocking prompt hook returns. A background failure MUST be retryable and MUST
not mutate a plan into a successful state.

### 4.6 Closeout and knowledge

Knowledge capture is sidecar work during a turn. Knowledge finalization is a
separate closeout job with claim, completion, and failure records.

Core owns the job lifecycle. The host decides how to execute a writer, subject
to the configured host policy. A plan MUST NOT be marked complete merely because
the writer process was launched; completion acknowledgement is the durable
closeout signal.

### 4.7 Failure policy

Core operations MUST return structured errors with a stable error code where
possible. The default host policy is fail-open for optional startup and
background enhancements:

- missing CLI: continue the host session with actionable guidance;
- failed context recovery: continue without pretending recovery succeeded;
- failed maintenance: record or retry without blocking the user;
- failed closeout: leave a recoverable job and make the failure visible;
- invalid workflow mutation: reject it and preserve canonical state.

The adapter may use a stricter policy only for a host-owned safety or compliance
boundary, and that policy must be documented separately.

## 5. Adapter Spec

### 5.1 Adapter responsibilities

Every adapter MUST define:

1. the host lifecycle entry used for prompt recovery;
2. the host lifecycle entry used for background work;
3. how project, session, and turn identity reach core;
4. how additional context reaches the agent;
5. how typed operations reach core;
6. how failures are surfaced within the host's timeout;
7. which UI projections are supported;
8. how the adapter is packaged, installed, and versioned.

An adapter MUST NOT:

- modify the host's private source or private state when a public extension
  point exists;
- copy the CLI into its package;
- install the CLI or change PATH automatically;
- reimplement core plan transitions;
- make a host progress card or Goal state canonical;
- depend on undocumented host files or logs for correctness;
- block prompt injection on optional cleanup or embedding work.

### 5.2 Lifecycle mapping

Use this neutral lifecycle vocabulary when documenting a new adapter:

| Core lifecycle need | Adapter question |
| --- | --- |
| Session entry | What host event runs before the first agent input? |
| Prompt injection | Can the host rewrite the user message or provide additional context? |
| Turn observation | What event reports turn start/end, and is it fire-and-forget? |
| Background work | What event can launch cleanup without blocking the prompt? |
| Tool execution | What host tool or process boundary can carry trusted identity? |
| Closeout | How is a writer turn or finalizer dispatched and acknowledged? |
| Presentation | Can the adapter update one stable projection instead of creating duplicates? |

The adapter reference MUST distinguish blocking hooks from observing hooks. A
`did-*` event is not a substitute for a blocking prompt hook, and a blocking
hook must not depend on a race with a `did-*` prewarm event.

### 5.3 Prompt hook contract

The prompt hook is the adapter's primary integration point. It MUST:

- call the core prompt path directly or through a stable worker boundary;
- use the host's actual session/workspace identity;
- have an explicit timeout below the host's fail-open threshold;
- return the host's required verdict even when core fails;
- inject only the structured/core-derived context;
- avoid optional maintenance and model-dependent routing unless the host
  explicitly provides trusted metadata.

For Cindy specifically, `will-user-message` has a three-second fail-open window.
The plugin currently receives `sessionId` and `text`; it does not receive a
reliable current `model` or `providerId`. Internal host logs MUST NOT be used as
the adapter contract. If model-aware routing becomes necessary, Cindy Host must
expose those fields in a documented event or session-context API.

For Codex, the SessionStart hook writes the host's additional-context envelope.
For OpenCode or another host, the adapter may use a synthetic first message if
that is the supported public entry. These are transport differences, not core
workflow differences.

### 5.4 Identity and security

The adapter MUST pass a trusted session key and workspace path to core through a
host-controlled channel, not by asking the agent to type identity values.

The worker boundary MUST validate:

- operation name and argument schema;
- local workspace eligibility;
- read-only workspace state;
- host identity and session identity;
- path scope for files and finalization jobs.

Agent-facing tools should expose typed operations and safe descriptions. Raw
CLI execution is an implementation detail of the adapter worker, not a user
workflow contract.

### 5.5 Tool and UI projection

The adapter may expose `list_tools` and `call_tool`, or an equivalent typed
gateway. Every tool call should return the core result to the agent while the
adapter separately applies a one-way host projection.

Progress cards and Goal state are projections. A card lifecycle MUST be
documented. The current Cindy rule is:

- create a card for `plan.create`, `plan.resume`, and `plan.done`;
- update the current card for task and plan mutations;
- do not create a new card for every `task.done`;
- do not create a card during session-start recovery;
- preserve canonical state in `.claw`, not in card memory.

If the host cannot update an existing projection, the adapter should prefer a
single stable projection or explicitly document the resulting limitation rather
than silently producing an unbounded card stream.

### 5.6 Model metadata

Model/provider metadata is host-owned. An adapter may use it only when it is
present in a documented public event or context API.

The following are not sufficient contracts:

- a model's self-description in the system prompt;
- an inferred model name from response text;
- private host logs;
- an Orca workspace display that is not exposed to the target hook.

If a host exposes only `agent` or `model` on a turn-observation event, that data
describes the observed turn and may be stale for the next prompt. It MUST NOT be
treated as the current provider unless the host defines that guarantee.

## 6. Current adapter mapping

This matrix records the intended boundary, not private host internals:

| Adapter | Prompt entry | Background entry | Identity boundary | Presentation |
| --- | --- | --- | --- | --- |
| Codex | `SessionStart` command hook | detached CLI workers | hook payload plus Codex host bridge | Codex plan/Goal projection when enabled |
| Cindy | `will-user-message` rewrite | `did-session-created` plus one background worker | Ghost `session-context` and Node worker | Ghost card and Hook-owned continuation |
| OpenCode | host session-start / synthetic first message | host background/subagent path | OpenCode session/project context | host-native task/subagent projection |
| OpenClaw | adapter-defined startup/message hook | adapter-defined background path | host session/workspace contract | host-supported presentation only |

Each adapter still needs its own reference document for exact host API details.
Those documents may explain mechanics, but the Core Spec remains the authority
for workflow meaning and failure behavior.

## 7. Adapter conformance checklist

A new adapter is ready for review only when it can answer all of these:

### Core behavior

- Does it use the existing core/CLI operations rather than duplicate them?
- Is `.claw` the only canonical workflow store?
- Are plan statuses and task transitions preserved exactly?
- Does `auto-claw` return enough structured context for the host prompt path?
- Are closeout jobs claimed and acknowledged through core?

### Lifecycle and latency

- Is the prompt entry a real blocking hook rather than a race with prewarm?
- Is its timeout below the host's fail-open threshold?
- Are cleanup, warmup, search indexing, and finalization outside the blocking path?
- Does a missing CLI or worker failure produce the documented failure behavior?

### Identity and safety

- Does the adapter pass trusted session/workspace identity?
- Are local workspace and read-only constraints enforced?
- Does it avoid private host files, logs, and undocumented APIs?
- Does it avoid installing dependencies or modifying PATH automatically?

### Presentation

- Is UI state explicitly a projection?
- Is the projection lifecycle bounded and tested for duplicates?
- Does a host restart have a defined behavior for projection identity?
- Can users still use the CLI/Skills when the UI projection is unavailable?

### Delivery

- Is the adapter package version aligned with its manifest and artifact?
- Is the install/update path documented and tested?
- Are unit, worker, CLI, and installed-host smoke tests present in proportion to
  the risk?
- Are host-specific limitations listed in the adapter reference instead of
  being implied by the core document?

## 8. Anti-drift rules

### 8.1 Promote behavior to core when it repeats

A behavior belongs in core when at least two adapters need the same semantics,
or when it changes canonical state. Do not promote it merely because two hosts
happen to use similar API names.

Examples that belong in core:

- plan lifecycle and task completion;
- active workflow recovery;
- knowledge job state;
- daily maintenance locking;
- structured context fields.

Examples that remain adapter-owned:

- Hook names and timeout handling;
- Ghost card HTML;
- Codex `hookSpecificOutput` envelopes;
- OpenCode synthetic-message transport;
- host-specific Goal or agent continuation calls.

### 8.2 Change protocol

When changing a behavior:

1. Identify whether the change affects canonical state, structured output, or
   only host transport.
2. Update this document if the Core Spec changes.
3. Update the affected adapter reference if the Adapter Spec changes.
4. Add or update a core contract test before adding host-specific tests.
5. Keep compatibility aliases in core when an adapter can update independently.
6. Do not silently copy a host workaround into another adapter.

### 8.3 Versioning

Core protocol changes and adapter package changes are separate:

- CLI/core version: changes to `.claw` protocol, operation semantics, or
  structured core output.
- Adapter version: changes to host manifest, hooks, worker, UI projection, or
  packaging.
- Artifact version: the exact installed bundle; it MUST be reproducible from
  the current adapter source and manifest.

An adapter artifact MUST NOT reuse a version number after its contents change.

## 9. Testing strategy

Tests should follow the boundary:

1. Core contract tests verify state transitions, structured results, locks,
   closeout jobs, and maintenance behavior.
2. Adapter worker tests verify argument mapping, identity injection, timeout,
   and failure conversion.
3. Hook tests verify the host verdict/rewrite contract and do not assume private
   host metadata.
4. UI tests verify projection lifecycle, especially duplicate-card prevention.
5. Installed-host smoke tests verify packaging, PATH resolution, first prompt,
   plan mutation, closeout, restart behavior, and background work.

No adapter is considered fully complete from unit tests alone. If the host
cannot be automated, the remaining manual scenarios MUST be listed explicitly
in the adapter reference and release checklist.

## 10. Known current gaps

The following are adapter/runtime gaps, not reasons to weaken the Core Spec:

- Cindy's WUM path must use a timeout below its three-second fail-open window.
- Cindy's current source changes need a fresh artifact before installation; an
  old `.cindy` bundle must not be treated as the current implementation.
- Cindy's card identity is resident-process state and needs a defined restart
  behavior if stable host card IDs are unavailable.
- Cindy does not currently expose reliable `model`/`providerId` fields to WUM.
- Full installed Cindy end-to-end verification remains separate from worker and
  CLI tests.

These gaps should be closed in the adapter package or Host extension contract,
not by adding platform-specific assumptions to core prompt semantics.

## 11. References

- [Project configuration reference](project-json-reference.md)
- [Workflow performance contract](workflow-performance-contract.md)
- [Cindy adapter design baseline](https://github.com/chanyuenpang/claw-kit-cindy-adapter/blob/main/references/cindy-adapter-design.md)
- [Codex startup recovery](../packages/codex-adapter/references/codex-startup-recovery.md)
- [OpenCode startup recovery](../packages/opencode-adapter/references/opencode-startup-recovery.md)
