---
name: planning
description: Use when a planning step needs to refine a user request into clear requirements, scope, completion criteria, dependencies, and executable tasks, especially when task boundaries or an evidence-dependent route still need judgment.
---
# planning

This skill turns the user's request into high-quality plan content.
It is responsible for requirement refinement, task decomposition, scope boundaries, and task quality.
Host runtime flow, lifecycle transitions, goal mode, and closeout remain the responsibility of `using-claw-kit`.

## Planning principles

- Converge on the round goal before listing actions:
  - decide whether this round is research, root-cause confirmation, minimal repair, end-to-end cleanup, or decision preparation
  - continue refinement until the one-sentence round goal is clear
- Write boundaries before steps:
  - what this round will do
  - which items remain outside this round
  - which risks stay contained
  - which follow-ups move to later work or a subplan
- Create tasks around meaningful progress checkpoints:
  - do not target a predefined task count
  - split when an outcome can be verified and later work can continue from it or retry it independently
  - decision, dependency, ownership, blocker, long-running execution, or materially different risk boundaries commonly form useful checkpoints
  - lifecycle meta tasks do not count as business outcomes and should not trigger extra decomposition
- Plan only as far as current evidence permits:
  - when the current stage cannot reliably determine downstream steps, plan through the decisive checkpoint and place a planning task after it
  - when that planning task becomes active, use the checkpoint evidence to append the next executable tasks
  - do not add evidence-dependent implementation, validation, documentation, or closure tasks after that planning task before it runs
  - do not invent speculative downstream tasks merely to make the initial plan appear complete
- Keep supporting work proportional to its checkpoint:
  - keep implementation, documentation, validation, and review in the same task when they jointly produce one outcome
  - separate supporting work only when its completion unlocks a distinct downstream task or belongs to a different ownership or risk boundary
  - independent rerun or review value alone does not justify another task
  - focused and package-wide final validation for one small change stays in its implementation task
- Define "round complete" as a concrete stage outcome:
  - root cause narrowed to one defensible conclusion
  - minimal repair implemented and verified
  - next route clarified without further blind changes
- When multiple checkpoints are warranted, order shared foundations before core logic and integration.

## Entry assumption

By the time this skill is invoked, `using-claw-kit` has already decided that the request should enter the formal claw planning workflow.
If a request had no expected reusable project knowledge and therefore skipped that workflow, it should have bypassed this skill entirely.

## Required plan content

A task plan should capture:

- `goal` or `goal.text`
- requirements, scope, and non-goals
- ordered tasks with visible completion conditions
- `rules`, `references`, and `keyDecisions` when they add durable execution context

Planning is ready to hand off when the requirements and proposed solution for the current stage have been discussed and confirmed with the user, material open questions for that stage are resolved, and its task list is ready. When an implementation route depends on evidence, confirm the decisive checkpoint and its follow-up planning task as the current-stage solution instead of inventing a downstream implementation solution. A draft alone does not meet this bar.

## Quality bar

- State the current round goal and decision logic, not just a list of topics.
- Explain why the work is split this way and what must happen first versus later.
- Make the scope boundary, non-goals, contained risks, and deferred follow-ups explicit.
- Give each task one primary, observable checkpoint and keep its supporting steps inside it.
- Use concrete, action-oriented task titles and define observable completion for each task and the round.
- High-risk facts that affect task shape or delegation should be written down early.
- A plan should be handoff-ready: another agent should be able to continue from the plan without rereading the whole thread.

## How to write

1. Compress the round goal into one sentence.
2. Discuss and confirm the requirements and proposed solution for the current stage with the user; when the implementation route depends on evidence, confirm the checkpoint route rather than a speculative implementation solution.
3. Clarify task boundaries before enumerating steps.
4. Identify affected modules, shared foundations, and any real risk that changes task shape.
5. Break reliably known work into meaningful progress checkpoints with visible completion conditions.
6. If a checkpoint must resolve the downstream route, follow it only with a planning task; let that task append the evidence-based execution tasks when it runs.
7. If repeated revisions are foreseeable, ask the user whether to add a final manual-review task before closeout; add it only when requested.
8. Keep supporting edits, documentation, tests, builds, checks, and review inside their outcome task unless they unlock distinct downstream work or cross an ownership or risk boundary.
9. Put durable constraints, evidence anchors, and established decisions into their plan fields when useful.
10. Preserve existing host-owned tasks instead of rewriting them as planning activities.
11. Write the task title, goal, tasks, and supporting plan text in the user's preferred language unless the repository has an explicit stronger convention.
