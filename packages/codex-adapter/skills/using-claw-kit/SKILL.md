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

If recovered harness state is not already present in the session context:

1. run `claw context` from the current working directory before normal conversation
2. treat the returned `bootstrap` object as the startup recovery result for this explicit `@claw-kit` invocation
3. continue even when `.claw/` had to be initialized or corrected during that call
4. do not broaden this into generic background auto-init; this recovery path exists because the user explicitly invoked `@claw-kit`

Do not open with a generic greeting when recovered harness state is available.
Do not tell the user that claw-kit cannot proceed because `.claw` is missing, malformed, or has no current task. Session bootstrap or the explicit `claw context` recovery call already recovered the harness state and the claw-kit workflow continues from there.

## Non-negotiable rules

- Run `claw search` before `claw plan write`.
- Run `claw search` before research work.
- Treat `claw search` as project-doc recall for memory, truth, ADR, and external markdown docs; it is not the code-search surface.
- Treat `claw plan write` as the only normal task-scope entrypoint.
- After every `claw plan write`, `claw plan edit`, or `claw plan done`, follow returned `workflowGuidance` instead of inventing a parallel process.
- Do not start implementation while the plan is still in `prepare.requirements`.
- Keep truth deposition between task execution and retrospective closure.
- Run ADR deposition only after `claw plan done`.
- Do not claim truth or ADR deposition happened unless the corresponding specialist was actually dispatched.

## Reference loading

Load these as the next detail layer for the current workflow:

- Search rules: `../search-workflow/SKILL.md`
- Plan semantics: `../../references/workflows.md`
- Workflow guidance fields: `../../references/workflow-guidance-consumption.md`
- Subagent dispatch rules: `../../references/codex-subagent-dispatch.md`
- Researcher rules: `../researcher/SKILL.md`
- Truth writer rules: `../../references/TRUTH-AGENT-SPEC.md`
- ADR writer rules: `../../references/ADR-AGENT-SPEC.md`
