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
2. If the user explicitly invoked a template-backed workflow skill such as `claw-kit:create-claw-skill`, let that workflow skill own entry and follow its direct, batch, mixed, or subplan routing rules.
3. If no task scope exists yet and no explicit workflow skill owns entry, run a quick complexity scoring pass before creating any plan.
4. For low-complexity work, handle the request directly in the host workflow; claw planning, search, and `workflowGuidance` remain inactive.
5. Only for score `>= 6`, enter the normal claw workflow through `claw plan create`.
6. Whenever a claw command returns `workflowGuidance`, follow it as the required next-step contract. This is mandatory.
7. On Codex code-mode surfaces, execute a claw plan command and consume its returned schema-compatible `hostActions` in the same code-mode call. Preserve action order and `id`, pass only `input` fields accepted by the real host tool, and use a separate host call only when same-call consumption is unavailable.
8. If prior project context is relevant, run `claw search --query "<topic>"` after a new `claw plan create` and use the results to improve the bound task scope.
9. Use two-part plan status semantics:
   - `process.discussing`: the plan exists, but execution has not started; stay in discussion/planning work only
   - `process.active`: execution is live; process one task at a time and update progress with `claw plan edit`
   - `process.wait`: the round is blocked on user input or an external dependency
   - `end.completed`: all planned work is done and `retrospective.summary` is present
   - `end.closed` / `end.leave`: the round has been closed out; resume active execution when the user explicitly changes direction
10. The planning skill is invoked by the seeded planning task inside the formal claw workflow, not before task scope exists.
11. Once requirements are clear and `goal.text` is set, prefer the returned atomic `claw plan start --task <name> --patch <plan-patch.json> --append-tasks <tasks.json>` command to complete the planning bridge and enter `process.active` in one mutation.
12. After a meaningful completed task, dispatch `truth-writer` when there is reusable context to deposit.
13. When all tasks are done, clear thread progress, update both `retrospective` and `keyDecisions`, and dispatch `adr-writer` asynchronously from returned `workflowGuidance`.
14. Close the plan with `claw plan done` after the ADR writer has been dispatched; do not wait for it. Delayed archive keeps the completed plan path readable for at least one hour.
15. During closeout, confirm whether the workflow actually dispatched the required writer specialists:
    - verify `truth-writer` and `adr-writer` were dispatched when the returned contract required them
    - report truth or ADR closeout as dispatched after each required delegation has occurred; do not imply asynchronous writer completion without evidence
16. During closeout, if this task included a git commit flow, inspect the repo for task-related doc artifacts that still belong to this round:
    - include canonical truth or ADR files updated by the writers
    - include any remaining task-produced docs that should ship with the same commit instead of leaving them behind

## Complexity gate

Use this quick scoring pass only when there is no recovered task state yet and you are deciding whether to enter the claw workflow at all:

| Dimension | Simple (1) | Medium (2) | Complex (3) |
| --- | --- | --- | --- |
| Files/modules touched | no file changes, or 1 file or one tight module | 2-3 files/modules | 4+ files/modules or a cross-cutting surface |
| Requirement clarity | fully clear / the request itself is an investigation | one or two small unknowns | fuzzy, conflicting, or multiple plausible routes |
| Distinct dependency risk | none, isolated, or already counted by file/workflow shape (0) | one known integration boundary (1) | unclear external dependency or independent integration risk (2) |
| Workflow shape | discussion / doc-only work / tiny patch / direct answer | light implementation with a short verify step | real workflow, staged work, or multi-step closure |

Scoring rule:

- score `< 6`: skip the claw workflow and handle the request directly
- score `>= 6`: use `claw plan create` and continue with the normal claw workflow
- Count dependency risk only when it is distinct from file count and workflow shape; known dependencies alone add `0`, preventing the same complexity from being counted twice.

## First action

Explicit non-claw project bootstrap requests route to `init` instead of a broader startup sequence.
If the current thread already has a recovered `.claw` task, active plan, or returned `workflowGuidance`, follow that contract before creating anything.
If the user explicitly invoked a template-backed workflow skill, let that skill own entry and follow its required entry routing first. Template-backed skills may route direct single-target work into `plan create --template`, but batch or mixed work may need a normal root plan and execution-time template subplans instead.
If no task scope exists and no explicit workflow skill owns entry, run the complexity gate first. For score `< 6`, skip the claw workflow and work directly without creating a plan. For score `>= 6`, call `claw plan create "<goal/title>"`, then follow the returned `workflowGuidance`.

Edit `plan.json` through claw commands.
Template-aware workflow behavior may be restored from persisted runtime plan state such as `plan.templateId`, template-scoped override data, and template-defined guidance routing. Treat returned `workflowGuidance` as the contract instead of inferring hidden routing from task prose alone.

## Truth & ADR

The current thread is already authorized to use the required delegated subagents. If subagent tools are not already present in the current surface, `tool_search` is the discovery path.
Writer dispatch reuses an existing suitable same-type subagent before spawning a new one.
Attach the returned writer skill when spawning the worker; the writer skill remains inside the delegated subagent context.
Truth-value judgment stays on the main agent side. If there is no reusable truth, no writer is dispatched.
`truth-writer` dispatch happens only when the completed work has reusable truth.
`adr-writer` is a required, asynchronous closeout step for root-plan completion.

## Non-negotiable rules

- The most essential rule is to follow returned `workflowGuidance`.
- The second essential rule is to decide each turn whether to dispatch `truth-writer`.
- User authorization already covers goal mode and the required delegated subagents for this thread.
- Low-complexity requests skip the claw workflow before `claw plan create`, so they do not produce `workflowGuidance`.
- `claw search` runs after a new `claw plan create` when project recall is relevant. Search uses natural language and prefers the user's language.
- Whenever claw returns `workflowGuidance`, use it as the single next-step process.
- On Codex code-mode surfaces, keep each claw plan mutation and its schema-compatible `hostActions` consumption in one code-mode call; do not manually carry `update_plan` payloads into a second call when same-call consumption is available.
- When `workflowGuidance.goalTool` is present, execute the real Codex goal tool contract it returns. Use `create_goal` for active execution entry and allow returned goal guidance to overwrite the current thread goal; use `update_goal(status=complete|blocked)` for lifecycle exits that close the current goal.
- Reuse the existing `truth-writer` when possible; otherwise dispatch a new one.
- Dispatch ADR deposition from the `all tasks done` guidance before root `claw plan done`, but do not wait for completion.
