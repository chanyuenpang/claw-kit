# ADR: External writer skill config

## Status

Accepted

## Context

`claw-kit` runs one consistency-aware knowledge stewardship sequence owned by a finalization job. Projects need one stable content configuration surface to replace the hidden built-in governance assignment without restoring the retired main-agent `delegateSubagents` writer contract. Execution routes are host-owned, not a writer preference.

## Decision

Use one project-level object:

- Execution routing is fixed by the invoking host; legacy `knowledgeWriter.executionPolicy` is compatibility input, not a current launcher selector. Host-specific orchestration is owned by `hook-owned-two-phase-knowledge-finalization.md` and `docs/2026-10-02-fixed-host-knowledge-closeout.md`.
- `knowledgeWriter.externalSkills`: ordered external governance skills materialized as sequential required canonical-maintenance assignments. A failed required assignment prevents later canonical assignments from starting. An empty or absent list selects the hidden Core built-in governance contract rather than a discoverable skill.
- `knowledgeWriter.model`: `null` uses the host runner default; a value is snapshotted into each finalization job as a best-effort model preference, not an exact-match execution requirement.
- `knowledgeWriter.reasoningEffort`: defaults to `medium` and is snapshotted as a best-effort effort preference. A launcher may omit or adapt an unsupported effort/model before admission, provided it records the applied recipe honestly; this cannot relax permission, capture, claim, or unknown-delivery safety.
- `knowledgeWriter.datedSectionsToKeep`: a non-negative integer snapshotted into each finalization job; the built-in retention decision and default are owned by `bounded-truth-and-adr-evolution-governance.md`.

The host-owned closeout route snapshots effective content configuration into `KnowledgeFinalizationJob.writer`. All routes share the immutable job, assignment builders, claim ownership and done protocol; native host transport and originating-report capture remain host-specific. Admission and accepted/unknown delivery identities must not migrate or replay.

Built-in and external assignments use distinct prompt builders but share the canonical Truth/ADR minimum in the existing `knowledge-format.md` resource, conclusion-bearing evidence, relevant implementation anchors, and preservation of unrelated edits. The built-in assignment reconciles one-owner Truth and ADR outcomes; an external assignment explicitly invokes its configured skill, whose method may vary but cannot replace the minimum format. Both run unattended, distinguish completed scope from pending or blocked intent, skip ambiguous or unsafe writes, and prohibit links to transient supplied materials. No fixed investigation or Truth→ADR phase sequence is required.

Bounded dated-section retention is a built-in writer instruction, not a finalizer snapshot/trim gate. External skills do not inherit that built-in retention preference. The old nested `knowledgeWriter.retention` shape is not supported. Core completion authenticates the canonical claim and terminal compare-and-set; it does not inspect session workflows for a non-empty all-done task list or enforce governance phases.

When `memory.autoUpdate` is effective, claim appends the frozen optional `doc-updater` assignment after either canonical writer route. It updates existing documents within frozen paths. Report its changed paths, no-edit reason or failure independently, including unresolved inconsistencies; a failure does not negate or roll back successful Truth/ADR maintenance. Completing this optional task means recording its actual outcome, not claiming a failed update succeeded. Job, generated assignment plan, tracked subplan and report remain the audit boundary; `knowledge done` retains its established claim/CAS protocol without a separate doc-update receipt or a retry of accepted/unknown delivery.

Legacy `externalTruthSkill` and `externalAdrSkill` may be normalized only as backward-compatible input. They are not current project schema owners and cannot create separate phase dispatch policies.

## Alternatives Considered

- Let external skills replace canonical document format: rejected because method customization must not fragment project Truth/ADR semantics or evidence quality.
- Require a separate optional-doc success receipt or runtime workflow gate: rejected because recording the actual optional outcome in the existing assignment/report is sufficient and must not negate successful canonical maintenance.

## Consequences

- Projects can compose ordered writer capabilities without changing foreground plan workflow; adapters may use distinct launcher orchestration while preserving the shared job protocol.
- External skills choose their governance method without inheriting built-in retention policy, while retaining the shared canonical format, evidence and edit-preservation minimum.
- Job snapshots preserve the original assignment inputs if configuration changes; they do not authorize replay of accepted or outcome-unknown operations.
- `model = null` keeps host defaults available; explicit model and reasoning effort remain frozen requested preferences, while the launcher records the supported applied recipe and does not invent resolved child facts.
- Default built-in behavior is one hidden governance assignment that reconciles Truth and ADR together.
- Optional existing-document governance composes after either writer route rather than becoming another external-skill replacement branch.
- Existing-document governance is audited through the job, generated assignment plan, tracked subplan, and report without a second receipt transport.
- Host-owned routing changes visibility and timing without forking canonical format, claim ownership or completion semantics.

<!-- state: history -->
## Evolution history

<!-- dated: 2026-08-06 -->
### Removed receipt-gated doc-updater completion

The per-path receipt path briefly added a parallel success condition and CLI transport. It duplicated the audit material already retained by the job, generated assignment plan, tracked subplan, and report, so the decision restores the existing `knowledge done` protocol and keeps doc-updater template-backed instead.

<!-- dated: 2026-08-04 -->
### Cindy adopted template-owned assignment subplans

Cindy previously executed immutable assignments directly after atomic claim. It now loads a dedicated internal session delegate template, creates the generated assignment template as a subplan, and preserves Ghost transport plus originating-report capture as the host-specific boundary.

<!-- dated: 2026-08-01 -->
### Added Cindy subagent without universal plan orchestration

The earlier decision described `subagent` as Codex-only and treated the delegate template plus assignment subplan as universal. Cindy first added subagent execution through an atomic no-plan executor and removed its unreliable errand/background launcher. Both configured policy values still resolve to the Cindy subagent path, but Cindy now consumes a dedicated session delegate template and generated assignment subplan through Ghost operations. The stable decision remains one configuration and one job/assignment/token protocol, while transport details stay host-owned.

<!-- dated: 2026-07-21 -->
### Replaced strict external-skill invocation and universal workflow assertion

External skills were previously invoked with a strict-follow prompt and were subject to the same workflow-completion assertion as the built-in writer. That conflicted with unattended finalization when an external skill's own contract requires interactive confirmation. The finalizer now adopts external governance rules through an explicit unattended adapter prompt, while retaining the session-workflow assertion only for the built-in writer.

## Related Code

- `.claw/project.json`
- `packages/core/src/types.ts`
- `packages/core/src/init.ts`
- `packages/core/src/context.ts`
- `packages/core/src/project-check.ts`
- `packages/core/src/knowledge-sidecar.ts`
- `packages/core/src/knowledge-assignments.ts`
- `packages/core/resources/delegate-writer/TEMPLATE.json`
- `packages/core/resources/knowledge-writer/`
- `packages/cli/src/cli.ts`
- `packages/core/test/core.test.ts`
- `packages/cli/test/cli.test.ts`
