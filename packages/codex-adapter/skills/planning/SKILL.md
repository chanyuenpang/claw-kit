---
name: planning
description: Use when new work needs a .claw task scope and initial plan.
---

# claw-kit planning

This skill ports the intent of OpenClaw planning into Codex.

## Commands

- Create or bind a task plan:
  - `claw plan write "<title>" [--goal "<goal>"]`
  - `claw plan write --title "<title>" [--goal "<goal>"]`
- Close out a low-complexity no-plan round:
  - `claw direct`
- Create a subplan under an existing task:
  - `claw subplan write --parent <task-name> --task-id <id> --title "<title>"`
- Edit a plan with a structured patch:
  - `claw plan edit --task <task> --patch <json-file>`
- Update a task's execution state:
  - `claw plan edit --task <task> --task-id <id> --task-status in_progress`
- Change lifecycle status:
  - `claw plan edit --task <task> --plan-status process.active`

## When to use

Use this when the request is more than a tiny one-file change, or when task shape, dependencies, or completion criteria are unclear.
Use it both for writing the initial task-bound plan and for advancing that plan through the active workflow lifecycle.

## Planning principles

- Treat the plan as a decision memo, not a todo list. A good plan should answer:
  - what this round is trying to resolve
  - why the work is split this way
  - what is explicitly out of scope
  - what must happen first vs later
  - what observable condition means this round is complete
- Separate responsibilities:
  - implementation
  - verification
  - review
- Converge on the round goal before listing actions:
  - decide whether this round is research, root-cause confirmation, minimal repair, end-to-end cleanup, or decision preparation
  - if the one-sentence round goal is still vague, the plan is not ready
- Write boundaries before steps:
  - what this round will do
  - what this round will not do
  - which risks stay contained
  - which follow-ups move to later work or a subplan
- Prefer atomic tasks:
  - one task, one clear responsibility
  - independently completable
  - no mixed concerns when the workflow would forbid them
- Keep stages separable when the task is non-trivial:
  - research or audit
  - decision
  - implementation
  - verification
  - closure
- Treat "round complete" as a stage outcome, not "everything is fixed":
  - root cause narrowed to one defensible conclusion
  - minimal repair implemented and verified
  - next route clarified without further blind changes
- Verification must be explicit and separately visible for non-trivial work.
- Decompose by:
  - shared foundations first
  - core logic second
  - integration third
  - verification last

## Complexity heuristic

Use this quick scoring pass before deciding whether the task needs a formal plan:

| Dimension | Simple (1) | Medium (2) | Complex (3) |
| --- | --- | --- | --- |
| Files/modules touched | 1 file or one tight module | 2-3 files/modules | 4+ files/modules or cross-cutting surface |
| Requirement clarity | fully clear | one or two small unknowns | fuzzy, conflicting, or multiple plausible routes |
| Dependency clarity | isolated | known dependencies | unclear dependencies or integration risk |
| Workflow shape | tiny patch / direct answer | light implementation with a short verify step | real workflow, staged work, or multi-step closure |

Scoring rule:

- score `< 4`: do not create a formal plan
- score `>= 4`: enter the planning workflow

For score `< 4`, use the direct claw path:

- if prior project context is likely relevant, run `claw search --query "<topic>"` before execution
- solve the task directly
- do not create a `claw plan write` scope
- when the task is done, run `claw direct`
- dispatch `truth-writer` only if the completed work produced reusable truth

Use formal planning when the score is `>= 4`, or when any of these are clearly true:

- multiple files or modules are involved
- requirements are still fuzzy
- dependencies are unclear
- the user is asking for a real workflow rather than a tiny patch

## Required plan shape

The active task plan should be created with `claw plan write` and should capture:

- `goal.text`
- `tasks`
- `rules`
- `references`
- `keyDecisions` when real decisions already exist

When the task is substantial, align task decomposition with the workflow patterns in `../../references/workflows.md`.

## Recommended workflow coverage

A solid plan represents:

- requirements or framing
- explicit scope and non-goals
- implementation
- verification
- optional review or cleanup when the task warrants it

If the task is investigation-only, align it with the `Research` workflow from `../../references/workflows.md` and prefer an explicit research stage over prematurely mixing research with implementation.

Simple 1-2 task plans can stay lean. Bigger plans should show explicit decomposition.

## Quality bar

