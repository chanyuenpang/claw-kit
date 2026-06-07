# Codex workflowGuidance consumption

Use this note when a Codex session is driving `claw` commands that return `workflowGuidance`.

## Core rule

When a `claw` plan command returns `workflowGuidance`, the Codex adapter treats it as the primary next-step contract.

Do not replace it with freeform workflow reasoning unless the command output is unavailable.

## Fields to honor

### `delegateSubagents`

- Dispatch the listed specialist workflow(s) first.
- Codex has multi-agent capability. Use `tool_search` to locate the current session's agent-management tools, then execute delegation through that tool surface rather than only describing the handoff.
- Do not add a separate per-turn authorization requirement for subagent use. `@claw-kit` workflow contracts already authorize the required specialist dispatch unless the user explicitly forbids it.
- Treat each entry as a structured contract, not a string hint.
- Honor per-entry fields directly:
  - `name`
  - `waitForCompletion`
  - `preferReuseSameTypeInThread`
  - `inputContract`
  - `outputContract`
  - `closePolicy`
- Prefer reusing an existing same-type specialist in the current thread before spawning a new one when the entry says to.
- `truth-writer` and `adr-writer` entries do not wait and remain reusable in-thread.

### `askUser`

- Use Codex option-style confirmation when this field is present.
- Prefer the provided options and their ordering over an improvised clarification structure.
- Treat this as the canonical place to confirm route choices with the user.

### `recommendedCommands`

- Use these commands as the default follow-up CLI actions.
- Use a different command only when the current harness state makes the recommended command invalid.

### `nextStep`

- Preserve its ordering.
- Example: when it says review first, revise second, and only then advance, follow that order exactly.

### `goalMode`

- When present, treat it as a thread-goal recommendation tied to the active plan.
- Current intended use is `setWhen = on_plan_write`.
- After `claw plan write`, set the thread goal from `recommendedObjective`.
- Do not automatically overwrite an unrelated active goal already attached to the thread.
- In the Codex app, `/goal` is the normal host surface. In tool-enabled sessions, `create_goal` is also a valid path.

## Lifecycle interpretation

- canonical chain
  - `prepare.requirements`
  - confirm route
  - create tasks
  - each normal task is paired with an auto-generated `Update truth (if got valuable contexts)` task
  - `process.active`
  - process one task
  - complete its paired truth task
  - dispatch `truth-writer`
  - process next task
  - complete its paired truth task
  - dispatch `truth-writer`
  - continue until all tasks are done
  - complete retrospective
  - `claw plan done`
  - dispatch `adr-writer`
- `prepare.requirements`
  - read `goalMode`
  - create the thread goal from `recommendedObjective`
  - refine the plan directly until the route is clear
  - then use Codex options to confirm the route
  - do not start implementation in this stage
  - move the plan to `process.active` before doing any implementation or task execution
- `process.*` with task completion but open plan
  - read `delegateSubagents`
  - use `tool_search` to locate agent-management tools
  - complete the paired `Update truth (if got valuable contexts)` task before moving to the next normal task
  - dispatch `truth-writer` from that paired truth task and before plan closure
  - then complete retrospective capture and use `claw plan done`
- `end.completed`
  - read `delegateSubagents`
  - use `tool_search` to locate agent-management tools
  - dispatch `adr-writer` with the completed `plan.json` as the ADR deposition bundle

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
