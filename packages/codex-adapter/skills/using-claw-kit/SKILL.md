---
name: using-claw-kit
description: Use first whenever the @claw-kit plugin is invoked in a Codex thread; this is the main-agent workflow contract for plan, search, truth, ADR, and hook-aware startup.
---

# using-claw-kit

Use this skill first whenever the `@claw-kit` plugin is invoked.

This is the main-agent workflow skill. The main agent runs the normal `.claw` flow from this skill plus CLI `workflowGuidance` without depending on any legacy entry skill.

## Core execution chain

The default claw-kit execution chain is:

1. stay in `prepare.requirements`
2. enter goal mode
3. check whether requirements are already clear
4. ask the user only if requirements are still ambiguous
5. move the plan to `process.active`
6. process task 1
7. dispatch `truth-writer`
8. process task 2
9. dispatch `truth-writer`
10. continue this pattern until all tasks are done
11. write the retrospective
12. run `claw plan done`
13. dispatch `adr-writer`

Treat this as the canonical harness flow.
Do not compress it into "finish work and write docs later".
Truth deposition belongs between task execution and retrospective closure.
ADR deposition belongs after the completed `plan.json` exists.

## First action

Report the recovered harness state before normal conversation:

- whether `.claw/` was initialized or corrected in this bootstrap pass
- current task and active plan, when present
- current plan status
- relevant `.claw/project.json` behavior:
  - `externalTruthSkill`
  - `externalAdrSkill`
  - `memory.externalDocPaths`
  - `gitnexus.enabled`

Do not open with a generic greeting when recovered harness state is available.
Do not tell the user that claw-kit cannot proceed because `.claw` is missing, malformed, or has no current task. Session bootstrap already recovered the harness state and the claw-kit workflow continues from there.

## Main workflow

1. Before writing a new plan, optionally run `claw search --query "<topic>"` to recover relevant project context from `.claw` indexes and external doc paths.
2. If no task scope exists and the user is starting work, create or bind one through `claw plan write`.
3. Treat `plan write` as the canonical task-scope entrypoint.
4. After every `claw plan write`, `claw plan edit`, or `claw plan done`, consume `workflowGuidance` and the compact `planSummary`.
5. Follow `workflowGuidance.nextStep` and `recommendedCommands` as the required next-step contract instead of inventing your own heuristic.
6. After `claw plan write`, set the thread goal from `workflowGuidance.goalMode.recommendedObjective` immediately.
7. If `workflowGuidance.askUser` is present, use Codex option-style confirmation.
8. Treat startup recovery as a hook/bootstrap responsibility, not a post-plan workflow step.
9. If requirements are already clear, move directly to `process.active`.
10. Do not start implementation while the plan is still in `prepare.requirements`.
11. During execution, process one task at a time and update progress with `claw plan edit`.
12. After a meaningful completed task, dispatch `truth-writer` when there is reusable context to deposit.
13. When all tasks are done, complete the retrospective.
14. Close the plan with `claw plan done` only after `retrospective.summary` exists.
15. After `claw plan done`, dispatch ADR deposition using the completed `plan.json`.

## Investigation-first rule

If the task is primarily investigation, analysis, or evidence gathering rather than direct implementation:

- delegate it to a `researcher` specialist to preserve main-agent context
- dispatch the specialist as `explorer`
- attach `claw-kit:researcher` explicitly
- reuse an existing same-type `researcher` in the thread
- give the researcher a narrow brief and specific targets
- have the researcher use `claw search` first for `.claw` context, truth, and ADR lookup
- read `.claw/project.json`
- treat `gitnexus.enabled = true` as a direct instruction to discover and use GitNexus-oriented capabilities for code investigation

## Plan rules

- Do not invent a second task-binding mechanism outside `plan write`.
- Do not treat `switch-task` as the happy path; it is advanced return-to-history behavior.
- Use two-part lifecycle states such as `prepare.requirements`, `process.active`, and `end.completed`.
- Do not set `prepare.review` manually.
- `end.completed` requires `retrospective.summary`.
- After each plan mutation, surface only the compact `planSummary` when useful; do not reprint raw `plan.json`.

## Truth and ADR delegation

`truth-writer` and `adr-writer` are subagent skills, not main-agent workflow skills.

When `workflowGuidance.delegateSubagents` is present:

- Codex has multi-agent capability. Use `tool_search` to locate the current session's agent-management tools.
- Dispatch the named specialist; do not merely describe delegation.
- Do not bypass writer specialists by writing canonical truth or ADR content inline from the main agent.
- Do not add a separate permission gate unless the user explicitly disables delegation.
- Dispatch specialist writers as `worker` subagents.
- Use the `model` value from `workflowGuidance.delegateSubagents[*]`. The built-in writer contract sets this to `gpt-5.4-mini`.
- Attach the exact writer skill from `workflowGuidance.delegateSubagents[*].skill` when dispatching.
- Reuse an existing same-type specialist.
- Respect `waitForCompletion` and `closePolicy`.
- Do not claim truth or ADR deposition happened unless the corresponding subagent was actually spawned.

Investigation delegation should follow the same discipline even when it is triggered by task shape rather than `workflowGuidance.delegateSubagents`.

Truth flow:

- Triggered by task/subtask completion or all-task-done guidance.
- Input is a completed subtask report or equivalent task report.
- Canonical root is `.claw/truth/`.
- Canonical truth writing runs through `truth-writer`, not an inline main-agent shortcut.
- Truth deposition happens before retrospective closure.

ADR flow:

- Triggered after `claw plan done`.
- Input is the completed `plan.json`.
- Canonical root is `.claw/truth/adr/`.
- Canonical ADR writing runs through `adr-writer`, not an inline main-agent shortcut.
- ADR deposition is async and does not block main-agent wrap-up.

## Search and completion side effects

- Use `claw search --query "<text>"` for Codex-facing recall.
- `claw search` is project-scoped.
- `claw search` can be used to recover truth and ADR context because `.claw/truth/` content is part of the searchable project recall surface.
- Task-specific docs or investigation artifacts should be attached through `plan.references`, not through a task-local search mode.
- `claw plan done` refreshes project/task search indexes.
- `gitnexus.enabled` in `.claw/project.json` controls whether `claw plan done` also runs GitNexus reindex.
- A GitNexus CLI that lacks `--no-ai-context` support uses the plain `gitnexus analyze` compatibility path. Treat that as normal environment adaptation, not a workflow failure.

## Hooks

Hooks are enhancement, not the correctness path.

- `SessionStart` listens to session start globally; the only claw-kit runtime gate is that `cwd` resolves inside a `.claw` project.
- The bootstrap hook adds compact project context and tells the agent to use `[@claw-kit](plugin://claw-kit@claw-kit-local)`.
- The core workflow remains valid without hook delivery. Prompt-driven startup plus CLI `workflowGuidance` stays authoritative.

## Reference loading

Load these as the next detail layer for the current workflow:

- Plan semantics: `../../references/workflows.md`
- Workflow guidance fields: `../../references/workflow-guidance-consumption.md`
- Subagent dispatch rules: `../../references/codex-subagent-dispatch.md`
- Researcher rules: `../researcher/SKILL.md`
- Truth writer rules: `../../references/TRUTH-AGENT-SPEC.md`
- ADR writer rules: `../../references/ADR-AGENT-SPEC.md`
