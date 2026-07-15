# OpenClaw Harness Extraction Notes

## Goal

Extract the existing harness concepts from `OpenClaw-dev` into a future `claw-kit` that can be reused across hosts such as Codex and OpenCode.

This note is intentionally grounded in current `OpenClaw-dev` behavior rather than a greenfield redesign.

Two constraints now govern the extraction:

1. The end-state is to plug `claw-kit` back into OpenClaw as a plugin, not to keep a special hard-coupled in-core implementation forever.
2. Existing `.claw` projects already use this structure, so protocol changes should be minimized. Prefer natural continuity over migration-heavy redesign.

## Current OpenClaw Surfaces

OpenClaw already contains four major harness surfaces that matter for extraction:

1. Project/task scope management
2. Plan creation and mutation
3. Memory files plus searchable indexes
4. Truth document generation

The important distinction is:

- Some behavior is already file/protocol based and portable
- Some behavior is coupled to OpenClaw runtime sessions, event delivery, and subagent lifecycle

## Existing File and Scope Model

OpenClaw's task-scoped working model already centers around project metadata directories under the state area, plus canonical files inside task directories.

Key helpers and types live in:

| Path | Role |
| ---- | ---- |
| `src/agents/project-context.ts` | Core source of truth for active context, task metadata, task directory helpers, and task binding |
| `src/agents/tools/task-tool.ts` | `switch_task` tool |
| `src/agents/tools/project-tool.ts` | `switch_project` tool |
| `src/agents/tools/plan-tool.ts` | `plan_write` / `plan_edit` |

Important existing structures:

- `TaskMeta.activePlan` is the authoritative pointer to the active plan file within a task
- `getTaskDir(projectsDir, projectId, taskName)` resolves the task directory
- `getTaskMemoryPath(projectsDir, projectId, taskName)` resolves task memory to `memory.md`
- `switch_task` does not scan for "the right" active plan first; it prefers `task.meta.activePlan`

Observed task directory conventions from code and docs:

```text
.projects/{projectId}/
|- memory.md
|- memory.sqlite
|- .knowledge/
|- truth/
`- tasks/{taskName}/
   |- meta.json
   |- plan.json
   |- plans/
   |- memory.md
   |- context/
   `- subagents/
```

For `claw-kit`, this is a strong candidate baseline because it is already:

- explicit
- file-backed
- scope-aware
- recoverable without runtime memory
- already used by real existing projects

## Switch Task

Current `switch_task` behavior is already close to a cross-platform harness primitive.

Real behavior from `src/agents/tools/task-tool.ts`:

- Requires an active project context
- Lists tasks on demand
- Switches only to an existing task
- Resolves the target plan from `task.meta.activePlan`, else `plan.json`
- Rejects path escape outside the task directory
- Returns recent task history summary
- Appends one-shot task memory summary to the tool result
- Optionally resets the conversation, but does not do so by default

What matters for extraction:

- The semantic operation is portable
- The OpenClaw-specific session invalidation after switch is not portable

Recommended `claw-kit` takeaway:

- Keep `switch task` as a portable action, but not a mandatory primary workflow in every host
- Do not make session reset part of the core protocol
- Treat "load task context into host session" as adapter behavior
- In hosts where one session naturally equals one task, it is acceptable to bind them directly and keep `switch task` as an advanced action for revisiting older tasks

## Plan Write and Plan Edit

The existing plan model is much richer than a plain todo file and should be treated as a protocol surface.

Key file:

| Path | Role |
| ---- | ---- |
| `src/agents/tools/plan-tool.ts` | Defines plan schema, transitions, subplans, review integration, and plan events |

Current plan properties that appear worth preserving:

- Canonical plan statuses:
  - `prepare.requirements`
  - `prepare.review`
  - `process.active`
  - `process.wait`
  - `process.discussing`
  - `end.completed`
  - `end.closed`
  - `end.leave`
- Task statuses:
  - `pending`
  - `in_progress`
  - `subagent_running`
  - `done`
  - `blocked`
- `taskType`
- `references`
- `rules`
- `retrospective`
- `parentPlan` / `parentTaskId` for subplans

Important semantic rules already encoded in OpenClaw:

