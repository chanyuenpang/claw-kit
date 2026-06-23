# `claw attach` Command Contract

## Purpose

Define the first implementation-ready contract for `claw attach`.

This command is the cross-host handshake between:

- the current project root
- the canonical `.claw/` harness state
- an optional explicitly requested task scope

It is not responsible for creating or binding task scope by default.

That responsibility should stay with `plan create`, matching current OpenClaw direction.

## Role

`claw attach` should do exactly one thing:

- attach the current host context to a `.claw` project, and optionally resolve an explicitly named task scope

That means it must:

- resolve the current project
- locate `.claw/`
- load or derive project identity
- optionally resolve an explicitly named task
- if a task is explicitly named, resolve its `activePlan`
- return machine-readable context for later commands

It must not:

- create a new task by default
- mutate task ownership metadata
- auto-run truth ingestion
- rebuild memory indexes
- perform takeover workflows

## Command Shape

```text
claw attach [options]
```

## Options

### `--task <task-name>`

Explicitly resolve and attach to an existing task.

Behavior:

- if the task exists, return task-scoped context
- if the task does not exist, return `TASK_NOT_FOUND`

### `--json`

Return structured JSON output only.

This should be the default mode for adapter use.

## Default Behavior

If the user runs:

```text
claw attach --json
```

the command should behave like this:

1. resolve project root from `cwd`
2. locate `.claw/`
3. read `.claw/project.json` if present
4. derive `projectId` if absent
5. return project-scoped attach result

No task is created.

No task is implicitly selected.

This default is intentionally aligned with the updated decision:

- task scope should be established by `plan create`

## Task Resolution Rules

### Rule 1: no implicit task creation

If `--task` is absent:

- do not create a task
- do not attach to "last task"
- do not guess from session id

### Rule 2: explicit task only

If `--task` is present:

- normalize and validate the task name
- load `.claw/tasks/{taskName}/meta.json`
- resolve `activePlan`
- return task-scoped context

## Project Resolution Rules

### Project root

Resolve from current `cwd`.

For MVP:

- walk upward until a `.claw/` directory is found
- if none is found, return an error

### Project id

Preferred source:

- `.claw/project.json.id`

Fallbacks:

- `.claw/project.json.name`
- repository directory name

The chosen value should be returned as `projectId`.

## Metadata Write Rules

`claw attach` should not modify task metadata in MVP.

In particular, it should not write:

- `ownerSessionKey`
- `ownerRootAgentId`
- `boundAt`
- `updatedAt`

If future hosts want lightweight attach bookkeeping, that should be added later as an explicit enhancement.

## Plan Resolution Rules

Keep the current OpenClaw-compatible rule:

- authoritative source is `meta.json.activePlan`
- if absent, default to `plan.json`

Resolution steps for explicit `--task`:

1. read `meta.activePlan`
2. if present, resolve it relative to the task directory
3. reject path escape outside the task directory
4. if absent, use `plan.json`
5. if the resolved file is missing, return `ACTIVE_PLAN_MISSING`

## Output Contract

### Success output without task

```json
{
  "projectRoot": "D:/Users/chany/Documents/claw-kit",
  "clawDir": "D:/Users/chany/Documents/claw-kit/.claw",
  "projectId": "claw-kit",
  "projectName": "claw-kit"
}
```

### Success output with explicit task

```json
{
  "projectRoot": "D:/Users/chany/Documents/claw-kit",
  "clawDir": "D:/Users/chany/Documents/claw-kit/.claw",
  "projectId": "claw-kit",
  "projectName": "claw-kit",
  "taskName": "extract-harness-core",
  "taskDir": "D:/Users/chany/Documents/claw-kit/.claw/tasks/extract-harness-core",
  "activePlan": "plan.json",
  "activePlanPath": "D:/Users/chany/Documents/claw-kit/.claw/tasks/extract-harness-core/plan.json",
  "metaPath": "D:/Users/chany/Documents/claw-kit/.claw/tasks/extract-harness-core/meta.json"
}
```

### Required success fields

- `projectRoot`
- `clawDir`
- `projectId`

### Optional success fields

- `projectName`
- `taskName`
- `taskDir`
- `activePlan`
- `activePlanPath`
- `metaPath`

## Error Contract

Errors should be structured JSON in adapter mode.

Suggested shape:

```json
{
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Task \"foo\" does not exist.",
    "details": {
      "taskName": "foo"
    }
  }
}
```

### Recommended error codes

- `PROJECT_ROOT_NOT_FOUND`
- `CLAW_DIR_NOT_FOUND`
- `PROJECT_CONFIG_INVALID`
- `TASK_NOT_FOUND`
- `TASK_NAME_INVALID`
- `ACTIVE_PLAN_INVALID`
- `ACTIVE_PLAN_MISSING`

## First-Version Behavioral Decisions

### Decision 1: no session dependency

Reason:

- attach should be host-neutral
- task scope should come from explicit plan workflow, not implicit session binding

### Decision 2: no implicit "attach last task"

Reason:

- it is ambiguous
- it conflicts with the updated `plan create`-owns-task-binding decision
- it is easy to add later if truly needed

### Decision 3: no task creation in `attach`

Reason:

- user explicitly asked to follow OpenClaw direction
- `plan create` should establish task scope

## Compatibility Notes

`claw attach` should support current `.claw` projects by:

- preserving existing metadata shape
- not forcing migration to new fields
- not rewriting task files
- not changing `activePlan` semantics

## Open Questions

1. Should `plan create` create the task before plan creation in one command, or should there be a separate explicit `task create` later?
2. Should `attach` later support a read-only "suggest current task candidates" mode?
3. Should project attach also surface truth and memory root paths explicitly in the JSON result?

## Current Recommendation

Implement `claw attach` with these first-version semantics:

- project discovered from `cwd`
- `.claw/` required
- no explicit task means project-only attach
- explicit task means resolve that task only
- `activePlan` remains authoritative
- no metadata writes
- return structured JSON for adapter consumption

That is enough to support the next step: making `plan create` the true task-scope binding action.
