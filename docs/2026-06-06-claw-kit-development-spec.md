# claw-kit Development Spec

## Goal

`claw-kit` extracts the existing OpenClaw harness into a reusable core while preserving compatibility with current `.claw/` projects. The first delivery ships:

- `packages/core`
- `packages/cli`
- `packages/codex-adapter`
- `packages/openclaw-adapter` skeleton

## Canonical state model

- Canonical project state lives in project-local `.claw/`.
- Canonical truth root is `.claw/truth/`.
- `plan_write` is the canonical path for establishing task scope.
- `TaskMeta.activePlan` remains the canonical active-plan pointer.
- Active task working context is primarily carried by plan structured fields:
  - `rules`
  - `references`
  - `retrospective`
  - `keyDecisions`
- Task `memory.md` remains compatibility storage, not the preferred new task-context write path.

## Package topology

- `packages/core`
  - `.claw` path resolution
  - schema and file I/O
  - `plan write`
  - `plan edit`
  - `switch-task`
  - memory indexing and search
  - truth ingest
  - plan event vocabulary
- `packages/cli`
  - `claw` command dispatcher
  - JSON output and shared error envelope
- `packages/codex-adapter`
  - skills-only Codex plugin wrapper
  - local CLI workflow guidance
- `packages/openclaw-adapter`
  - adapter contracts for `ActiveContext`, ownership, plan guard, reminder scheduling, and truth dispatch

## CLI surface

- `claw context`
- `claw plan write`
- `claw plan edit`
- `claw switch-task`
- `claw memory index`
- `claw memory search`
- `claw memory get`
- `claw truth ingest`

## Lifecycle rules

- Canonical plan statuses:
  - `prepare.requirements`
  - `prepare.review`
  - `process.active`
  - `process.wait`
  - `process.discussing`
  - `end.completed`
  - `end.closed`
  - `end.leave`
- Public writes cannot set `prepare.review` directly.
- `prepare.requirements -> process.*` is the only review gate.
- Actionable review feedback rewrites the transition into internal `prepare.review`.
- `prepare.review -> process.*` does not run the same review gate again.
- `process.* -> prepare.*` is forbidden in `plan_edit`.
- `end.* -> process.*` requires reopen through `prepare.requirements`.
- `end.completed` requires `retrospective.summary`.
- `PlanTask.status` canonical values:
  - `pending`
  - `in_progress`
  - `subagent_running`
  - `done`
  - `blocked`

## Memory rules

- Default memory search scope is project-level `.claw/memory.sqlite`.
- Task scope index path is `.claw/tasks/<task>/memory.sqlite`.
- Project scope indexes:
  - `.claw/memory.md`
  - `.claw/truth/**/*.md`
  - `.claw/.knowledge/**/*.{md,txt,json}`
  - declared external docs from `.claw/project.json.memory.externalDocPaths`
- Task scope indexes:
  - active plan structured memory synthesized from the current `activePlan`
  - `.claw/tasks/<task>/memory.md`
- Task-scope reads should prefer active plan structured memory before compatibility `memory.md`.

## Completion hooks

- the first transition into `end.completed` emits abstract completion hooks
- completion hooks may include:
  - truth deposition candidates
  - ADR deposition candidates
  - subplan closure candidates
- `packages/core` only shapes these payloads; host runtimes decide how to dispatch them

## Codex adapter posture

- Codex is not attach-centric.
- Codex should resolve `.claw/` from `cwd`.
- Task scope should be established through `plan write`.
- Hooks are optional enhancements, not correctness dependencies.

## OpenClaw adapter posture

The OpenClaw adapter is expected to reconnect:

- `ActiveContext` / session persistence
- ownership and takeover policy
- plan guard decision and reminder delivery
- truth-generation runtime dispatch
- post-plan / post-truth side effects

These behaviors stay outside `packages/core`.
