---
name: knowledge-writer
description: Evaluate supplied claw closeout materials by their content, then maintain canonical Truth followed by ADR knowledge in one consistency-aware pass.
---
# Knowledge writer

Use this skill as the knowledge-base steward after a claw workflow reaches an `end.*` boundary. Read all supplied closeout materials completely and interpret their content, regardless of filename, record shape, field names, or serialization format. Plans and reports are current input forms, not a closed input schema. Extract executed conclusions, verified findings, retrospective lessons, key decisions, and other explicit outcomes wherever they appear. When task status is present, use it as interpretation context for completed, pending, and blocked scope; task titles and descriptions are not themselves an execution log or proof of results.

Maintain one current owner for each material fact or decision across Truth and ADR; do not merely append a summary. Always process the eligible evidence in this order: maintain Truth first, then maintain ADR from the same evidence and the resulting Truth state. Do not add a routing or choice step between them.

Trusted conclusion evidence is authoritative for what was concluded at its own point in time, not automatically for the current worktree. Before writing a current-behavior claim, perform a read-only check of its implementation anchors and relevant later working-tree diff. This freshness check is not repeated implementation verification. Do not promote requirements or task descriptions into results merely because they appear in the plan. If conclusion evidence is superseded, conflicts with newer implementation in a way that cannot be resolved, or adds no durable reusable knowledge, make no canonical write.

## Session-scoped entry

The template declares `scope: "session"`, so direct entry works without a project `.claw` directory and does not trigger another knowledge-deposition cycle. Resolve `<skill-dir>` as the directory containing this loaded `SKILL.md`, run `claw plan create --template-file "<skill-dir>/TEMPLATE.json" --title "knowledge-writer"`, and follow returned `workflowGuidance`.

When this writer is an active parent-plan task, create the template as that task's subplan. On hosts with Goal Mode, consume the returned goal handoff so the active parent goal completes before the writer subplan creates its own goal. For a batch, use one writer subplan per source plan or coherent knowledge unit. These invocation shapes do not change the fixed Truth-then-ADR deposition sequence.

Use `non-claw-fallback.md` only when the claw CLI or this template is unavailable.

## Non-negotiable stewardship rules

- Use conclusion-bearing content from every supplied material as deposition evidence; do not bind evidence discovery to a fixed input structure or format.
- Read task status to interpret scope, but never treat the task list itself as an execution record or manufacture results from titles, details, requirements, or intentions.
- Truth and ADR are one knowledge system; maintain Truth first, then ADR, and leave all related current claims coherent.
- Use `claw search`, open every plausible candidate owner, and use exhaustive text search when top-k recall could hide a competing claim.
- Update the existing owner; create a document only for a genuinely new durable topic after filename and title collision checks.
- Preserve unrelated user edits. Never modify supplied source materials, alter their lifecycle, dispatch another writer, or refresh recall yourself.
- Re-run focused and exhaustive searches after writing. Do not report completion while a material current claim remains inconsistent or ownerless.
- Current implementation outranks older source wording for current-state Truth; supplied conclusions remain trusted historical evidence for the revision they describe.

## References

- Full direct workflow and fallback: `non-claw-fallback.md`
- Content coverage: `CONTENT-COVERAGE.md`
- Workflow template: `TEMPLATE.json`
