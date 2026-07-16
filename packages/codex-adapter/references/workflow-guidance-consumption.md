# Codex workflowGuidance consumption

Use this note when a Codex session is driving `claw` commands that return `workflowGuidance`.

## Core rule

When a `claw` plan command returns `workflowGuidance`, the Codex adapter treats it as the primary next-step contract.

Do not replace it with freeform workflow reasoning unless the command output is unavailable.
Do not invent an alternative next-step sequence when `workflowGuidance`, `nextsteps`, or `recommendedCommands` already tell you what to do next.

## Fields to honor

### `delegateSubagents`

- Read `dispatch` before acting on an entry.
- Dispatch entries with `dispatch: required` as required workflow steps.
- `dispatch: when_reusable_truth_confirmed` means the main agent must evaluate reusable truth and dispatch only after confirmation.
- In `@claw-kit` threads, the hook-provided workflow context has already authorized the required subagent mechanism for the current thread.
- Codex has multi-agent capability. Use `tool_search` to locate the current session's agent-management tools, then execute delegation through that tool surface rather than only describing the handoff.
- Do not add a separate per-turn authorization requirement for subagent use. The current `@claw-kit` thread is already authorized by hook context to dispatch the required specialists, so permission concerns must not block the workflow. If the user explicitly changes direction and forbids delegation, follow that new instruction instead.
- Treat each entry as a structured contract, not a string hint.
- Execute each entry field-by-field instead of compressing it into a generic "dispatch a writer" intention.
- The main agent does not need to read specialist skill files inline before dispatch; attach the returned skill item to the worker bundle and keep the bundle narrow.
- Honor per-entry fields directly:
  - `name`
  - `dispatch`
  - `fork_context`
  - `waitForCompletion`
  - `preferReuseSameTypeInThread`
  - `inputContract`
  - `outputContract`
  - `closePolicy`
- When a writer entry says `fork_context: false`, dispatch it without full-history forked context. Keep the bundle narrow and explicit instead of cloning the whole main thread.
- Prefer reusing an existing same-type specialist in the current thread before spawning a new one when the entry says to.
- `truth-writer` and root-plan `adr-writer` remain non-blocking and reusable in-thread. `claw plan done` keeps the completed active plan path readable for at least one hour so ADR deposition can finish asynchronously.
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
- Keep this field command-only. Code-mode consumption is the adapter execution method for a recommended command, not a replacement command string.

### `events` and `hostActions`

- Treat `events` as an ordered, versioned record of canonical CLI mutations.
- Codex must run every plan mutation through the fixed `runClawPlanMutation` driver embedded in `skills/using-claw-kit/SKILL.md`; the agent provides the claw command and working directory, not an action-dispatch implementation. `../scripts/code-mode-host-action-consumer.mjs` is the testable source contract because the code-mode isolate does not import local plugin modules.
- The program consumes `hostActions` in order and executes each action at most once by its `id` in the same code-mode call as the CLI mutation.
- The program treats `schemaVersion` as the action contract version and passes only `input` to the matching real host tool; `meta` is never forwarded.
- `update_plan` actions contain the concrete host progress payload derived from the committed plan.
- `create_goal.input` contains only `objective`; `create_goal.meta` carries `allowOverwrite` and `reason`.
- `update_goal.input` contains only `status`; `update_goal.meta` carries `reason`.
- The program is the tool whitelist and schema validator. Unknown schema versions, tools, leaked policy fields, or incompatible inputs fail closed instead of being left for agent judgment.
- Codex has no separate host-call fallback. If code mode or a required host tool is unavailable, surface the program error and stop.
- Host action failure does not roll back CLI state. The program records an id only after successful execution, so the same action remains retryable without rerunning the canonical CLI mutation.

### `nextsteps`

- Preserve its ordering.
- Treat it as the required execution order for the next harness action, not as optional advice.
- Example: when it says review first, revise second, and only then advance, follow that order exactly.

### `goalMode`

- When present, treat it as compatibility and display metadata tied to the active plan.
- Codex does not execute `goalMode` directly. The CLI projects the required goal mutation into `hostActions`, and the code-mode consumer executes that action.
- In `@claw-kit` threads, goal mode and delegated subagent use are already authorized by hook context for the current thread. Do not pause or block the workflow for any authorization-related excuse; only stop if the user explicitly changes direction and forbids them.

