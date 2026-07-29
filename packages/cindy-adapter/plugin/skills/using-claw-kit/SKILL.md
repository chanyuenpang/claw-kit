---
name: using-claw-kit
description: "Use claw-kit as the canonical project workflow in Cindy: recover context, follow workflowGuidance, advance one plan task at a time, and complete knowledge closeout."
---

# Using claw-kit in Cindy

Use this skill when the current workspace may contain a `.claw/` project or when
the user asks for a reusable multi-step change that should preserve project
knowledge.

## Canonical state

- The `.claw/` project, task, and plan files are the source of truth.
- Cindy's native Progress/Todo and Goal surfaces are optional presentation or
  continuation aids. Do not treat them as a second plan database.
- The Cindy plugin does not install the `claw` CLI. If the CLI is missing,
  explain how the user can install it and continue ordinary conversation.

## Session entry

1. Resolve the current local workspace from the session working directory.
2. If `claw` is available, run `claw context` and consume its returned startup
   recovery and `workflowGuidance` fields.
3. If the CLI is unavailable or `claw context` fails, surface an actionable
   diagnosis and continue without pretending that recovery succeeded.
4. When an active session-bound plan is recovered, continue that plan before
   starting unrelated work.

The Cindy Host may inject this startup context into the first user message.
That injection is an ergonomic enhancement; the CLI and `.claw/` files remain
authoritative.

## Planning and execution

- Use the returned `workflowGuidance` as the next-step contract.
- `process.discussing`: clarify requirements and do not implement prematurely.
- `process.active`: execute one plan task at a time and keep plan state current.
- `process.wait`: stop until the user or dependency resumes the workflow.
- `end.*`: perform the required closeout and do not auto-continue.
- Keep low-complexity work lightweight when claw guidance says a full plan is
  unnecessary.

If Cindy Host supports automatic continuation, it may dispatch a follow-up only
for a session-bound plan in `process.active`. It must not auto-continue
`process.discussing`, `process.wait`, or terminal `end.*` states.

## Completion

When all plan tasks are complete:

1. Follow the returned closeout guidance.
2. Successfully dispatch and complete the knowledge-writer closeout.
3. Finish the canonical claw plan transition.

Knowledge closeout must remain bounded to the current project and plan. A
failure must be visible and recoverable; never silently mark a failed closeout
as complete.
