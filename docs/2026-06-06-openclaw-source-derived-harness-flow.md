# OpenClaw Harness Flow Notes

## Purpose

This note treats `OpenClaw-dev` as the primary source of truth for `claw-kit`.

The goal is not to redesign the harness from scratch.
The goal is to extract the existing harness behavior into a host-neutral core
that can later be adapted back into OpenClaw as a plugin and also exposed to
Codex or OpenCode.

## Primary Source Files

- `D:/Users/chany/Documents/OpenClaw-dev/src/agents/tools/plan-tool.ts`
- `D:/Users/chany/Documents/OpenClaw-dev/src/agents/tools/memory-tool.ts`
- `D:/Users/chany/Documents/OpenClaw-dev/src/agents/project-context.ts`
- `D:/Users/chany/Documents/OpenClaw-dev/src/agents/plan-events.ts`
- `D:/Users/chany/Documents/OpenClaw-dev/src/agents/truth-agent-dispatch.ts`
- `D:/Users/chany/Documents/OpenClaw-dev/src/auto-reply/reply/agent-runner-plan-guard.ts`
- `D:/Users/chany/Documents/OpenClaw-dev/.claw/truth/adr/ADR-0014-plan-write-binds-task-scope-and-history-fallback.md`
- `D:/Users/chany/Documents/OpenClaw-dev/.claw/truth/adr/ADR-0039-plan-is-task-scope-memory-source.md`
- `D:/Users/chany/Documents/OpenClaw-dev/.claw/truth/features/plan-task-dataflow.md`
- `D:/Users/chany/Documents/OpenClaw-dev/.claw/truth/features/task-scope-memory.md`

## Extracted Facts

### 1. `.claw` and task files are the durable harness state

The durable harness state is carried by project-local task and truth files,
not by host memory.

The key persistent records are:

- `.claw/project.json`
- `.claw/truth/`
- `.claw/tasks/{taskName}/meta.json`
- `.claw/tasks/{taskName}/plan.json`
- optional subplans under the task scope
- project and task memory artifacts plus rebuildable indexes

Host session state is still important in OpenClaw, but it is not the canonical
business record.

### 2. `plan_write` is what establishes task scope

This is the most important product rule for `claw-kit`.

From ADR-0014 and `plan-tool.ts`:

- `plan_write` does not just create a plan file
- when creating a new task-bound plan, it derives a task name
- it ensures the task exists
- it binds the current active task scope to that task
- it writes the task-bound canonical plan file
- it updates `TaskMeta.activePlan`

This means `task scope` is not a side channel.
It is created and refreshed through the planning workflow itself.

### 3. `TaskMeta.activePlan` is a core compatibility field

`meta.json.activePlan` is the stable pointer used across the runtime:

- `plan_edit` resolves the active task-bound plan through it
- `switch_task` restores the current task plan through it
- plan guard reads it
- downstream sync and follow-up flows read it

So even if we later add a cleaner resolver abstraction in `claw-kit`, we should
preserve `activePlan` as a canonical compatibility field.

### 4. plan is the recommended task-scope memory source

ADR-0039 is explicit here:

- task-level structured context should live in plan fields
- `plan.rules` carries operating constraints
- `plan.references` carries evidence, files, and external references
- `plan.retrospective` carries close-out lessons
- `keyDecisions` remains the decision-deposition candidate field

`memory_edit(scope="task")` and `memory_search(scope="task")` still exist, but
they are compatibility and historical access paths, not the recommended place
for new task context.

### 5. task memory still exists, but is secondary

From `memory-tool.ts` and the task-scope memory feature note:

- task memory is still stored as task-local `memory.md`
- task scope memory search can use a task-local `memory.sqlite`
- `scope="task"` remains valid
- new task context should prefer plan fields over task memory

For `claw-kit`, this means task memory should be preserved, but not centered.

### 6. `switch_task` is real, but not the source of task creation

`switch_task` remains a real capability in OpenClaw, especially because
OpenClaw reuses sessions heavily.

But the primary creation path is still `plan_write`.

So for extraction:

- preserve `switch_task`
- do not make it the main Codex entrypoint
- do not move task creation semantics out of `plan_write`

### 7. plan guard is downstream of task binding and plan status

From `agent-runner-plan-guard.ts` and the plan/task flow notes:

- guard operates on the active task scope
- it reads task meta, especially `activePlan`
- it resolves the current plan document
- it reacts to plan status and plan task status
- it is tied to OpenClaw session ownership semantics

This is important because it shows what belongs in `claw-kit core` versus what
belongs in a strong host adapter:

- core should own plan/task status vocabulary and file semantics
- OpenClaw adapter should own the stronger session-bound reminder behavior

### 8. truth is already a separate layer

The truth flow in OpenClaw is already organized like a distinct system:

- reports and source material are gathered from harness activity
- truth-specific dispatch updates canonical truth docs
- truth writes go into `.claw/truth/`

This is a strong candidate for direct extraction into `claw-kit core`.

## Extraction Guidance

### What `claw-kit core` should preserve exactly

- `.claw` as canonical project-local state
- `plan_write` as the way task scope is created and bound
- `TaskMeta.activePlan` as the current task-plan pointer
- plan status and task status semantics
- plan structured memory fields:
  - `rules`
  - `references`
  - `retrospective`
  - `keyDecisions`
- task-local memory compatibility
- truth writes into `.claw/truth/`

### What should stay host-specific

- session ownership metadata and takeover logic
- plan guard scheduling and reminder delivery
- subagent settle hooks
- OpenClaw UI or Feishu side effects

## Design Consequence For Codex

For Codex, the right adaptation is not:

- invent a Codex-native task/session flow
- then try to map OpenClaw onto it

The right adaptation is:

1. resolve `.claw/` from `cwd`
2. let `plan_write` establish task scope, just like OpenClaw
3. let plan/memory/truth commands operate on that same file protocol
4. keep stronger reminder/session machinery out of the Codex MVP

## Current Recommendation

Before adding more Codex-specific design, finish one source-derived pass over
these OpenClaw seams:

- `plan_write`
- `plan_edit`
- `switch_task`
- task meta schema
- task memory compatibility
- truth dispatch inputs and outputs

That should define `claw-kit` much more reliably than borrowing patterns from
reference projects alone.

The current extraction split derived from those seams is summarized in:

- `docs/2026-06-06-openclaw-extraction-boundary-matrix.md`
