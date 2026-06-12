# Codex Goal mode is a thread-level contract

## Context

`claw-kit` needed a way to align active plan execution with Codex Goal mode. The main risk was pretending the plugin could toggle Goal mode through a private host automation path when the documented host surfaces are `/goal` in the app, CLI, and IDE, plus thread goal tools when the environment exposes them.

## Decision

Treat Goal mode as a thread-level Codex feature. `claw-kit` supplies the plan-derived objective and the calling policy, but it does not claim ownership of host-level goal runtime behavior.

Default policy:

- only when a plan first enters `process.active`, expose a `goalMode` recommendation from canonical `plan.goal.text`
- only set a thread goal if the thread does not already have an active goal
- do not overwrite an unrelated active goal automatically
- use `setWhen = on_enter_process_active` so `plan write` / `prepare.requirements` guidance does not claim Goal mode ownership before execution actually starts
- when execution resumes from `process.wait` or `process.discussing` back into `process.active`, explicitly restore the active Goal mode state instead of treating the re-entry as a passive continuation
- if `plan.goal.text` is missing, block the lifecycle from entering `process.active` instead of emitting a premature Goal mode recommendation

## Consequences

- The integration is honest about the host boundary.
- Active execution can still align with Goal mode automatically in tool-capable environments.
- The same plan remains portable across hosts, because the canonical source stays in `.claw`, while Goal mode remains an optional Codex-host enhancement.
- Goal mode no longer competes with requirements collection; agents finish filling `goal.text`, `requirements`, `tasks`, and related fields before active execution begins.
- `goalMode` emission becomes a one-time activation boundary on first `process.active` entry, instead of a repeated `plan write` side effect.
- resumed active execution keeps the Goal mode contract visible, so a wait/discussion pause does not strand the thread in a half-restored state.
- The no-active-goal and no-overwrite semantics remain durable host-side safety rules instead of a best-effort prompt suggestion.

## Related Code

- `packages/core/src/workflow-guidance.ts`
- `packages/core/src/plan.ts`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/codex-adapter/references/workflow-guidance-consumption.md`
