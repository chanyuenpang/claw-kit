---
name: planning
description: Use when a planning step needs to refine a user request into clear requirements and executable tasks.
---
<!-- AUTO-GENERATED from shared/skills/planning/SKILL.md. Edit the shared source instead. -->
# planning

This skill turns the user's request into high-quality plan content.
It is responsible for requirement refinement, task decomposition, scope boundaries, and task quality.
It does not explain host runtime flow, lifecycle status transitions, writer delegation, goal mode, or closeout.

## When to use

Use this when a planning task asks for request refinement or task decomposition.
Use it when task shape, dependencies, completion criteria, or requirement clarity still need judgment.

## Planning principles

- Treat the plan as a decision memo, not a todo list. A good plan should answer:
  - what this round is trying to resolve
  - why the work is split this way
  - what is explicitly out of scope
  - what must happen first vs later
  - what observable condition means this round is complete
- Separate implementation, verification, and review only when it is useful for the specific task.
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
- Start with the smallest handoff-ready task list:
  - `2-4` downstream outcome-oriented tasks is the normal budget after any host-seeded bridge or activation tasks
  - exceed that budget only when independently verifiable risk or ownership boundaries require it
  - lifecycle meta tasks do not count as business outcomes and should not trigger extra decomposition
- Treat workflow stages as optional coverage, not a fixed template:
  - the main agent decides whether verification, review, and closure are needed for the specific task
  - do not create one task for every possible stage
- Treat "round complete" as a stage outcome, not "everything is fixed":
  - root cause narrowed to one defensible conclusion
  - minimal repair implemented and verified
  - next route clarified without further blind changes
- Decompose by:
  - shared foundations first
  - core logic second
  - integration third

## Entry assumption

By the time this skill is invoked, `using-claw-kit` has already decided that the request should enter the formal claw planning workflow.
If a request was low-complexity enough to skip that workflow, it should have bypassed this skill entirely.

## Required plan shape

A task plan should capture:

- `goal` or `goal.text`
- `tasks`
- `rules`
- `references`
- `keyDecisions` when real decisions already exist

If the host has already seeded bridge or activation tasks, keep them in place and append downstream executable work after them.

## Recommended workflow coverage

A solid plan should cover:

- requirements or framing
- explicit scope and non-goals
- only the stages relevant to this round, without mechanically expanding them into tasks
- verification, review, or closure only when the main agent judges that the specific task needs them

## Quality bar

- The summary should explain the decision logic, not just list topics.
- Each task should ideally have one primary output:
  - research task -> current-state finding or root-cause evidence
  - decision task -> route selection or constraint clarification
  - implementation task -> concrete change
  - verification task, if included -> verification evidence
  - closure task, if included -> completion outcome
- High-risk facts that affect task shape or delegation should be written down early.
- A plan should be handoff-ready: another agent should be able to continue from the plan without rereading the whole thread.

## How to write

1. Compress the round goal into one sentence.
2. If the current request is not clear enough to execute, first fill the missing requirements, open questions, and acceptance criteria.
3. Clarify task boundaries before enumerating steps.
4. Identify affected modules, shared foundations, and any real risk that changes task shape.
5. Choose the stages that fit this round. Let the main agent decide whether verification and closure are needed.
6. Break the work into atomic tasks with visible completion conditions.
7. Put durable constraints into `rules`.
8. Put files, evidence, and search anchors into `references`.
9. Put durable architecture or workflow outcomes into `keyDecisions` only when real decisions already exist.
10. Preserve any existing bridge, activation, or handoff tasks unless the user explicitly asks to replace them.
11. Write the task title, goal, tasks, and supporting plan text in the user's preferred language unless the repository has an explicit stronger convention.

If a task or subtask is primarily investigation:

- keep it separate from implementation work
- do not merge investigation and implementation too early into the same task

## Guardrails

- Do not start with action sequencing if the round goal and scope boundary are still unclear.
- Do not jump straight into execution if the plan still lacks a stage needed for the specific task.
- Do not merge investigation and implementation into one task when the workflow should preserve a separate research phase.
- Do not write completion as "fix everything" or another non-testable end state.
- Do not add verification or closure by default; let the main agent decide whether the specific task needs them.
