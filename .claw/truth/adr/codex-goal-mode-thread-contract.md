# Codex Goal mode is a thread-level contract

## Context

`claw-kit` needed a way to align active plan execution with Codex Goal mode. The main risk was pretending the plugin could toggle Goal mode through a private host automation path when the documented host surfaces are `/goal` in the app, CLI, and IDE, plus thread goal tools when the environment exposes them.

## Decision

Treat Goal mode as a thread-level Codex feature. `claw-kit` supplies the plan-derived objective and the calling policy, but it does not claim ownership of host-level goal runtime behavior.

Default policy:

- when a plan first enters `process.active`, expose a `goalMode` recommendation from canonical `plan.goal.text`
- only set a thread goal if the thread does not already have an active goal
- do not overwrite an unrelated active goal automatically

## Consequences

- The integration is honest about the host boundary.
- Active execution can still align with Goal mode automatically in tool-capable environments.
- The same plan remains portable across hosts, because the canonical source stays in `.claw`, while Goal mode remains an optional Codex-host enhancement.
