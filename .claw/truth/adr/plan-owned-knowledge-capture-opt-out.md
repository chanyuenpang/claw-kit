# ADR: Plan-owned capture with one automatic project workflow

## Context

The prior migration introduced knowledgeCapture but retained public scope, so agents still had to select storage and combine two controls. That implementation also coupled non-capture work to session retention and inconsistent completion guidance. The product contract now requires automatic local project setup and one workflow, while retaining a non-recursive knowledge channel for finalizers. Historical code and ADRs are evidence of implementation, not proof that the user requested the extra storage choice.

## Decision

- Expose only capture intent for this choice: knowledge_capture / knowledgeCapture, with CLI --knowledge-capture true|false and the existing negative alias. Remove public scope and new template storage declarations.
- Core owns request validation, read-only configuration preparation, single-focus admission and idempotent local initialization. Invalid input/focus conflicts precede writes; defaults must not replace existing settings. No global installation or host restart is implied.
- New roots use project storage regardless of capture. False affects knowledge accumulation only; normal configuration, lifecycle and retrospective rules remain the same. Allocate fresh containers so auxiliary roots cannot overwrite unrelated work with the same display title.
- Keep the existing template creation → canonical claim contract. Knowledge-result plans must stay false; job identity, admitted actor, project and exact delegate binding own the actual authority. Do not use template names or storage labels as extra permission gates. A temporarily left parent with an unfinished child is not release proof.
- Keep old internal storage locators and receipts for in-place recovery, without recreating plans, changing tokens or replaying unknown sends. Do not migrate old data merely because the public parameter disappeared.

- Retention consults existing focus and job/execution owners before moving or deleting task containers. These records are authoritative evidence that recovery still needs the exact files. A false negative can irreversibly lose release/focus proof; a false positive only retains the affected data longer and must not block workflow execution. This check cannot be deferred until after deletion. Its scope is the referenced task/source-job container, not unrelated work; no new protection registry is persisted.

## Alternatives

- Retain or rename a public temporary/session/storage selector: rejected because it preserves the unnecessary user decision.
- Map capture:false to a temporary store or a shorter lifetime: rejected because not accumulating knowledge does not authorize changing data retention.
- Remove storage metadata from persisted references: rejected because existing workflow recovery still needs its exact location.
- Add a second finalizer registry or joint job/plan bootstrap state machine: unnecessary for this interface repair; reuse current creation, claim and closeout owners.

## Consequences

Adapters remain thin parameter and effect mappings. Root creation validates before setup; current template authoring rejects scope while legacy readers remain compatible. A knowledge-result capture conflict is a Core composition check: allowing it could recursively create writer jobs; an intentional capture-enabled ordinary workflow must not use that lifecycle hook. The rejection affects only the conflicting request and occurs before project writes. Identity/claim/unknown-outcome safeguards remain necessary; directory, catalog, version and model metadata are not substitutes for owner evidence.

See the [current capture contract](../features/plan-owned-knowledge-capture-contract.md) for implementation and regression anchors.

<!-- state: history -->
## Decision evolution

<!-- dated: 2026-10-08 -->
### Supersede scope plus opt-out-only creation

The earlier decision preserved public scope and offered only --no-knowledge-capture, rejecting session capture without a project target. That explains legacy data and contracts but no longer governs new creation. New explicit boolean input may override ordinary template defaults; finalizer knowledge-result workflows remain non-capturing.
