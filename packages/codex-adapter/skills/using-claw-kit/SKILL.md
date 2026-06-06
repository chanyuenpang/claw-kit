---
name: using-claw-kit
description: Use first whenever the @claw-kit plugin is invoked in a Codex thread; this is the main-agent workflow contract for plan, search, truth, ADR, and hook-aware startup.
---

# using-claw-kit

Use this skill first whenever the `@claw-kit` plugin is invoked.

This is the main-agent workflow skill. The main agent runs the normal `.claw` flow from this skill plus CLI `workflowGuidance` without depending on any legacy entry skill.

## First action

Run:

```powershell
claw context
```

Then report the recovered harness state before normal conversation:

- whether `.claw/` was found
- current task and active plan, if any
- current plan status
- relevant `.claw/project.json` behavior:
  - `memory.externalDocPaths`
  - `gitnexus.enabled`

Do not open with a generic greeting when `.claw` context is available.

## Main workflow

1. Before writing a new plan, optionally run `claw search --query "<topic>"` to recover relevant project context from `.claw` indexes and external doc paths.
2. If no task scope exists and the user is starting work, create or bind one through `claw plan write`.
3. Treat `plan write` as the canonical task-scope entrypoint.
4. After every `claw plan write`, `claw plan edit`, or `claw plan done`, consume `workflowGuidance` and the compact `planSummary`.
5. Follow `workflowGuidance.nextStep` and `recommendedCommands` instead of inventing your own next-step heuristic.
6. If `workflowGuidance.askUser` is present, use Codex option-style confirmation.
7. If requirements are confirmed, move the plan to `process.active` before updating task progress.
8. When `workflowGuidance.goalMode` appears, set the thread goal from `workflowGuidance.goalMode.recommendedObjective`.
9. During execution, update progress with `claw plan edit`.
10. When all tasks are done, dispatch truth deposition before closing the plan.
11. Close the plan with `claw plan done` only after `retrospective.summary` exists.
12. After `claw plan done`, dispatch ADR deposition using the completed `plan.json`.

## Investigation-first rule

If the task is primarily investigation, analysis, or evidence gathering rather than direct implementation:

- delegate it to a `researcher` specialist to preserve main-agent context
- dispatch the specialist as `explorer`
- attach `claw-kit:researcher` explicitly
- reuse an existing same-type `researcher` in the thread
- give the researcher a narrow brief and specific targets
- have the researcher use `claw search` first for `.claw` context, truth, and ADR lookup
- if `.claw/project.json` says `gitnexus.enabled = true`, have the researcher discover and use GitNexus-oriented capabilities for code investigation

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

- Codex has multi-agent capability. When needed, use `tool_search` to locate the current session's agent-management tools.
- Dispatch the named specialist; do not merely describe delegation.
- Do not bypass writer specialists by writing canonical truth or ADR content inline from the main agent.
- Do not add a separate permission gate unless the user explicitly disables delegation.
- Dispatch specialist writers as `worker` subagents.
- Use `gpt-5.4-mini` for writer specialists by default.
- Attach the corresponding writer skill explicitly when dispatching, such as `claw-kit:truth-writer` or `claw-kit:adr-writer`.
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
- GitNexus `--no-ai-context` fallback is normal compatibility behavior, not a workflow failure.

## Hooks

Hooks are enhancement, not the correctness path.

- `SessionStart` is the bootstrap hook path for sessions that start inside a `.claw` project.
- The bootstrap hook adds compact project context and tells the agent to use `[@claw-kit](plugin://claw-kit@claw-kit-local)`.
- The core workflow must still work if hooks do not fire, so prompt-driven startup plus CLI `workflowGuidance` remains valid.

## Reference loading

Only load these when the current task needs deeper detail:

- Plan semantics: `../../references/workflows.md`
- Workflow guidance fields: `../../references/workflow-guidance-consumption.md`
- Subagent dispatch rules: `../../references/codex-subagent-dispatch.md`
- Researcher rules: `../researcher/SKILL.md`
- Truth writer rules: `../../references/TRUTH-AGENT-SPEC.md`
- ADR writer rules: `../../references/ADR-AGENT-SPEC.md`
