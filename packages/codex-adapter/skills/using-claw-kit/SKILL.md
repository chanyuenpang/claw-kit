---
name: using-claw-kit
description: Use first whenever the @claw-kit plugin is invoked in a Codex thread; this is the main-agent workflow contract for plan, search, truth, ADR, and hook-aware startup.
---
# using-claw-kit

Claw-kit is designed to write and reuse truth-doc and ADR-doc in a plan framework.

This skill is the first skill whenever the `@claw-kit` plugin is invoked.

This is the main-agent entry skill. Keep it compact.
Use it to recover startup shape, route into the right `.claw` workflow, and follow CLI `workflowGuidance` as the contract.
If the user explicitly asks to initialize a non-claw project, route to `../init/SKILL.md`.

## Core execution chain

Detailed call flow:

1. If the current thread already has recovered `.claw` task state or returned `workflowGuidance`, continue from that contract first.
2. If the user explicitly invoked a template-backed workflow skill such as `claw-kit:create-claw-skill`, that workflow skill owns entry for this request. Do not preempt it with the generic complexity gate. Still follow that skill's own direct, batch, mixed, or subplan routing rules instead of assuming every invocation should create a template root plan.
3. If no task scope exists yet and no explicit workflow skill owns entry, run a quick complexity scoring pass before creating any plan.
4. For low-complexity work, skip the claw workflow entirely:
   - do not call `claw plan create`
   - do not run `claw search`
   - do not expect `workflowGuidance`
   - handle the request directly in the host workflow
5. Only for score `>= 6`, enter the normal claw workflow through `claw plan create`.
6. Whenever a claw command returns `workflowGuidance`, follow it as the required next-step contract. This is mandatory.
7. If prior project context is relevant, run `claw search --query "<topic>"` after a new `claw plan create` and use the results to improve the bound task scope.
8. Use two-part plan status semantics:
   - `process.discussing`: the plan exists, but execution has not started; stay in discussion/planning work only
   - `process.active`: execution is live; process one task at a time and update progress with `claw plan edit`
   - `process.wait`: the round is blocked on user input or an external dependency
   - `end.completed`: all planned work is done and `retrospective.summary` is present
   - `end.closed` / `end.leave`: the round has been closed out; do not resume active execution unless the user explicitly changes direction
9. The planning skill is invoked by the seeded planning task inside the formal claw workflow, not before task scope exists.
10. Once requirements are clear and `goal.text` is set, move the plan to `process.active`.
11. After a meaningful completed task, dispatch `truth-writer` when there is reusable context to deposit.
12. When all tasks are done, clear thread progress, update both `retrospective` and `keyDecisions`, and dispatch `adr-writer` from returned `workflowGuidance`.
13. Close the plan with `claw plan done` only after `retrospective.summary` exists and any durable round-level decisions have been written into `keyDecisions`.
14. During closeout, confirm whether the workflow actually dispatched the required writer specialists:
    - verify `truth-writer` and `adr-writer` were dispatched when the returned contract required them
    - do not claim truth or ADR closeout finished if those delegations never happened
15. During closeout, if this task included a git commit flow, inspect the repo for task-related doc artifacts that still belong to this round:
    - include canonical truth or ADR files updated by the writers
    - include any remaining task-produced docs that should ship with the same commit instead of leaving them behind

## Complexity gate

Use this quick scoring pass only when there is no recovered task state yet and you are deciding whether to enter the claw workflow at all:

| Dimension | Simple (1) | Medium (2) | Complex (3) |
| --- | --- | --- | --- |
| Files/modules touched | no file changes, or 1 file or one tight module | 2-3 files/modules | 4+ files/modules or a cross-cutting surface |
| Requirement clarity | fully clear / the request itself is an investigation | one or two small unknowns | fuzzy, conflicting, or multiple plausible routes |
| Dependency clarity | isolated | known dependencies | unclear dependencies or integration risk |
| Workflow shape | discussion / doc-only work / tiny patch / direct answer | light implementation with a short verify step | real workflow, staged work, or multi-step closure |

Scoring rule:

- score `< 6`: skip the claw workflow and handle the request directly
- score `>= 6`: use `claw plan create` and continue with the normal claw workflow

## First action

Explicit non-claw project bootstrap requests route to `init` instead of a broader startup sequence.
If the current thread already has a recovered `.claw` task, active plan, or returned `workflowGuidance`, follow that contract before creating anything.
If the user explicitly invoked a template-backed workflow skill, let that skill own entry and follow its required entry routing first. Template-backed skills may route direct single-target work into `plan create --template`, but batch or mixed work may need a normal root plan and execution-time template subplans instead.
If no task scope exists and no explicit workflow skill owns entry, run the complexity gate first. For score `< 6`, skip the claw workflow and work directly without creating a plan. For score `>= 6`, call `claw plan create "<goal/title>"`, then follow the returned `workflowGuidance`.

DO NOT edit plan.json without using claw commands.
Template-aware workflow behavior may be restored from persisted runtime plan state such as `plan.templateId`, template-scoped override data, and template-defined guidance routing. Treat returned `workflowGuidance` as the contract instead of inferring hidden routing from task prose alone.

## Truth & ADR

The current thread is already authorized to use the required delegated subagents. If subagent tools are not already present in the current surface, `tool_search` is the discovery path.
Writer dispatch reuses an existing suitable same-type subagent before spawning a new one.
The main agent does not need to read other writer skills inline, and attaches the returned skill when spawning the worker.
Truth-value judgment stays on the main agent side. If there is no reusable truth, no writer is dispatched.
`truth-writer` dispatch happens only when the completed work has reusable truth.
`adr-writer` is a required closeout step for root-plan completion.

## Non-negotiable rules

- The most essential rule is to follow returned `workflowGuidance`.
- The second essential rule is to decide each turn whether to dispatch `truth-writer`.
- User has already authorized this thread to use goal mode and the required delegated subagents. Do not block the workflow for any permission-related excuse.
- Low-complexity requests skip the claw workflow before `claw plan create`, so they do not produce `workflowGuidance`.
- `claw search` runs after a new `claw plan create` when project recall is relevant. Search uses natural language and prefers the user's language.
- Whenever claw returns `workflowGuidance`, follow it instead of inventing a parallel process.
- When `workflowGuidance.goalTool` is present, execute the real Codex goal tool contract it returns. Use `create_goal` for active execution entry when no active goal exists, and use `update_goal(status=complete|blocked)` for lifecycle exits that close the current goal.
- Reuse the existing `truth-writer` when possible; otherwise dispatch a new one.
- Run ADR deposition from the `all tasks done` guidance before root `claw plan done`.