- New plans default to `prepare.requirements`
- `prepare.review` is an internal review gate and should not be set directly by users
- Task progress is allowed only in `process.*`
- Ended plans can reopen only through `prepare.requirements`
- Subplans keep the same task scope and only move `task.meta.activePlan`

This is good extraction material because it is mostly:

- schema logic
- file mutation logic
- state transition logic

These can move into a CLI or shared library.

## Plan Events

OpenClaw already has a small event surface:

| Path | Role |
| ---- | ---- |
| `src/agents/plan-events.ts` | `plan_created`, `plan_changed`, `plan_task_completed`, `plan_completed` |

This is especially useful for `claw-kit` because it suggests a host-neutral event API.

Likely portable event names:

- `plan_created`
- `plan_changed`
- `plan_task_completed`
- `plan_completed`

Likely future additions if needed:

- `task_switched`
- `truth_requested`
- `context_package_requested`

OpenClaw currently emits listeners in-process and swallows listener failures. That exact delivery model is host-specific, but the event vocabulary itself is portable.

## Memory Model

OpenClaw memory is split into two distinct concerns:

1. Durable markdown memory files
2. Searchable local indexes

Key files:

| Path | Role |
| ---- | ---- |
| `src/agents/tools/memory-tool.ts` | `memory_edit` writes global/project/task memory files |
| `src/agents/memory-search.ts` | resolves store paths and extra paths for memory search |
| `extensions/memory-core/...` | deeper search/index implementation behind the tool layer |

Important current behavior:

- `global` memory defaults to workspace `MEMORY.md`
- `project` memory writes to `{projectsDir}/{projectId}/memory.md`
- `task` memory writes to `{taskDir}/memory.md`
- Task append is capped at 50 table entries
- Task-level context is no longer the preferred write target
- Preferred task-level structured context is:
  - `plan.rules`
  - `plan.references`
  - `plan.retrospective`

Search behavior:

- `scope="task"` uses a task-local `memory.sqlite`
- `scope="project"` uses a project-local `memory.sqlite`
- Task search extra paths point only at task `memory.md`
- Project search can include project memory and `.knowledge/`

This is a strong candidate for `claw-kit` extraction because the essential behavior is already not tied to a specific chat session:

- path resolution
- scope rules
- local store layout
- index refresh logic

The host-specific part is only how and when the host chooses to call these capabilities.

## Truth Generation

Truth generation in OpenClaw already follows a clean two-layer model.

Key files:

| Path | Role |
| ---- | ---- |
| `src/agents/truth-subagent-hook.ts` | runtime hook that decides whether to trigger truth update |
| `src/agents/truth-agent-dispatch.ts` | builds truth/ADR tasks and dispatches the writer agents |
| `src/agents/specs/TRUTH-AGENT-SPEC.md` | truth writing protocol |
| `src/agents/specs/ADR-AGENT-SPEC.md` | ADR writing protocol |

Current architecture:

- Program layer:
  - check `truthSource.enabled`
  - skip excluded agents
  - skip stale reports
  - skip empty reports
  - dispatch truth agent
- Agent layer:
  - read existing canonical truth files
  - decide whether report is worth deposition
  - edit canonical truth markdown directly

This is highly reusable.

What is portable:

- canonical truth file set
- truth-writing prompt/spec
- report ingestion model
- truth/ADR routing rules
- project-local `.claw/truth/` as the canonical truth root

What is host-coupled:

- automatic trigger on subagent completion
- waiting on hosted agent runs through gateway calls
- post-write memory refresh scheduling

For `claw-kit`, truth should be treated as project-local canonical state under `.claw/truth/`.

Triggering can still have two modes:

- manual/explicit:
  - `claw truth ingest <report>`
- host-augmented:
  - adapter hook calls the same truth ingestion flow automatically

## What Looks Portable Today

These surfaces appear suitable for extraction into a shared CLI/library:

1. `.claw` or equivalent project/task/plan directory protocol
2. Task metadata schema
3. Plan schema and transition rules
4. optional `switch task` semantics for revisiting older tasks in multi-task-per-session hosts
5. Memory file layout and scope semantics
6. Local memory store path resolution
7. Truth canonical file layout
8. Truth/ADR ingestion specs
9. Plan event vocabulary