### `goalTool`

- Core may still return `goalTool` for compatibility with other hosts and existing consumers.
- Codex must not execute or interpret `goalTool`. An equivalent schema-compatible goal action is already present in `hostActions` and is executed once by the program.
- Never use `goalTool` to reconstruct a missing action, retry a failed action, or issue a second goal call.

## Lifecycle interpretation

- canonical chain
  - `process.discussing` when planning is enabled
  - run one `claw search --query "<topic>"` recall query
  - use `claw plan start --task <name> --patch <plan-patch.json> --append-tasks <tasks.json>` to refine, append, complete the lifecycle bridge, and enter `process.active` atomically
  - let the code-mode consumer execute every returned host action, including goal actions
  - process one task
  - evaluate whether the completed task contains reusable truth and dispatch `truth-writer` only when it does
  - process next task
  - repeat the truth-value evaluation without treating dispatch as mandatory
  - continue until all tasks are done
  - complete retrospective
  - dispatch `adr-writer`
  - `claw plan done`
- `process.discussing`
  - treat hook-driven startup recovery as already handled; do not add a separate recovery workflow step here
  - planning-enabled projects use this stage to refine the request and append executable tasks
  - do not start implementation in this stage
  - move into `process.active` only when the plan is ready for execution
- `process.active` on first entry
  - do not interpret goal metadata; the code-mode consumer executes `hostActions.create_goal`
- `process.wait` or `process.discussing`
  - the code-mode consumer executes `hostActions.update_goal(status="blocked")`
  - do not keep executing while the plan is paused
- `process.*` with task completion but open plan
  - every completed task returns the `truth-writer` delegate contract
  - read `dispatch: when_reusable_truth_confirmed`
  - the main agent decides whether the completed task actually needs truth doc deposition; when it does not, do not dispatch the truth writer
  - the main agent curates the valuable findings into a completed subtask report before dispatch
  - read `delegateSubagents`
  - use `tool_search` to locate agent-management tools
  - dispatch `truth-writer` with the curated completed subtask report when the completed task produced reusable truth
- when all tasks are done, first write retrospective capture and any durable `keyDecisions` back into the active root plan, then read `delegateSubagents`, dispatch `adr-writer` asynchronously with that updated active plan path, and continue to root `claw plan done` without waiting; delayed archive keeps the path readable for at least one hour
- `end.completed`
  - the code-mode consumer executes `hostActions.update_goal(status="complete")`
  - for root plans, treat this as closeout/archive rather than the ADR trigger
  - run an explicit closeout check after the root plan is done
  - confirm the workflow dispatched `truth-writer` only after reusable truth was confirmed, and always dispatched `adr-writer` with `dispatch: required` without waiting
  - distinguish asynchronous writer dispatch from confirmed deposition completion in closeout reporting
  - if this task includes a git commit flow, inspect the repo for task-related doc residue before commit
  - include canonical truth or ADR updates from writer specialists together with any remaining doc artifacts that belong to the same task round
  - for subplans, consume the returned resumed-parent workflow snapshot

## Project declaration interactions

- `.claw/project.json` is the canonical project declaration surface for project-level harness behavior.
- `contextPaths` may exist for schema alignment with OpenClaw, but current Codex-first flows do not need to consume it.
- `memory.externalDocPaths` affects what `claw search` indexes as project recall context, including directory paths like `docs/`.
- `gitnexus` decides whether `claw plan done` should refresh GitNexus after completion.
- A GitNexus CLI without `--no-ai-context` support makes `claw plan done` report a compatibility path to plain `gitnexus analyze`; treat that as successful environment adaptation rather than a workflow failure.

## Anti-patterns

- Do not collapse truth deposition and ADR deposition into one undifferentiated "write docs" step.
- Do not ignore `askUser` and replace it with vague conversational confirmation when the workflow has explicit options.
- Do not claim truth or ADR deposition happened unless you actually dispatched the corresponding subagent.
- Do not write canonical truth or ADR content inline from the main agent when the workflow calls for `truth-writer` or `adr-writer`.
- Do not leave task-generated doc artifacts out of a git commit when they belong to the same completed task round.
