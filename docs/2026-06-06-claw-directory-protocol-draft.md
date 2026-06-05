# claw-kit `.claw` Directory Protocol Draft

## Purpose

Define the first portable file protocol for `claw-kit`.

This draft is based on the already-working OpenClaw harness, but shifts the source of truth toward project-local files so Codex, OpenCode, and future hosts can all operate on the same visible structure.

Two constraints shape this draft:

1. `claw-kit` must eventually plug back into OpenClaw as a plugin or adapter layer, not require a permanent hard-coupled fork in OpenClaw core.
2. Existing projects already use this `.claw` structure, so the protocol should preserve current layout and semantics wherever possible.

## Scope

This draft covers:

- project-local `.claw/` layout
- source-of-truth files
- host-managed caches and mirrors
- compatibility with current OpenClaw concepts

This draft does not yet define:

- exact CLI argument shapes
- exact SQLite schema
- exact truth ingestion command behavior
- exact host plugin APIs

## Design Options

### Option 1: Keep OpenClaw state-dir layout as the canonical source

Canonical state stays outside the repo, close to the current OpenClaw layout:

```text
{stateDir}/.projects/{projectId}/...
```

Pros:

- closest to current OpenClaw implementation
- avoids cluttering the repo
- good for multi-project centralized state

Cons:

- weak portability across hosts
- hard for Codex/OpenCode to reason about without custom restore logic
- harder to inspect, diff, back up, or share
- pushes too much responsibility into adapters

### Option 2: Make project-local `.claw/` the canonical source of truth

Canonical state lives in the repo or working project root:

```text
{projectRoot}/.claw/...
```

Pros:

- strongest portability
- easiest for CLI-first workflows
- visible, inspectable, and host-agnostic
- Codex/OpenCode can work from `cwd` plus filesystem alone

Cons:

- requires OpenClaw to adapt from its current state-root bias
- some users may prefer not to store task state inside the project tree

### Option 3: Dual-write canonical model

Treat project-local `.claw/` and host state-dir mirrors as equal peers.

Pros:

- flexibility for each host

Cons:

- conflict-prone
- unclear authority
- much harder to debug and migrate

## Recommendation

Recommend **Option 2**, but with a compatibility-first reading:

- project-local `.claw/` is the canonical cross-host source of truth
- host-private state stores are caches, indexes, or mirrors only
- OpenClaw can keep its state-dir machinery, but should treat it as an adapter layer around canonical `.claw/`
- current `.claw` layout should be preserved as much as possible so existing projects continue to work naturally

This is the cleanest way to make `claw-kit` usable in Codex and OpenCode without recreating OpenClaw's full runtime, while still leaving a path for OpenClaw to consume the extracted kit as a plugin.

## Core Principle

For `claw-kit`, the host should not be required to remember scope in memory in order to understand the current working state.

The filesystem must be enough.

That means:

- current project state is readable from `.claw/`
- task and plan relationships are explicit
- truth and memory locations are deterministic
- host session state is only an optimization

## Proposed Canonical Layout

The intention is continuity, not invention. This layout should stay very close to today's real `.claw` projects.

```text
.claw/
|- project.json
|- memory.md
|- memory.sqlite
|- .knowledge/
|- truth/
|  |- PROJECT-TRUTH.md
|  |- SUMMARY.md
|  |- features/
|  `- adr/
|- tasks/
|  `- {taskName}/
|     |- meta.json
|     |- plan.json
|     |- plans/
|     |- memory.md
|     |- memory.sqlite
|     |- context/
|     `- subagents/
`- runtime/
   |- indexes/
   |- exports/
   `- host/