- The summary should explain the decision logic, not just list topics.
- Each task should ideally have one primary output:
  - research task -> current-state finding or root-cause evidence
  - decision task -> route selection or constraint clarification
  - implementation task -> concrete change
  - verification task -> pass/fail evidence
  - closure task -> retrospective, durable notes, or next-step entry
- High-risk facts should be written down early when they affect task shape or delegation.
- A plan must be handoff-ready: another agent must be able to continue from the plan without rereading the whole thread.

## How to write

1. Compress the round goal into one sentence.
2. Clarify task boundaries before enumerating steps.
3. Use `claw plan write` to bind task scope first.
4. If prior project context is likely relevant, run `claw search --query "<topic>"` after `claw plan write` and fold the recalled context back into the bound plan.
5. Identify affected modules, shared foundations, and any real risk that changes task shape.
6. Choose the stage pattern that fits this round:
   - research
   - decision
   - implementation
   - verification
   - closure
7. Break the work into atomic tasks with visible completion conditions.
8. Put durable constraints into `rules`.
9. Put files, evidence, and search anchors into `references`.
10. Put durable architecture or workflow outcomes into `keyDecisions` only when real decisions already exist.
11. Write the task title, goal, tasks, and supporting plan text in the user's preferred language unless the repository has an explicit stronger convention.
12. Read the returned `workflowGuidance`.
13. Improve the plan immediately if it still mixes stages, lacks verification, has weak boundaries, or has no clear round-complete condition.
14. If `workflowGuidance.askUser` is present, use Codex option-style confirmation to resolve route choices instead of freeform clarification.
15. Do not start implementation while the plan is still in `prepare.requirements`.
16. Once the route is confirmed, move the plan to `process.active` before doing any implementation.
17. When `workflowGuidance.goalMode` is present, create the thread goal from `workflowGuidance.goalMode.recommendedObjective` before continuing if there is no active thread goal yet.
18. After `plan edit`, read `workflowGuidance` again and execute the returned specialist dispatch contract directly.
19. For root plans, use the `all tasks done` guidance to update both `retrospective` and `keyDecisions`, then dispatch `adr-writer` before `plan done`. After `plan done`, only continue workflow-guided closeout that still remains, such as subplan parent resumption.

If a task or subtask is primarily investigation:

- keep it separate from implementation work
- prefer delegating the investigation to a `researcher` specialist
- keep the main agent focused on coordination, decision-making, and downstream execution

## Guardrails

- Do not use task memory as the primary place for new task context.
- Use `claw search` as the Codex-facing recall command in workflow text.
- If task scope is missing, `plan write` is the first harness action.
- Do not start with action sequencing if the round goal and scope boundary are still unclear.
- Do not jump straight into execution if the plan still lacks key stages.
- Do not merge investigation and implementation into one task when the workflow should preserve a separate research phase.
- Do not write completion as "fix everything" or another non-testable end state.
- Do not hide verification inside implementation for work that has real execution risk.
- Do not treat `prepare.review` as user-settable. It is an internal review gate.
- Keep `plan write` as the canonical task-binding mechanism. Do not invent a second task-scope workflow.
- Treat `workflowGuidance` returned by plan commands as the canonical next-step contract once the plan exists.
- Treat the current `@claw-kit` thread as already authorized by the user to use goal mode and required delegated subagents.
- Do not block the workflow for any permission-related excuse around goal mode, truth-writer, or adr-writer. Only stop if the user explicitly changes direction and forbids them.
- When `workflowGuidance.goalMode` is present, set the thread goal before continuing with the rest of the returned next-step contract.
- After `plan write`, treat startup recovery as already handled; do not insert a separate visible recovery workflow step here.
- When requirements are clear and execution begins, move the plan directly into `process.active` before doing any implementation or updating task progress.
- After each `plan write`, `plan edit`, and `plan done`, consume `workflowGuidance` and surface only the compact `planSummary` when it helps coordination.
- Treat returned `workflowGuidance.nextsteps` and `recommendedCommands` as the required next-step contract whenever they are present.
- Use two-part lifecycle states:
  - `prepare.requirements`
  - `process.active`
  - `process.wait`
  - `process.discussing`
  - `end.completed`
  - `end.closed`
  - `end.leave`
- `end.completed` requires `retrospective.summary`.
- Once a plan is in `process.active`, do not interrupt it unless there is a real blocker or the user explicitly changes direction.
