---
name: using-claw-kit
description: Use first whenever claw-kit workflow is active in a .claw project; this is the main-agent contract for guidance and lifecycle handling.
---
# using-claw-kit

Use this skill to enter or resume `.claw` work and consume CLI `workflowGuidance` correctly.

## Guidance contract

- Returned or recovered `workflowGuidance` is the only next-step contract. Follow its stage, user-input request, and exact recommended commands instead of reconstructing a default workflow from this skill.
- If a recovered plan or guidance exists, continue it before creating anything. If an explicitly invoked template-backed workflow skill owns entry, let that skill route the request.
- With no task scope, create a project plan when reusable project knowledge is expected. If the work benefits from the full plan/Goal/skill harness but must not deposit project knowledge (including work outside a `.claw` cwd), use `claw plan create "<title>" --scope session`; use direct work only when the harness itself adds no value. A new plan starts in `process.discussing`.
- Session scope is explicit and ephemeral: it recovers by platform session id across cwd changes, never persists host, and skips project Truth/ADR, memory, GitNexus, and retention side effects. Use `claw session clean` when the session workflow should be removed immediately.
- Use `claw search` only when returned guidance recommends recall or project context would materially help.

## Lifecycle semantics

- `process.discussing`: a stable cross-turn state for planning and user collaboration. Do not implement, enter Goal Mode, convert it to `wait`, or close it merely because discussion continues.
- `process.active`: downstream tasks are explicit and the user can hand off execution. Execute one task at a time and keep plan progress current through returned guidance.
- `process.wait`: active execution is blocked on user input or an external dependency. Stop until returned guidance resumes it.
- `end.completed`: the canonical completed plan status. Its returned guidance uses stage `done`; record the retrospective and durable key decisions, then close the plan through that guidance.

## Hard boundaries

- Edit canonical plan state only through claw commands supplied or permitted by returned guidance; never compensate for a failed host action by repeating a canonical transition.
- Do not infer hidden workflow steps from static prose or edit `plan.json` directly.
- Keep claw-generated metadata and host prompts in English while preserving user-supplied project content in its original language.
