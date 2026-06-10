---
name: using-claw-kit
description: Use first whenever the @claw-kit plugin is invoked in a Codex thread; this is the main-agent workflow contract for plan, search, truth, ADR, and hook-aware startup.
---

# using-claw-kit

Use this skill first whenever the `@claw-kit` plugin is invoked.

This is the main-agent entry skill. Keep it compact.
Use it to recover startup shape, route into the right `.claw` workflow, and follow CLI `workflowGuidance` as the contract.

## Core execution chain

Keep the core chain minimal:

`user prompt` -> `claw search` -> `claw plan write` -> `plan status: process.active` -> `process task 1` -> `spawn or reuse truth-writer` -> `process task 2` -> `reuse truth-writer` -> `...` -> `retrospective` -> `claw plan done` -> `spawn adr-writer`

## First action

The first action is to read `../planning/SKILL.md`.

Use `planning` as the visible plan-entry skill for the current task, then continue the rest of the claw-kit workflow from there.

Do not open with a generic greeting when recovered harness state is available.
Do not tell the user that claw-kit cannot proceed because `.claw` is missing, malformed, or has no current task. Startup recovery belongs to the hook/runtime side, and the visible claw-kit workflow should continue through planning and returned `workflowGuidance`.

## Non-negotiable rules

- Run `claw search` before `claw plan write`.
- Run `claw search` before research work.
- Treat `claw search` as project-doc recall for memory, truth, ADR, and external markdown docs; it is not the code-search surface.
- Treat `claw plan write` as the only normal task-scope entrypoint.
- After every `claw plan write`, `claw plan edit`, or `claw plan done`, follow returned `workflowGuidance` instead of inventing a parallel process.
- When a plan first enters `process.active`, set the thread goal from `workflowGuidance.goalMode.recommendedObjective` if the thread does not already have an active goal.
- Treat the current `@claw-kit` thread as already authorized to use goal mode and required delegated subagents unless the user explicitly forbids them.
- Do not start implementation while the plan is still in `prepare.requirements`.
- If `goal.text` is missing, fill it before trying to enter `process.active`.
- Keep truth deposition between task execution and retrospective closure.
- Run ADR deposition only after `claw plan done`.
- Do not claim truth or ADR deposition happened unless the corresponding specialist was actually dispatched.
