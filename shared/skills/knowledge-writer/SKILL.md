---
name: knowledge-writer
description: Evaluate a completed claw plan and its adjacent turn report, then maintain canonical Truth and ADR knowledge in one consistency-aware pass.
---

# Knowledge writer

Use this skill as the knowledge-base steward after a claw plan completes. Read the supplied completed `plan.json` and every valid adjacent report entry as trusted verified evidence. Maintain one current owner for each material fact or decision across Truth and ADR; do not merely append a summary.

Trusted evidence is authoritative for what was verified at its own point in time, not automatically for the current worktree. Before writing a current-behavior claim, confirm the plan is actually completed and perform a read-only check of its implementation anchors and relevant later working-tree diff. This freshness check is not repeated implementation verification. If the input is incomplete, superseded, or conflicts with newer implementation in a way that cannot be resolved, choose no-op or preserve it only as explicitly historical evidence.

## Session-scoped entry

The template declares `scope: "session"`, so direct entry works without a project `.claw` directory and does not trigger another knowledge-deposition cycle. Use `non-claw-fallback.md` only when the claw CLI or this template is unavailable.

## Entry routing

Resolve `<skill-dir>` as the directory containing this loaded `SKILL.md`.

- Direct single-plan finalization: use `claw plan create --template-file "<skill-dir>/TEMPLATE.json" --title "knowledge-writer"`, then follow returned `workflowGuidance`.
- Active parent-plan task: use `claw subplan create --parent <parent-task-name> --task-id <id> --template-file "<skill-dir>/TEMPLATE.json"`; the subplan inherits its parent's scope.
- Batch or mixed request: create a normal root claw plan first, with one task per completed plan or coherent knowledge unit. Each target task must create and complete a `knowledge-writer` subplan instead of depositing knowledge directly from the root plan.

Recommended batch task title:

`Run a knowledge-writer subplan, maintain knowledge for <completed-plan>`

Recommended batch task detail:

`Goal: run the knowledge-writer subplan for <completed-plan> and its adjacent report. This task is satisfied by creating and completing that subplan. First resolve the loaded knowledge-writer skill directory and run claw subplan create --parent <root-task-name> --task-id <id> --template-file "<skill-dir>/TEMPLATE.json", then follow the returned workflowGuidance until it completes. Record the deposition or no-op result in the root plan before marking this task done.`

## Non-negotiable stewardship rules

- Truth and ADR are one knowledge system; leave all related current claims coherent.
- Use `claw search`, open every plausible candidate owner, and use exhaustive text search when top-k recall could hide a competing claim.
- Update the existing owner; create a document only for a genuinely new durable topic after filename and title collision checks.
- Preserve unrelated user edits. Never modify the supplied plan/report, alter its lifecycle, dispatch another writer, or refresh recall yourself.
- Re-run focused and exhaustive searches after writing. Do not report completion while a material current claim remains inconsistent or ownerless.
- Current implementation outranks older report wording for current-state Truth; the report remains trusted historical evidence for the revision it describes.

## References

- Full direct workflow and fallback: `non-claw-fallback.md`
- Content coverage: `CONTENT-COVERAGE.md`
- Workflow template: `TEMPLATE.json`
