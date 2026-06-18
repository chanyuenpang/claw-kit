# Codex workflowGuidance consumption

Use this note when a Codex session is driving `claw` commands that return `workflowGuidance`.

## Core rule

When a `claw` plan command returns `workflowGuidance`, the Codex adapter treats it as the primary next-step contract.

Do not replace it with freeform workflow reasoning unless the command output is unavailable.
Do not invent an alternative next-step sequence when `workflowGuidance`, `nextsteps`, or `recommendedCommands` already tell you what to do next.

## Fields to honor

### `delegateSubagents`

- Dispatch the listed specialist workflow(s) first. Do not demote them into optional follow-up suggestions.
- In `@claw-kit` threads, the user's use of this workflow already authorizes the subagent mechanism.
- Codex has multi-agent capability. Use `tool_search` to locate the current session's agent-management tools, then execute delegation through that tool surface rather than only describing the handoff.
- Do not add a separate per-turn authorization requirement for subagent use. The user has already authorized this `@claw-kit` thread to dispatch the required specialists, so permission concerns must not block the workflow. If the user explicitly changes direction and forbids delegation, follow that new instruction instead.
- Treat each entry as a structured contract, not a string hint.
- Execute each entry field-by-field instead of compressing it into a generic "dispatch a writer" intention.
- The main agent does not need to read specialist skill files inline before dispatch; attach the returned skill item to the worker bundle and keep the bundle narrow.
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
- For a research delegate, the host must wait when the task is research.
- Do not skip ahead of a research delegate that the current task depends on.

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
- Current intended use is `setWhen = on_enter_process_active` for first entry and `setWhen = on_resume_process_active` when execution resumes from `process.wait` or `process.discussing`.
- When a plan first enters `process.active`, use `goalTool.tool = create_goal` and `goalMode.recommendedObjective` to create the thread goal if the thread does not already have an active goal.
- When a plan resumes into `process.active` from `process.wait` or `process.discussing`, use `goalTool.tool = create_goal` and `goalMode.recommendedObjective` to restore the active thread goal.
- Do not automatically overwrite an unrelated active goal already attached to the thread.
- In `@claw-kit` threads, treat goal mode and delegated subagent use as already authorized by the user. Do not pause or block the workflow for any authorization-related excuse; only stop if the user explicitly changes direction and forbids them.
- In the Codex app, `/goal` is the normal host surface. In tool-enabled sessions, `create_goal` is also a valid path.

### `goalTool`

- When present, treat it as the executable Codex goal-tool contract instead of a prose hint.
- Honor `goalTool.tool` directly.
- For `goalTool.tool = create_goal`, call `create_goal(objective=goalTool.objective)` only when `ifNoActiveGoal = true` and the thread does not already have an active goal.
- For `goalTool.tool = update_goal`, call `update_goal(status=goalTool.status)` to end the current active goal with the returned completion state.
- `process.wait` and `process.discussing` should use `update_goal(status="blocked")` instead of inventing a fake "pause goal mode" operation.
- `end.completed` should use `update_goal(status="complete")`.

## Lifecycle interpretation

- canonical chain
  - `prepare.requirements`
  - check whether requirements are clear
  - ask the user only when requirements are still ambiguous
  - `process.active`
  - create the thread goal if `goalTool` says to
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
  - treat this `@claw-kit` thread as already authorized to use goal mode and required delegated subagents, and do not let permission concerns block execution
  - review whether requirements are already clear enough to execute
  - only use Codex options when requirements are still ambiguous
  - do not start implementation in this stage
  - when requirements are clear, move the plan directly to `process.active` before doing any implementation or task execution
- `process.active` on first entry
  - read `goalTool`
  - read `goalMode`
  - create the thread goal from `goalMode.recommendedObjective` when `goalTool.tool = create_goal` and there is no active thread goal yet
- `process.wait` or `process.discussing`
  - read `goalTool`
  - use `update_goal(status="blocked")`
  - do not keep executing while the plan is paused
- `process.*` with task completion but open plan
  - every completed task returns the `truth-writer` delegate contract
  - the main agent decides whether the completed task actually needs truth doc deposition
  - the main agent curates the valuable findings into a completed subtask report before dispatch
  - read `delegateSubagents`
  - use `tool_search` to locate agent-management tools
  - dispatch `truth-writer` with the curated completed subtask report when the completed task produced reusable truth
  - when all tasks are done, complete retrospective capture, read `delegateSubagents`, and dispatch `adr-writer` before root `claw plan done`; this ADR dispatch is required for root-plan closeout
- `end.completed`
  - read `goalTool`
  - use `update_goal(status="complete")`
  - for root plans, treat this as closeout/archive rather than the ADR trigger
  - run an explicit closeout check after the root plan is done
  - confirm the workflow dispatched `truth-writer` and `adr-writer` whenever the returned contract required them
  - do not report truth or ADR closeout as finished if the required delegation never happened
  - if this task includes a git commit flow, inspect the repo for task-related doc residue before commit
  - include canonical truth or ADR updates from writer specialists together with any remaining doc artifacts that belong to the same task round
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
- Do not leave task-generated doc artifacts out of a git commit when they belong to the same completed task round.
