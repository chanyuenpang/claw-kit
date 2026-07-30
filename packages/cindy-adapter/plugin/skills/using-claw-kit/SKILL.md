---
name: using-claw-kit
description: "Use claw-kit through Cindy Ghost tools: recover the injected workflow snapshot, advance one plan task at a time, and keep Cindy-specific execution details out of the Agent prompt."
---

# Using claw-kit in Cindy

Use this skill when the current workspace may contain a `.claw/` project or when
the user asks for a reusable multi-step change that should preserve project
knowledge.

## Canonical state

- The `.claw/` project, task, and plan files are the source of truth.
- Cindy Progress/Todo and Goal are Host-owned optional presentation surfaces;
  never treat them as a second plan database or attempt to operate them.
- The Ghost Node Worker owns `claw` discovery, `--host cindy`, session binding,
  command execution, and lifecycle projection. Do not run `claw` shell
  commands, supply host/session arguments, or request a plan sync.

## Session entry

1. Read the workflow snapshot injected by the Cindy Host at session start (or
   after Host-managed compact recovery).
2. If the Host reports that claw is unavailable, surface its actionable
   diagnosis and continue without pretending that recovery succeeded.
3. When an active session-bound plan is recovered, continue that plan before
   starting unrelated work.

Only the Host invokes `claw context`, and only for session start or compact
recovery. It is never a turn-end status probe.

## Planning and execution

- Use `list_tools` to discover the typed workflow operations and `call_tool`
  to invoke them. Use operation names and JSON arguments, not shell strings.
- Follow the returned Cindy `guidance` object. Its `commandHints` are
  equivalent `call_tool` instructions: invoke the given operation name and
  JSON arguments, and fill any listed `requiredArgs` before calling. They are
  the Cindy replacement for raw `claw ...` command hints.
- `process.discussing`: clarify requirements and do not implement prematurely.
- `process.active`: execute one plan task at a time and keep plan state current.
- `process.wait`: stop until the user or dependency resumes the workflow.
- `end.*`: perform the required closeout and do not auto-continue.
- Keep low-complexity work lightweight when claw guidance says a full plan is
  unnecessary.

Do not request or discuss host actions, plan synchronization, Goal Mode, or
Worker lifecycle details. If Cindy later exposes a stable Goal API, the Host
will apply it from the Worker projection without Agent involvement.

## Completion

When all plan tasks are complete:

1. Complete the canonical plan transition through `call_tool`.
2. Report the completed work to the user. The Host captures that final report
   and then queues any required knowledge closeout.
3. Do not manually trigger sync or Goal
   handling.

Knowledge closeout must remain bounded to the current project and plan. A
failure must be visible and recoverable; never silently mark a failed closeout
as complete.
