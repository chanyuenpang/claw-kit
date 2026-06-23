---
name: using-claw-kit
description: Use first whenever claw-kit workflow is active in a .claw project; this is the main-agent workflow contract for plan, search, truth, ADR, and hook-aware startup.
---
# using-claw-kit

Claw-kit is designed to write and reuse truth-doc and ADR-doc in a plan framework.

This skill is the first skill whenever claw-kit workflow is active.

This is the main-agent entry skill. Keep it compact.
If the user explicitly asks to initialize a non-claw project, route to `../init/SKILL.md`.

## Core execution chain

1. If the current thread already has recovered `.claw` task state or returned `workflowGuidance`, continue from that contract first.
2. If no task scope exists, create one through `claw plan create`.
3. After every `claw plan create`, `claw plan edit`, or `claw plan done`, follow the returned `workflowGuidance`. This is mandatory.
4. If prior project context is relevant, run `claw search --query "<topic>"` after a new `claw plan create` and use the results to improve the bound task scope.
5. Use two-part plan status semantics:
   - `process.discussing`: the plan exists, but execution has not started; stay in discussion/planning work only
   - `process.active`: execution is live; process one task at a time and update progress with `claw plan edit`
   - `process.wait`: the round is blocked on user input or an external dependency
   - `end.completed`: all planned work is done and `retrospective.summary` is present
   - `end.closed` / `end.leave`: the round has been closed out; do not resume active execution unless the user explicitly changes direction
6. The planning skill is invoked by the seeded planning task, not before task scope exists.
7. Once requirements are clear and `goal.text` is set, move the plan to `process.active`.
8. After a meaningful completed task, dispatch `truth-writer` when there is reusable context to deposit.
9. When all tasks are done, update both `retrospective` and `keyDecisions`, and dispatch `adr-writer`.
10. Close the plan with `claw plan done` only after `retrospective.summary` exists and any durable round-level decisions have been written into `keyDecisions`.
11. During closeout, confirm whether the workflow actually dispatched the required writer specialists:
   - verify `truth-writer` and `adr-writer` were dispatched when the returned contract required them
   - do not claim truth or ADR closeout finished if those delegations never happened

## First action

If the current thread already has a recovered `.claw` task, active plan, or returned `workflowGuidance`, follow that contract before creating anything.
If no task scope exists, call `claw plan create "<goal/title>"`, then follow the returned `workflowGuidance`.

## Truth & ADR

Writer dispatch uses the `task` tool:
- `task(subagent_type="claw-truth-writer", prompt="<completed task report>")`
- `task(subagent_type="claw-adr-writer", prompt="<completed plan path>")`

Writer dispatch reuses an existing suitable same-type subagent before spawning a new one.
Truth-value judgment stays on the main agent side. If there is no reusable truth, no writer is dispatched.
`truth-writer` dispatch happens only when reusable truth exists.
`adr-writer` is a required closeout step for root-plan completion.

## Non-negotiable rules

- The most essential rule is to follow returned `workflowGuidance`.
- The second essential rule is to decide each turn whether to dispatch `truth-writer`.
- `claw search` runs after a new `claw plan create` when project recall is relevant. Search uses natural language and prefers the user's language.
- After every `claw plan create`, `claw plan edit`, or `claw plan done`, follow returned `workflowGuidance` instead of inventing a parallel process.
- Reuse the existing `truth-writer` when possible; otherwise dispatch a new one.
- Run ADR deposition before root `claw plan done`.
