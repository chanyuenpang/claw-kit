---
name: planning
description: Use when a planning step needs to refine a user request into clear requirements and executable tasks.
---
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
- keep stages separable:
  - research or audit
  - decision
  - implementation
  - verification
  - closure
- optional review or cleanup when the task warrants it

## Quality bar

- The summary should explain the decision logic, not just list topics.
- Each task should ideally have one primary output:
  - research task -> current-state finding or root-cause evidence
  - decision task -> route selection or constraint clarification
  - implementation task -> concrete change
  - verification task -> pass/fail evidence
  - closure task -> retrospective, durable notes, or next-step entry
- High-risk facts that affect task shape or delegation should be written down early.
- A plan should be handoff-ready: another agent should be able to continue from the plan without rereading the whole thread.

## How to write

1. Compress the round goal into one sentence.
2. If the current request is not clear enough to execute, first fill the missing requirements, open questions, and acceptance criteria.
3. Clarify task boundaries before enumerating steps.
4. Identify affected modules, shared foundations, and any real risk that changes task shape.
5. Choose the stage pattern that fits this round:
   - research
   - decision
   - implementation
   - verification
   - closure
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
- Do not jump straight into execution if the plan still lacks key stages.
- Do not merge investigation and implementation into one task when the workflow should preserve a separate research phase.
- Do not write completion as "fix everything" or another non-testable end state.
- Do not hide verification inside implementation for work that has real execution risk.
