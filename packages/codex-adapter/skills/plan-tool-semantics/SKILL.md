---
name: plan-tool-semantics
description: Use before claw plan write, claw plan edit, or claw switch-task to preserve OpenClaw plan semantics.
---

# claw-kit plan tool semantics

Use this skill whenever you are about to call `claw plan write`, `claw plan edit`, or `claw switch-task`.

## Purpose

This skill explains the harness semantics carried by the plan tools themselves, so Codex can use them with the same mental model as OpenClaw.

## Core model

There is no separate durable "plan scope" outside task scope.

The canonical chain is:

- project-local `.claw/`
- task directory under `.claw/tasks/<task>/`
- `meta.json.activePlan`
- active plan file such as `plan.json`

In other words:

- task scope is the durable working scope
- the plan file is the task-level structured source of truth
- `activePlan` is the pointer that binds the current workflow node inside that task

## `claw plan write`

`plan write` is the canonical way to establish task scope.

What it means:

- creating a new plan also creates or ensures the same-named task
- the plan is written inside that task directory
- `meta.json.activePlan` is updated to point at the written plan
- this is how a task becomes the active durable work container

What to put in the plan:

- `goal.text`
- `tasks`
- `rules`
- `references`
- `keyDecisions` when real durable decisions already exist
- `retrospective` only when closing or recording lessons learned

Important:

- do not use task memory as the main place for fresh task context
- use the plan's structured fields instead

## `claw plan edit`

`plan edit` is the canonical way to mutate the active task-bound plan.

Use it for:

- updating `goal`
- refining `tasks`
- changing plan lifecycle status
- updating `rules`
- updating `references`
- writing `retrospective`
- recording `keyDecisions`

### Plan status state machine

Canonical statuses are:

- `prepare.requirements`
- `prepare.review`
- `process.active`
- `process.wait`
- `process.discussing`
- `end.completed`
- `end.closed`
- `end.leave`

### State rules

- new plans default to `prepare.requirements`
- the main execution gate is `prepare.requirements -> process.*`
- `prepare.review` is an internal review gate
- agents should not directly choose `prepare.review` as a target status
- task progress updates belong only in `process.*`
- `process.* -> prepare.*` is forbidden through normal editing
- `end.* -> process.*` requires reopening through `prepare.requirements`
- `end.completed` requires `retrospective.summary`

### Meaning of process states

- `process.active`
  - active execution is happening
- `process.wait`
  - the plan is waiting, usually for user input or an external dependency
- `process.discussing`
  - the plan is in design or discussion mode and should keep task scope without acting like execution is complete

### Meaning of end states

- `end.completed`
  - successful completion with retrospective
- `end.closed`
  - stopped or closed without the stricter completion requirement
- `end.leave`
  - explicit exit from the current task-bound workflow context

## `claw switch-task`

`switch-task` is real, but it is not the normal way to begin work.

Normal task establishment happens through `plan write`.

`switch-task` is mainly for:

- explicitly returning to an older task
- resuming or extending historical work
- recording task lineage

It should preserve task transition metadata such as:

- `leaveState`
- `previousTask`
- `inheritedFrom`

## Structured task context

Prefer these fields as the main task-level working memory:

- `rules`
  - constraints, conventions, working rules
- `references`
  - files, evidence, links, investigation anchors
- `retrospective`
  - closeout lessons and reusable learnings
- `keyDecisions`
  - durable implementation or architecture decisions already present in the plan

Task `memory.md` remains compatibility storage, not the preferred new write path for active task context.

## Subplans

Subplans should keep task scope stable.

That means:

- the task remains the durable scope
- the active workflow node can move by updating `meta.json.activePlan`
- the task is still the container; the active plan file is the current workflow pointer

## Codex usage rules

When using the plan tools in Codex:

1. Resolve the project from `cwd`.
2. Use `plan write` to create or bind task scope.
3. Use `plan review` semantics before leaving requirements.
4. Use `plan edit` for lifecycle and structured context mutation.
5. Use `switch-task` only when intentionally returning to historical work.

## Anti-patterns

Do not do these:

- treat task memory as the primary fresh task-context store
- create an implicit extra scope outside `.claw/tasks/<task>`
- set `prepare.review` directly as if it were a normal public status
- use `switch-task` as the default way to start all new work
- skip `retrospective.summary` when moving to `end.completed`
