# Codex Goal mode is a thread-level contract

## Context

`claw-kit` needed a way to align active plan execution with Codex Goal mode. The main risk was pretending the plugin could toggle Goal mode through a private host automation path when the documented host surfaces are `/goal` in the app, CLI, and IDE, plus thread goal tools when the environment exposes them.

As the workflow guidance matured, a second risk appeared: adapter instructions were still treating Goal mode as if it were a prose-only recommendation. That created two durable contract problems:

- `prepare.requirements` could imply that the agent should "set Goal Mode" before execution had actually entered `process.active`
- paused or completed lifecycle states could imply fake operations such as "pause Goal Mode" instead of using the real Codex goal tool contract

## Decision

Treat Goal mode as a thread-level Codex feature. `claw-kit` supplies the plan-derived objective and the calling policy, but it does not claim ownership of host-level goal runtime behavior.

Default policy:

- `prepare.requirements` does not emit an active-goal recommendation
- only when a plan first enters `process.active`, expose a `goalMode` recommendation from canonical `plan.goal.text`
- only entering or resuming `process.active` returns the executable `goalTool.tool = create_goal` contract
- only set a thread goal if the thread does not already have an active goal
- do not overwrite an unrelated active goal automatically
- use `setWhen = on_enter_process_active` so `plan write` / `prepare.requirements` guidance does not claim Goal mode ownership before execution actually starts
- when execution resumes from `process.wait` or `process.discussing` back into `process.active`, explicitly restore the active Goal mode state instead of treating the re-entry as a passive continuation
- when a plan moves into `process.wait` or `process.discussing`, return `goalTool.tool = update_goal` with `status = "blocked"` instead of inventing a pause-only Goal mode action
- when a plan reaches `end.completed`, return `goalTool.tool = update_goal` with `status = "complete"` instead of leaving completion to an implied host-side Goal mode gesture
- if `plan.goal.text` is missing, block the lifecycle from entering `process.active` instead of emitting a premature Goal mode recommendation

## Consequences

- The integration is honest about the host boundary.
- Active execution can still align with Goal mode automatically in tool-capable environments.
- Goal lifecycle changes are expressed through real Codex contracts, not adapter-invented pseudo-operations.
- The same plan remains portable across hosts, because the canonical source stays in `.claw`, while Goal mode remains an optional Codex-host enhancement.
- Goal mode no longer competes with requirements collection; agents finish filling `goal.text`, `requirements`, `tasks`, and related fields before active execution begins.
- `goalMode` emission becomes a one-time activation boundary on first `process.active` entry, instead of a repeated `plan write` side effect.
- resumed active execution keeps the Goal mode contract visible, so a wait/discussion pause does not strand the thread in a half-restored state.
- paused execution now has a durable, testable closeout rule: use `update_goal(status="blocked")` and stop pretending the thread stays in a special paused-goal runtime mode.
- completed execution now has a durable, testable closeout rule: use `update_goal(status="complete")` when the root plan reaches `end.completed`.
- The no-active-goal and no-overwrite semantics remain durable host-side safety rules instead of a best-effort prompt suggestion.

## Related Code

- `packages/core/src/workflow-guidance.ts`
- `packages/core/src/workflow-guidance.config.json`
- `packages/core/src/plan.ts`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/codex-adapter/references/workflow-guidance-consumption.md`
