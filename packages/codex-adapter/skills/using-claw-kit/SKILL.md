---
name: using-claw-kit
description: Use first whenever the @claw-kit plugin is invoked in a Codex thread; this is the main-agent workflow contract for plan, search, truth, ADR, and hook-aware startup.
---
# using-claw-kit

Claw-kit is designed to write and reuse truth-doc & ADR-doc in a plan framework.

Use this skill first whenever the `@claw-kit` plugin is invoked.

This is the main-agent entry skill. Keep it compact.
Use it to recover startup shape, route into the right `.claw` workflow, and follow CLI `workflowGuidance` as the contract.

## Core execution chain

Keep the core chain minimal:

`user prompt` -> `claw search` -> `claw plan write` -> `plan status: process.active` -> `process task 1` -> `spawn or reuse truth-writer` -> `process task 2` -> `reuse truth-writer` -> `...` -> `all tasks done` -> `complete retrospective` -> `spawn adr-writer` -> `claw plan done`

Detailed call flow:

1. Read `../planning/SKILL.md`.
2. If prior project context is relevant, run `claw search --query "<topic>"` first.
3. Treat `claw search` as project-doc recall for truth, ADR, and markdown docs; do not use it as a code-search substitute.
4. Create or bind task scope through `claw plan write`.
5. Treat `claw plan write` as the only normal task-scope entrypoint.
6. After every `claw plan write`, `claw plan edit`, or `claw plan done`, follow returned `workflowGuidance`.
7. If `workflowGuidance.askUser` is present, resolve the route first.
8. If requirements are clear and `goal.text` is set, move the plan to `process.active`.
9. Do not start implementation while the plan is still in `prepare.requirements`.
10. During execution, process one task at a time and update progress with `claw plan edit`.
11. After a meaningful completed task, dispatch `truth-writer` when there is reusable context to deposit.
12. When all tasks are done, clear thread progress, complete the retrospective, and dispatch `adr-writer` from returned `workflowGuidance`.
13. Close the plan with `claw plan done` only after `retrospective.summary` exists.
14. Treat root `claw plan done` as closeout and archival, not as the ADR dispatch trigger.

## First action

The first action is to read `../planning/SKILL.md`.

Use `planning` as the visible plan-entry skill for the current task, then continue the rest of the claw-kit workflow from there.

## Non-negotiable rules

- The most essential rule is to follow returned `workflowGuidance`.
- The second essential rule is to decide each turn whether to dispatch `truth-writer`.
- Run `claw search` before research work.
- After every `claw plan write`, `claw plan edit`, or `claw plan done`, follow returned `workflowGuidance` instead of inventing a parallel process.
- When `workflowGuidance.goalMode` is present, set the thread goal from `workflowGuidance.goalMode.recommendedObjective` if the thread does not already have an active goal.
- If `goal.text` is missing, fill it before trying to enter `process.active`.
- Reuse the existing `truth-writer` when possible; otherwise dispatch a new one.
- Keep truth deposition between task execution and retrospective closure.
- Run ADR deposition from the `all tasks done` guidance before root `claw plan done`.
