# ADR: Plan-owned knowledge capture opt-out

## Context

Using `scope` to decide whether a plan deposits knowledge conflated temporary storage with knowledge eligibility and let session behavior silently suppress capture. The project needs a durable, host-neutral capture contract that remains valid through plan lifecycle transitions and adapter request boundaries.

## Decision

Persist `PlanDocument.knowledgeCapture` as the canonical eligibility decision, defaulting it to `true` for new and legacy plans. Expose only `--no-knowledge-capture` as the public CLI opt-out; do not add a positive capture flag. Preserve `scope` for storage and lifecycle meaning only. Reject session-scoped plans with enabled capture because they lack a project task capture target. Internal writer and delegate plans explicitly opt out to prevent recursive finalization.

## Alternatives

- Infer eligibility from `scope: session`: rejected because it couples unrelated concepts and makes suppression implicit.
- Offer a positive `--knowledge-capture` switch: rejected because capture is the default and the extra surface weakens the opt-out contract.
- Allow enabled session capture without a target: rejected because it cannot produce a valid project-owned finalization record.

## Consequences

- Lifecycle, workflow guidance, sidecar, CLI, and adapter code must consume the persisted flag rather than re-derive eligibility from scope.
- Session-scoped callers must state their intentional opt-out explicitly.
- Existing plans without the field preserve capture by default, while recursive internal work stays excluded through template-owned `false` values.

## Related code

- `packages/core/src/plan.ts`
- `packages/core/src/workflow-guidance.ts`
- `packages/core/src/knowledge-sidecar.ts`
- `packages/cli/src/cli.ts`
- `.claw/truth/features/plan-owned-knowledge-capture-contract.md`

## Search terms

- `knowledgeCapture`
- `--no-knowledge-capture`
- `KNOWLEDGE_CAPTURE_TARGET_REQUIRED`
