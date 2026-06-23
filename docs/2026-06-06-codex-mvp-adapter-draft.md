# claw-kit Codex MVP Adapter Draft

## Goal

Define the smallest useful integration that lets Codex operate on existing `.claw/` projects without requiring OpenClaw runtime machinery.

This is a Codex-first delivery document, not the final cross-host architecture.

The guiding rule is:

- prefer compatibility with current `.claw` projects over inventing cleaner but newer abstractions

## Non-goals For This MVP

This MVP does not need to solve:

- heartbeat plan guard
- takeover reminders
- automatic truth trigger hooks
- archive policy
- full OpenClaw session restore behavior
- OpenCode-specific UX

If Codex can reliably read, create, and update `.claw` task, plan, memory, and truth artifacts, the MVP is successful.

## Codex Assumptions

Assume Codex can provide:

- current project root through `cwd`
- a stable session or thread identifier
- local file access
- shell access
- a plugin or skill entrypoint

Do not assume:

- deep lifecycle hooks on every internal step
- OpenClaw-style persistent active-context runtime
- automatic subagent completion notifications

## Recommended Default UX

For Codex, the default model should be:

1. user starts a new Codex session in a project
2. the adapter detects or initializes `.claw/`
3. the adapter creates a new task for that session unless the user explicitly targets an existing one
4. the session stays strongly bound to that task
5. plan, memory, and truth operations default to that task scope

This means `switch-task` exists, but as advanced usage for revisiting or continuing an older task.

## Minimum Capability Set

### 1. Project detection

Codex needs to:

- find the project root from `cwd`
- detect `.claw/`
- read `.claw/project.json` if present
- tolerate older projects where `project.json` is missing fields like `id`

### 2. Session task bootstrap

Codex needs a bootstrap action that:

- derives or creates the current task name
- ensures `.claw/tasks/{taskName}/meta.json` exists
- ensures `.claw/tasks/{taskName}/plan.json` exists when a plan is needed
- records `ownerSessionKey` when useful

This can be a CLI command or adapter entrypoint such as:

```text
claw attach
```

Conceptually it means:

- bind current session to a task
- create the task if needed
- return resolved paths and task metadata

### 3. Plan operations

Codex needs to operate on current task plans using existing OpenClaw semantics:

- `activePlan` stays authoritative
- root plan defaults to `plan.json`
- subplans stay in `plans/`
- current status transitions remain compatible with OpenClaw

Minimum commands:

- `claw plan create`
- `claw plan edit`
- `claw plan show`

### 4. Memory operations

Codex needs:

- project memory read or edit
- task memory read or edit
- memory index build
- memory search

Minimum commands:

- `claw memory edit`
- `claw memory index`
- `claw memory search`

### 5. Truth operations

Codex does not need automatic truth hooks for MVP.

It only needs:

- to locate `.claw/truth/`
- to ingest report material into canonical truth docs

Minimum command:

- `claw truth ingest`

### 6. Task revisit

Codex should support revisiting an existing task, but this is not the main flow.

Minimum command:

- `claw switch-task`

This should:

- resolve the target task
- load `meta.json`
- respect `activePlan`
- rebind the current session if the adapter chooses to track session ownership

## Suggested CLI Surface

The smallest credible CLI surface for Codex MVP is:

- `claw init`
- `claw attach`
- `claw plan create`
- `claw plan edit`
- `claw plan show`
- `claw memory edit`
- `claw memory index`
- `claw memory search`
- `claw truth ingest`
- `claw switch-task`

If we want to be even stricter, `claw switch-task` can ship slightly later than the rest.

## Suggested `claw attach` Output

The adapter bootstrap should return a simple structured payload, for example:

```json
{
  "projectRoot": "D:/Users/chany/Documents/claw-kit",
  "clawDir": "D:/Users/chany/Documents/claw-kit/.claw",
  "projectId": "claw-kit",
  "taskName": "codex-session-20260606-001",
  "taskDir": "D:/Users/chany/Documents/claw-kit/.claw/tasks/codex-session-20260606-001",
  "activePlan": "plan.json",
  "activePlanPath": "D:/Users/chany/Documents/claw-kit/.claw/tasks/codex-session-20260606-001/plan.json"
}
```

This is enough for a Codex plugin or skill to assemble prompt context and route later commands.

## Compatibility Rules

The Codex adapter should:

- accept existing `.claw` projects without migration
- avoid rewriting unrelated legacy fields
- preserve `activePlan`
- preserve lineage fields when present
- preserve takeover fields even if Codex itself does not use them

## Immediate Next Step

The next design pass should not be archive or OpenCode.

It should be:

- define the behavior and arguments of `claw attach`
- define how a Codex session chooses a new task name versus attaches to an existing task
- define the minimum read or write contract for `plan create`, `memory search`, and `truth ingest`
