# Codex workflowGuidance consumption

Use this note when a Codex session is driving `claw` commands that return `workflowGuidance`.

## Core rule

When a `claw` plan command returns `workflowGuidance`, the Codex adapter treats it as the primary next-step contract.

Do not replace it with freeform workflow reasoning unless the command output is unavailable.
Do not invent an alternative next-step sequence when `workflowGuidance`, `nextsteps`, or `recommendedCommands` already tell you what to do next.

## Fields to honor

### `delegateSubagents`

- Dispatch the listed specialist workflow(s) first.
- Codex has multi-agent capability. Use `tool_search` to locate the current session's agent-management tools, then execute delegation through that tool surface rather than only describing the handoff.
- Do not add a separate per-turn authorization requirement for subagent use. `@claw-kit` workflow contracts already authorize the required specialist dispatch unless the user explicitly forbids it.
- Treat each entry as a structured contract, not a string hint.
- Honor per-entry fields directly:
  - `name`
  - `fork_context`
  - `waitForCompletion`
  - `preferReuseSameTypeInThread`
  - `inputContract`
  - `outputContract`
  - `closePolicy`
- When a writer entry says `fork_context: false`, dispatch it without full-history forked context. Keep the bundle narrow and explicit instead of cloning the whole main thread.
- Prefer reusing an existing same-type specialist in the current thread before spawning a new one when the entry says to.
- `truth-writer` and `adr-writer` entries do not wait and remain reusable in-thread.

### `askUser`

- Use Codex option-style confirmation when this field is present.
- Prefer the provided options and their ordering over an improvised clarification structure.
- Treat this as the canonical place to confirm route choices with the user.

### `recommendedCommands`

- Use these commands as the default follow-up CLI actions.
- Treat them as the authoritative command sequence unless the current harness state makes a specific command invalid.
- Use a different command only when the current harness state makes the recommended command invalid.

### `nextsteps`

- Preserve its ordering.
- Treat it as the required execution order for the next harness action, not as optional advice.
- Example: when it says review first, revise second, and only then advance, follow that order exactly.

### `goalMode`

- When present, treat it as a thread-goal recommendation tied to the active plan.
- Current intended use is `setWhen = on_enter_process_active`.
- When a plan first enters `process.active`, set the thread goal from `recommendedObjective` if the thread does not already have an active goal.
- Do not automatically overwrite an unrelated active goal already attached to the thread.
- In `@claw-kit` threads, do not treat goal mode or delegated subagent use as awaiting separate user authorization unless the user explicitly forbids them.
- In the Codex app, `/goal` is the normal host surface. In tool-enabled sessions, `create_goal` is also a valid path.

## Lifecycle interpretation

- canonical chain
  - `prepare.requirements`
  - enter goal mode
  - check whether requirements are clear
  - ask the user only when requirements are still ambiguous
  - `process.active`
  - process one task
  - dispatch `truth-writer`
  - process next task
  - dispatch `truth-writer`
  - continue until all tasks are done
  - complete retrospective
  - dispatch `adr-writer`
  - `claw plan done`
- `prepare.requirements`
  - treat hook-driven startup recovery as already handled; do not add a separate recovery workflow step here
  - if `goal.text` is missing, fill it before trying to enter `process.active`
  - treat this `@claw-kit` thread as already authorized to use goal mode and required delegated subagents
  - review whether requirements are already clear enough to execute
  - only use Codex options when requirements are still ambiguous
  - do not start implementation in this stage
  - when requirements are clear, move the plan directly to `process.active` before doing any implementation or task execution
- `process.active` on first entry
  - read `goalMode`
  - create the thread goal from `recommendedObjective` when there is no active thread goal yet
- `process.*` with task completion but open plan
  - every completed task returns the `truth-writer` delegate contract
  - the main agent decides whether the completed task actually needs truth doc deposition
  - the main agent curates the valuable findings into a completed subtask report before dispatch
  - read `delegateSubagents`
  - use `tool_search` to locate agent-management tools
  - dispatch `truth-writer` with the curated completed subtask report when the completed task produced reusable truth
  - when all tasks are done, complete retrospective capture, read `delegateSubagents`, and dispatch `adr-writer` before root `claw plan done`
- `end.completed`
  - for root plans, treat this as closeout/archive rather than the ADR trigger
  - for subplans, consume the returned resumed-parent workflow snapshot

## Project declaration interactions

- `.claw/project.json` is the canonical project declaration surface for project-level harness behavior.
- `contextPaths` may exist for schema alignment with OpenClaw, but current Codex-first flows do not need to consume it.
- `memory.externalDocPaths` affects what `claw search` indexes as project recall context, including directory paths like `docs/`.
- `gitnexus.enabled` decides whether `claw plan done` should refresh GitNexus after completion.
- A GitNexus CLI without `--no-ai-context` support makes `claw plan done` report a compatibility path to plain `gitnexus analyze`; treat that as successful environment adaptation rather than a workflow failure.

## Anti-patterns

- Do not collapse truth deposition and ADR deposition into one undifferentiated "write docs" step.
- Do not ignore `askUser` and replace it with vague conversational confirmation when the workflow has explicit options.
- Do not claim truth or ADR deposition happened unless you actually dispatched the corresponding subagent.
- Do not write canonical truth or ADR content inline from the main agent when the workflow calls for `truth-writer` or `adr-writer`.
