---
name: planning
description: Use when new work needs a .claw task scope and initial plan.
---

# claw-kit planning

This skill ports the intent of OpenClaw planning into Codex.

## When to use

Use this when the request is more than a tiny one-file change, or when task shape, dependencies, or completion criteria are unclear.

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
- Verification should usually be explicit and separately visible.
- Decompose by:
  - shared foundations first
  - core logic second
  - integration third
  - verification last

## Complexity heuristic

Use formal planning when any of these are true:

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

A solid plan should usually represent:

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
- A plan should be handoff-ready: another agent should be able to continue from the plan without rereading the whole thread.

## How to write

1. Compress the round goal into one sentence.
2. Clarify task boundaries before enumerating steps.
3. If prior project context is likely relevant, run `claw search --query "<topic>"` before `claw plan write`.
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
10. Use `claw plan write` to establish the task scope.
11. Write the task title, goal, tasks, and supporting plan text in the user's preferred language unless the repository has an explicit stronger convention.
12. Read the returned `workflowGuidance`.
13. Improve the plan immediately if it still mixes stages, lacks verification, has weak boundaries, or has no clear round-complete condition.
14. If `workflowGuidance.askUser` is present, use Codex option-style confirmation to resolve route choices instead of freeform clarification.

If a task or subtask is primarily investigation:

- keep it separate from implementation work
- prefer delegating the investigation to a `researcher` specialist
- keep the main agent focused on coordination, decision-making, and downstream execution

## Guardrails

- Do not use task memory as the primary place for new task context.
- Use `claw search` as the Codex-facing recall command in workflow text.
- Do not start with action sequencing if the round goal and scope boundary are still unclear.
- Do not jump straight into execution if the plan still lacks key stages.
- Do not merge investigation and implementation into one task when the workflow should preserve a separate research phase.
- Do not write completion as "fix everything" or another non-testable end state.
- Do not hide verification inside implementation for work that has real execution risk.
- Do not treat `prepare.review` as user-settable. It is an internal review gate.
- Keep `plan write` as the canonical task-binding mechanism. Do not invent a second task-scope workflow.
- Treat `workflowGuidance` returned by plan commands as the canonical next-step contract once the plan exists.
