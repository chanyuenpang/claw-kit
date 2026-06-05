# `claw-kit` MVP Derived From OpenClaw

## Goal

Define the first `claw-kit` implementation surface by mapping directly from
existing `OpenClaw-dev` harness behavior.

This document is intentionally narrow:

- what command surfaces are justified now
- what each one is really preserving from OpenClaw
- what should wait until the OpenClaw adapter phase

## MVP Principle

If a capability is already a stable OpenClaw harness rule and can operate on
canonical `.claw` files, it is a good `claw-kit core` candidate.

If it depends on OpenClaw session runtime, Gateway delivery, or reminder
scheduling, it should wait for the OpenClaw adapter.

## Recommended First Core Commands

### 1. Project context resolver

Purpose:

- resolve project root from `cwd`
- find `.claw/`
- load `project.json`
- optionally resolve an explicit task and its `activePlan`

Why it belongs:

- every other command needs this
- it is already implicit in OpenClaw path helpers
- it is the right cross-host primitive

Status here:

- partially implemented in `src/context.ts`

### 2. `claw plan write`

Purpose:

- create or update a task-bound root plan
- derive or ensure the target task
- bind task scope through planning, not through attach/session tricks
- persist `TaskMeta.activePlan`

Why it belongs:

- this is the main OpenClaw harness creation path
- user explicitly wants the same behavior preserved

What to preserve from OpenClaw:

- task scope is established by `plan_write`
- root plan defaults to `plan.json`
- canonical status model
- structured task context fields in the plan document

What can wait:

- OpenClaw follow-up review dispatch
- Feishu/UI change summary integration
- takeover policy

### 3. `claw plan edit`

Purpose:

- edit an existing task-bound plan
- mutate plan status and task status
- preserve lifecycle and validation rules

Why it belongs:

- it is the main continuation path after `plan_write`
- it owns much of the core harness state machine

What to preserve from OpenClaw:

- canonical status transitions
- `prepare.requirements` and `prepare.review`
- task status validation
- `retrospective.summary` gate on completion

What can wait:

- OpenClaw-specific side effects after edit completion

### 4. `claw memory search`

Purpose:

- resolve the correct local memory/index store from current project and,
  when explicit, current task scope
- search canonical project or task-local memory artifacts

Why it belongs:

- user explicitly called this out for Codex
- it is central to making `.claw` useful outside OpenClaw runtime

What to preserve from OpenClaw:

- project scope remains the normal default
- task scope remains compatible but secondary
- task-level structured context prefers plan fields
- indexes are rebuildable artifacts

What can wait:

- OpenClaw-specific prompt injection strategy
- background refresh timing

### 5. `claw memory index`

Purpose:

- build or refresh local search indexes from `.claw`-backed memory artifacts

Why it belongs:

- `memory search` is weak without a stable local indexing path
- the user wants commands to find the right local database automatically

What to preserve from OpenClaw:

- project-local and task-local index separation when needed
- source of truth remains files, not the sqlite artifact

### 6. `claw truth ingest`

Purpose:

- accept a report-like input
- update canonical truth docs under `.claw/truth/`

Why it belongs:

- truth is one of the three major harness subsystems
- it is already conceptually separate from session runtime

What to preserve from OpenClaw:

- canonical truth root in `.claw/truth/`
- structured report input
- doc update behavior as a separate subsystem

What can wait:

- spawning a dedicated truth agent through Gateway
- truth session compaction
- post-write memory refresh hooks

## Commands That Should Not Be MVP-Critical

### `claw attach`

Current judgment:

- may remain as a low-level debugging helper
- should not be the center of the Codex product story

Reason:

- project detection comes from `cwd`
- task scope comes from `plan_write`

### `claw switch-task`

Current judgment:

- should exist eventually
- should not block the first Codex-capable harness core

Reason:

- the user considers it an advanced or rare workflow now
- the OpenClaw harness itself is already centered more on `plan_write`

### plan guard

Current judgment:

- not a core CLI command
- mostly an OpenClaw adapter feature

Reason:

- depends heavily on runtime scheduling and ownership semantics

## Recommended Implementation Order

1. strengthen the existing context resolver
2. implement `claw plan write`
3. implement `claw plan edit`
4. implement `claw memory search`
5. implement `claw memory index`
6. implement `claw truth ingest`

## Immediate Design Constraint

For every command above, the first design question should be:

`What exact OpenClaw file mutation or read path are we preserving?`

Not:

`What would be a cleaner greenfield command?`

That keeps `claw-kit` aligned with the extraction goal rather than drifting
into a new harness design.
