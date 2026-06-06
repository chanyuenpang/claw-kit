# Codex workflowGuidance consumption

Use this note when a Codex session is driving `claw` commands that return `workflowGuidance`.

## Core rule

When a `claw` plan command returns `workflowGuidance`, the Codex adapter should treat it as the primary next-step contract.

Do not replace it with freeform workflow reasoning unless the command output is unavailable.

## Fields to honor

### `delegateSubagents`

- Dispatch the listed specialist workflow(s) first.
- In normal Codex sessions, assume multi-agent support exists. If the tools are not already visible, do a discovery pass first, then execute delegation with `spawn_agent`, `wait_agent`, and `close_agent` rather than only describing the handoff.
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
- `truth-writer` and `adr-writer` entries should not wait and should remain reusable in-thread.

### `askUser`

- Use Codex option-style confirmation when this field is present.
- Prefer the provided options and their ordering over an improvised clarification structure.
- Treat this as the canonical place to confirm route choices with the user.

### `recommendedCommands`

- Use these commands as the default follow-up CLI actions.
- If you choose a different command, there should be a concrete reason grounded in the current harness state.

### `nextStep`

- Preserve its ordering.
- Example: if it says review first, revise second, and only then advance, follow that order exactly.

### `goalMode`

- When present, treat it as a thread-goal recommendation tied to the active plan.
- Current intended use is `setWhen = on_enter_process_active`.
- If the thread has no active goal, set one from `recommendedObjective`.
- Do not automatically overwrite an unrelated active goal already attached to the thread.
- In the Codex app, `/goal` is the normal host surface. In tool-enabled sessions, `create_goal` is also a valid path.

## Lifecycle interpretation

- `prepare.requirements`
  - refine the plan directly if needed
  - then use Codex options to confirm the route
- `process.*` with task completion but open plan
  - if guidance points to `truth-writer`, do truth deposition before plan closure
  - then complete retrospective capture and use `claw plan done`
- `process.active` entry
  - if guidance includes `goalMode`, map `plan.goal.text` into a thread goal when no conflicting goal already exists
- `end.completed`
  - if guidance points to `adr-writer`, use the completed `plan.json` as the ADR deposition bundle

## Project declaration interactions

- `.claw/project.json` is the canonical project declaration surface for project-level harness behavior.
- `contextPaths` may exist for schema alignment with OpenClaw, but current Codex-first flows do not need to consume it.
- `memory.externalDocPaths` affects what `claw search` indexes as project recall context, including directory paths like `docs/`.
- `gitnexus.enabled` decides whether `claw plan done` should refresh GitNexus after completion.
- If the installed GitNexus CLI does not support `--no-ai-context`, `claw plan done` may report a compatibility fallback to plain `gitnexus analyze`; treat that as successful environment adaptation rather than a workflow failure.

## Anti-patterns

- Do not collapse truth deposition and ADR deposition into one undifferentiated "write docs" step.
- Do not ignore `askUser` and replace it with vague conversational confirmation when the workflow has explicit options.
- Do not claim truth or ADR deposition happened unless you actually dispatched the corresponding subagent.