## What Looks OpenClaw-Coupled Today

These surfaces appear coupled to OpenClaw runtime and should not become mandatory core assumptions:

1. Session-key based active context map
2. Root-agent and child-session ownership tracking
3. Automatic task binding persistence inside the runtime
4. Heartbeat-based plan guard reminders
5. Subagent lifecycle completion hooks
6. Gateway-mediated `agent.create` / `agent.wait`
7. Conversation reset / session expiration on context switch
8. Feishu-specific sync and card-display side effects

These should become optional adapter features, not core protocol requirements.

Important nuance after comparing hosts:

- session identity itself should be treated as commonly available
- what differs is whether a host routinely reuses one session across many tasks
- OpenClaw does, so explicit task switching and session-scoped guard ownership matter more there
- Codex and OpenCode may instead accept a simpler default where one new session usually means one new task
- completed or stale tasks should gradually leave the active working set and behave more like archive or memory-search corpus

## Early Mapping To Other Hosts

### Codex

Likely available:

- stable current working directory
- stable session id or equivalent host conversation/session identifier
- local filesystem
- shell access
- plugin/skill layer

Likely weak or host-specific:

- automatic post-tool hooks for every internal lifecycle event

Implication:

- Codex is a good first adapter for `plan create`, `memory search`, `truth ingest`
- Creating a new session can reasonably default to creating and binding a new task
- Explicit `switch task` should be treated as advanced usage for revisiting an older task, not the default recommended path
- Codex should not be the design center for automatic restore or plan guard

### OpenCode

From the workflow-oriented reference plugin, OpenCode appears to have stronger plugin/hook support than Codex in some areas.

Likely available:

- stable current working directory
- stable session id or equivalent host conversation/session identifier

Implication:

- OpenCode may be a better target for later automatic bootstrap and hook-based truth/review integration
- OpenCode can also reasonably default to `new session => new task`
- But the core protocol should still not require those hooks

### OpenClaw

OpenClaw should be treated as:

- the source system for semantics
- the strongest runtime host
- a future plugin host for the extracted kit
- not the minimum common denominator

## Working Direction For claw-kit

Current best-fit direction:

- shared CLI/library core for file-backed harness semantics
- thin host adapters for session/bootstrap/hook integration
- skill-driven fallback for hosts without hooks
- an OpenClaw adapter/plugin that consumes the same core rather than re-implementing semantics in-core

Reasonable first-class core actions:

- `claw init`
- `claw plan create`
- `claw plan edit`
- `claw memory index`
- `claw memory search`
- `claw truth ingest`

Reasonable host-conditional actions:

- `claw switch-task`
- `claw task archive`

Lower-priority or host-specific actions:

- automatic scope restore
- heartbeat plan guard
- automatic truth trigger on subagent completion

## Open Questions

1. Should `claw-kit` keep the `.projects/{projectId}` state-root layout, or move to a project-local `.claw/` source-of-truth first and let hosts mirror it elsewhere?
2. Should `activePlan` remain a task-meta pointer exactly as in OpenClaw, or become a more generic current-plan field with adapter mapping?
3. Should memory search use the existing OpenClaw memory-core path, or should `claw-kit` define a thinner first-pass SQLite/FTS layer and leave graph/RAG depth to GitNexus-style integrations?
4. Should truth ingestion always be agent-driven, or should `claw-kit` also support deterministic rule-only deposition for simple environments?

## Key Source Anchors

| Path | Why it matters |
| ---- | ---- |
| `src/agents/project-context.ts` | current scope/task/project source of truth and directory helpers |
| `src/agents/tools/task-tool.ts` | real `switch_task` semantics |
| `src/agents/tools/plan-tool.ts` | real plan protocol and lifecycle |
| `src/agents/tools/memory-tool.ts` | real memory write semantics |
| `src/agents/memory-search.ts` | real scope-aware memory index resolution |
| `src/agents/truth-subagent-hook.ts` | runtime-trigger boundary for truth |
| `src/agents/truth-agent-dispatch.ts` | reusable truth dispatch model |
| `src/agents/plan-events.ts` | candidate portable event vocabulary |
