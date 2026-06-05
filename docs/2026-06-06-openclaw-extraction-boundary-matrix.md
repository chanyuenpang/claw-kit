# OpenClaw Extraction Boundary Matrix

## Purpose

Turn the current `OpenClaw-dev` harness implementation into a concrete
extraction boundary for `claw-kit`.

This document answers one question repeatedly:

`Is this behavior part of the reusable harness core, or part of the OpenClaw host adapter?`

## Rule Of Thumb

Put behavior into `claw-kit core` when all of these are true:

- it changes or reads canonical `.claw` state
- it defines task/plan/memory/truth business semantics
- another host could reuse it without needing OpenClaw runtime internals

Keep behavior in the `OpenClaw adapter` when any of these are true:

- it depends on session ownership or takeover policy
- it depends on Gateway RPCs or live agent runtime
- it depends on reminder delivery, embedded runs, or channel side effects

## Boundary Matrix

### 1. Project and task context resolution

Source:

- `src/agents/project-context.ts`
- `src/agents/tools/plan-tool.ts`

Core:

- resolve project/task directories
- load and save `meta.json`
- derive task directory and task memory paths
- treat `TaskMeta.activePlan` as the canonical active plan pointer
- derive a task name from `plan_write` inputs
- create or ensure task metadata for a new task-bound plan

Adapter:

- keep per-session in-memory `ActiveContext`
- persist or restore active context by session key
- maintain `sessionLastTasks`
- root-agent mapping and session-root compatibility shims

Why:

Directory layout and task metadata are reusable harness rules.
Session-bound active context is OpenClaw runtime state.

### 2. `plan_write`

Source:

- `src/agents/tools/plan-tool.ts`
- ADR-0014

Core:

- validate plan document shape
- normalize canonical plan statuses
- create the plan file in task scope
- ensure or create the task bound to that plan
- update `TaskMeta.activePlan`
- update task meta status and taskType mirrors
- write subplan metadata and parent links
- enforce `plan_write` as the operation that establishes task scope

Adapter:

- use live active session context as a convenience input
- attach OpenClaw follow-up review calls
- trigger OpenClaw-specific index refresh hooks
- produce OpenClaw-specific tool result payload details

Why:

`plan_write` is one of the core business rules of the harness.
The surrounding runtime orchestration is host-specific.

### 3. `plan_edit`

Source:

- `src/agents/tools/plan-tool.ts`

Core:

- validate edits
- enforce plan status transitions
- enforce task status transitions
- enforce `retrospective.summary` when moving to `end.completed`
- keep `prepare.requirements` and `prepare.review` semantics
- update `TaskMeta.activePlan` and task meta mirrors after edits
- emit abstract plan events

Adapter:

- OpenClaw-specific change-summary requirements for Feishu cards
- OpenClaw-specific plan review follow-up dispatch
- OpenClaw-specific completion side effects

Why:

The state machine belongs in the harness core.
Presentation and delivery behaviors belong in adapters.

### 4. `switch_task`

Source:

- `src/agents/tools/task-tool.ts`
- `src/agents/project-context.ts`

Core:

- load target task metadata
- resolve the target task's active plan
- preserve transition metadata such as `leaveState`, `previousTask`, and `inheritedFrom`
- expose task history fallback rules

Adapter:

- whether switching is a normal or rare workflow
- whether switching is bound to a current session
- takeover prompts and enforcement
- owner metadata writes

Why:

Task lineage is reusable harness behavior.
Session ownership is OpenClaw runtime policy.

### 5. Task history and inherited context

Source:

- `src/agents/project-context.ts`
- `src/agents/tools/task-history-tool.ts`
- ADR-0014

Core:

- record `leaveState`
- record `previousTask` and `inheritedFrom`
- compute safe fallback sources
- enforce task history limits
- stop fallback when snapshots are stale or invalid

Adapter:

- whether to expose that history as a host tool
- whether to auto-inject history into prompts

Why:

The lineage model is part of the harness data protocol.
How a host surfaces it is adapter work.

### 6. Memory model

Source:

- `src/agents/tools/memory-tool.ts`
- task-scope memory feature note
- ADR-0039

Core:

- project memory and task memory file paths
- project memory and task memory compatibility behavior
- the rule that new task-level context should prefer plan fields:
  - `rules`
  - `references`
  - `retrospective`
- memory search should resolve the correct local store from project/task scope
- task-local indexes are rebuildable artifacts, not the source of truth

Adapter:

- OpenClaw prompt injection and one-shot summary behavior
- OpenClaw-specific post-write memory refresh timing
- Gateway or plugin runtime wiring for memory engines

Why:

The memory model is a harness concern.
The injection strategy is host ergonomics.

### 7. Plan events

Source:

- `src/agents/plan-events.ts`
- `src/agents/tools/plan-tool.ts`

Core:

- a small event vocabulary:
  - `plan_created`
  - `plan_changed`
  - `plan_task_completed`
  - `plan_completed`
- event emission points after successful persistence

Adapter:

- what listens to those events
- reminder scheduling
- remote notifications
- downstream sync jobs

Why:

The event vocabulary is reusable and host-neutral.
The listeners are host-specific integrations.

### 8. Truth ingestion and truth docs

Source:

- `src/agents/truth-agent-dispatch.ts`
- `src/agents/specs/TRUTH-AGENT-SPEC.md`

Core:

- canonical truth root is `.claw/truth/`
- truth writes are based on project/task report material
- truth tasks need a stable structured input shape
- truth dispatch should be able to ingest reports and update canonical docs

Adapter:

- Gateway `agent` and `agent.wait` RPC usage
- truth-agent session key policy
- OpenClaw memory refresh after truth writes
- truth-session compaction

Why:

Truth doc semantics belong in the harness.
How OpenClaw runs a dedicated truth agent belongs in the adapter.

### 9. Plan guard

Source:

- `src/auto-reply/reply/agent-runner-plan-guard.ts`
- plan/task flow note

Core:

- none of the scheduling or reminder delivery
- only the reusable decision rules may belong in core:
  - plan status gating
  - task completion gating
  - active-plan resolution rules

Adapter:

- idle/settle scheduling
- cooldown maps
- reminder injection through chat
- owner checks and stale-owner cleanup
- takeover notices

Why:

Plan guard is mostly host runtime behavior.
Its underlying status rules can be shared, but its execution model is OpenClaw-specific.

## Recommended Package Split

### `claw-kit core`

Should own:

- `.claw` path resolution
- task and plan file schemas
- task creation through `plan_write`
- task lineage metadata
- plan state machine
- structured task context fields in plan documents
- memory path resolution and local search/index contracts
- truth input/output contracts
- plan event vocabulary

### `claw-kit openclaw adapter`

Should own:

- session-bound `ActiveContext`
- takeover and ownership policy
- active context persistence and restore
- plan guard scheduling and delivery
- Gateway `agent` RPC orchestration
- OpenClaw-specific follow-up hooks and UI side effects

### `claw-kit codex adapter`

Should own:

- resolve `.claw` from `cwd`
- invoke core commands
- use `plan_write` as the way task scope becomes explicit
- optionally provide skills or thin plugin guidance

It should not try to recreate OpenClaw session mechanics.

## Immediate Consequence

The next CLI contracts should be defined in this order:

1. context resolution from `cwd`
2. `plan_write`
3. `plan_edit`
4. memory search/index path resolution
5. truth ingest input contract

Only after those are fixed should we decide whether a specific OpenClaw runtime
helper, like plan guard or session restore, is worth extracting into a shared
library surface.
