---
name: planning
description: Use when a planning step needs to refine a user request into clear requirements and executable tasks.
---
<!-- AUTO-GENERATED from shared/skills/planning/SKILL.md. Edit the shared source instead. -->
# planning

This skill turns the user's request into high-quality plan content.
It is responsible for requirement refinement, task decomposition, scope boundaries, and task quality.
Host runtime flow, lifecycle transitions, goal mode, and closeout remain the responsibility of `using-claw-kit`.

## When to use

Use this when a planning task asks for request refinement or task decomposition.
Use it when task shape, dependencies, completion criteria, or requirement clarity still need judgment.

## Planning principles

- Treat the plan as a decision memo. A good plan should answer:
  - what this round is trying to resolve
  - why the work is split this way
  - where this round's scope ends
  - what must happen first vs later
  - what observable condition means this round is complete
- Separate implementation, verification, and review only when it is useful for the specific task.
- Converge on the round goal before listing actions:
  - decide whether this round is research, root-cause confirmation, minimal repair, end-to-end cleanup, or decision preparation
  - continue refinement until the one-sentence round goal is clear
- Write boundaries before steps:
  - what this round will do
  - which items remain outside this round
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
- Treat workflow stages as optional coverage selected for the current task:
  - the main agent decides whether verification, review, and closure are needed for the specific task
  - combine relevant stages into the smallest useful set of outcome tasks
- Define "round complete" as a concrete stage outcome:
  - root cause narrowed to one defensible conclusion
  - minimal repair implemented and verified
  - next route clarified without further blind changes
- Decompose by:
  - shared foundations first
  - core logic second
  - integration third

## Entry assumption

By the time this skill is invoked, `using-claw-kit` has already decided that the request should enter the formal claw planning workflow.
If a request had no expected reusable project knowledge and therefore skipped that workflow, it should have bypassed this skill entirely.

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
- the stages relevant to this round, combined into outcome tasks where appropriate
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

For an investigation-first task, keep investigation separate until its findings establish the implementation route.

## Completion checks

- Establish the round goal and scope boundary before sequencing actions.
- Include each stage that the specific task needs before execution begins.
- Preserve a separate research phase when its findings determine the implementation route.
- Express completion as an observable, testable outcome.
- Let the main agent decide whether verification or closure adds value for the specific task.
