---
name: using-claw-kit
description: Use first whenever the @claw-kit plugin is invoked in a Codex thread; this is the main-agent workflow contract for plan, search, truth, ADR, and hook-aware startup.
---
# using-claw-kit

Claw-kit is designed to write and reuse truth-doc & ADR-doc in a plan framework.

Use this skill first whenever the `@claw-kit` plugin is invoked.

This is the main-agent entry skill. Keep it compact.
Use it to recover startup shape, route into the right `.claw` workflow, and follow CLI `workflowGuidance` as the contract.
If the user explicitly asks to initialize a non-claw project, route to `../init/SKILL.md`.

## Core execution chain

Keep the core chain minimal:

`user prompt` -> `claw plan write` -> `follow workflowGuidance` -> `claw search (when useful)` -> `plan status: process.active` -> `process task 1` -> `spawn or reuse truth-writer` -> `process task 2` -> `reuse truth-writer` -> `...` -> `all tasks done` -> `update retrospective + keyDecisions` -> `spawn adr-writer` -> `claw plan done` -> `closeout checks`

Detailed call flow:

1. Read `../planning/SKILL.md`.
2. Create or bind task scope through `claw plan write`.
3. Treat `claw plan write` as the only normal task-scope entrypoint.
4. After every `claw plan write`, `claw plan edit`, or `claw plan done`, follow returned `workflowGuidance`.
5. If prior project context is relevant, run `claw search --query "<topic>"` after `claw plan write` and use the results to improve the now-bound task scope.
6. If requirements are clear and `goal.text` is set, move the plan to `process.active`.
7. Do not start implementation while the plan is still in `prepare.requirements`.
8. During execution, process one task at a time and update progress with `claw plan edit`.
9. After a meaningful completed task, dispatch `truth-writer` when there is reusable context to deposit.
10. When all tasks are done, clear thread progress, update both `retrospective` and `keyDecisions`, and dispatch `adr-writer` from returned `workflowGuidance`.
11. Close the plan with `claw plan done` only after `retrospective.summary` exists and any durable round-level decisions have been written into `keyDecisions`.
12. During closeout, confirm whether the workflow actually dispatched the required writer specialists:
    - verify `truth-writer` and `adr-writer` were dispatched when the returned contract required them
    - do not claim truth or ADR closeout finished if those delegations never happened
13. During closeout, if this task included a git commit flow, inspect the repo for task-related doc artifacts that still belong to this round:
    - include canonical truth or ADR files updated by the writers
    - include any remaining task-produced docs that should ship with the same commit instead of leaving them behind

## First action

The first action is to read `../planning/SKILL.md`.

If the planning skill's complexity score is below 4, use the direct claw path instead of formal planning: if prior project context is likely relevant, run `claw search --query "<topic>"` before execution, then solve the task directly, then run `claw direct`; after that, dispatch `truth-writer` only when the completed work produced reusable truth.

Use `planning` as the visible plan-entry skill for the current task, then continue the rest of the claw-kit workflow from there.
For explicit non-claw project bootstrap requests, switch to `init` instead of inventing a broader startup sequence.

## Truth & ADR

When the user uses `@claw-kit`, that already authorizes the subagent mechanism for this workflow. If subagent tools are not already present in the current surface, use `tool_search` to find them. For writer dispatch, prefer reusing an existing suitable same-type subagent before spawning a new one; the main agent does not need to read other writer skills inline, should attach the returned skill when spawning the worker, should keep truth-value judgment on the main agent side, should dispatch `truth-writer` only when the completed work has reusable truth, and should treat `adr-writer` as a required closeout step for root-plan completion.

## Non-negotiable rules

- The most essential rule is to follow returned `workflowGuidance`.
- The second essential rule is to decide each turn whether to dispatch `truth-writer`.
- Treat this `@claw-kit` thread as already authorized by the user to use goal mode and required delegated subagents. Do not block the workflow for any permission-related excuse;
- Use `claw search` after `claw plan write` to recall relevant knowledges.
- After every `claw plan write`, `claw plan edit`, or `claw plan done`, follow returned `workflowGuidance` instead of inventing a parallel process.
- When `workflowGuidance.goalMode` is present, set the thread goal from `workflowGuidance.goalMode.recommendedObjective` if the thread does not already have an active goal.
- Reuse the existing `truth-writer` when possible; otherwise dispatch a new one.
- Run ADR deposition from the `all tasks done` guidance before root `claw plan done`.
- Treat closeout as a required workflow phase after root `claw plan done`, including verification that required writer delegation happened and that task-related doc residue is not left out of the commit.