```

## File Roles

### `.claw/project.json`

Project-level declaration and stable configuration surface for the harness.

Recommended responsibilities:

- project id
- optional display name
- memory/index preferences
- host-neutral harness options

This should be the long-term portable entrypoint, while remaining compatible with current `.claw` project expectations.

### `.claw/memory.md`

Canonical project memory markdown.

This is the portable equivalent of OpenClaw's project-scoped memory file.

It should remain:

- human-readable
- append/editable
- host-neutral

### `.claw/memory.sqlite`

Project-scoped local search/index store.

This is not the semantic source of truth. The source of truth is still the markdown and referenced documents. The SQLite file is a rebuildable acceleration layer.

### `.claw/.knowledge/`

Project-scoped durable knowledge documents and imported reference material intended to be searchable alongside memory/truth.

This matches the role already implied by OpenClaw's project memory search defaults.

### `.claw/truth/`

Canonical truth document root and the only target truth write surface.

Recommended contents:

- `PROJECT-TRUTH.md`
- `SUMMARY.md`
- `features/*.md`
- `adr/*.md`

This should be considered portable and canonical by default.

### `.claw/tasks/{taskName}/meta.json`

Canonical task metadata file.

This should carry the portable subset of current OpenClaw `TaskMeta`, especially:

- `name`
- `description`
- `createdAt`
- `updatedAt`
- `status`
- `taskType`
- `activePlan`
- `rules` if mirrored for convenience
- optional session-binding fields when the host wants to persist task ownership
- takeover and leave-state fields only if they have portable meaning

### `.claw/tasks/{taskName}/plan.json`

Root plan for the task.

This is the default active plan unless `meta.json.activePlan` points to another file such as a subplan.

### `.claw/tasks/{taskName}/plans/`

Subplans belonging to the same task scope.

This preserves the current OpenClaw idea that a subplan expands a task without creating a new task scope.

### `.claw/tasks/{taskName}/memory.md`

Task-local compatibility/history memory file.

Keep it for compatibility and explicit historical notes, but preserve the current OpenClaw direction:

- new task-level working context should prefer:
  - `plan.rules`
  - `plan.references`
  - `plan.retrospective`

### `.claw/tasks/{taskName}/memory.sqlite`

Task-scoped local search/index store.

Like project memory SQLite, this is rebuildable, not canonical.

### `.claw/tasks/{taskName}/context/`

Prepared context packages, manifests, and reusable scoped artifacts for agent handoff.

This is a good place for future `claw-kit` context suggestion outputs.

### `.claw/tasks/{taskName}/subagents/`

Recorded subagent reports and handoff artifacts.

These are not the same as truth docs. They are execution evidence and task history.

### `.claw/runtime/`

Host-managed rebuildable artifacts that should not be treated as semantic truth.

Examples:

- derived indexes
- temporary exports
- host-specific metadata

This directory exists to avoid mixing portable protocol files with host-private operational debris.

## Source Of Truth Rules

### Canonical

Treat these as canonical:

- `.claw/project.json`
- `.claw/memory.md`
- `.claw/truth/**`
- `.claw/tasks/{taskName}/meta.json`
- `.claw/tasks/{taskName}/plan.json`
- `.claw/tasks/{taskName}/plans/*.json`
- `.claw/tasks/{taskName}/memory.md`
- `.claw/tasks/{taskName}/context/**`
- `.claw/tasks/{taskName}/subagents/**`

### Rebuildable / Non-canonical

Treat these as rebuildable:

- `.claw/memory.sqlite`
- `.claw/tasks/{taskName}/memory.sqlite`
- `.claw/runtime/**`

If a host wants additional caches outside the repo, those should also be treated as non-canonical mirrors.

## Mapping From Current OpenClaw

### Current OpenClaw concept

```text
{stateDir}/.projects/{projectId}/config.json
```

### Proposed claw-kit mapping

```text
.claw/project.json
```

### Current OpenClaw concept

```text
{stateDir}/.projects/{projectId}/memory.md
{stateDir}/.projects/{projectId}/memory.sqlite
```

### Proposed claw-kit mapping

```text
.claw/memory.md
.claw/memory.sqlite
```

### Current OpenClaw concept

```text
{stateDir}/.projects/{projectId}/truth/
```

### Proposed claw-kit mapping

```text
.claw/truth/
```

### Current OpenClaw concept

```text
{stateDir}/.projects/{projectId}/tasks/{taskName}/...
```

### Proposed claw-kit mapping

```text
.claw/tasks/{taskName}/...
```

## `activePlan` Rule

Keep the current OpenClaw rule:

- `task meta.activePlan` is the authoritative pointer to the current plan within that task
- if absent, default to `plan.json`
- subplans remain inside the same task directory

This is one of the most useful existing semantics and should survive intact.

## Host Adapter Rules

### Codex / OpenCode

Adapters should assume:

- current `cwd` identifies the project root
- `.claw/` is sufficient to discover task/plan state
- for many hosts, one session may be strongly bound to one task
- explicit `switch-task` is optional rather than mandatory, and better treated as an advanced revisit flow

They should not require automatic restore to function.

### OpenClaw

OpenClaw can continue to keep host-private state-dir metadata, but should gradually map it onto canonical `.claw/` through a plugin/adapter integration.

That means:

- state-dir mirrors are acceptable
- canonical writes should eventually target `.claw/`
- restore logic may still be host-specific and more important here than in Codex/OpenCode

## Git Rules

Suggested default:

- canonical `.claw/` files should be committable unless the team decides otherwise
- rebuildable index files may be ignored

A likely starting point:

```gitignore
.claw/runtime/
.claw/memory.sqlite
.claw/tasks/*/memory.sqlite
```

Whether `.claw/tasks/*/subagents/` should be committed is still an open policy decision. They may be useful history, but they can also grow quickly.

## Open Questions

1. Should `.claw/project.json` include host adapter preferences, or should those live in a separate host file?
2. Should task ownership fields remain in `meta.json`, or are they OpenClaw-only runtime data?
3. Should `subagents/` be canonical history or move under `.claw/runtime/` as operational evidence?
4. Should any host retain a hidden truth mirror for operational reasons, while still treating `.claw/truth/` as the only canonical write target?

## Current Recommendation

For the next design step, assume:

- `.claw/` is canonical
- `activePlan` semantics remain unchanged
- truth is project-local under `.claw/truth/`
- SQLite and runtime artifacts are rebuildable
- `switch-task` is important for OpenClaw-style multi-task-per-session hosts, but optional elsewhere
- existing `.claw` project structure should be accepted with minimal or no migration

That is enough to define the first CLI surface without dragging in host-specific session machinery.
