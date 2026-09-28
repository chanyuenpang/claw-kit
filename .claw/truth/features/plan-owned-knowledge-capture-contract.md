# Plan-owned knowledge capture contract

<!-- state: current -->
## Current behavior

- Knowledge finalization eligibility belongs to persisted `PlanDocument.knowledgeCapture`, which defaults to `true` for new and legacy plans. It is not inferred from a knowledge-specific meaning of `scope`.
- `claw plan create` exposes only `--no-knowledge-capture` as the public opt-out; it does not expose a positive capture flag. The flag persists `knowledgeCapture: false`.
- Session scope remains storage and lifecycle terminology. Because session storage has no project task capture target, a session-scoped plan must use the explicit opt-out; enabled capture is rejected with `KNOWLEDGE_CAPTURE_TARGET_REQUIRED`.
- Root and subplan lifecycle, workflow guidance, knowledge sidecar behavior, and DSH/Cindy request envelopes consume the persisted value. Internal writer and delegate templates explicitly set `knowledgeCapture: false` to prevent recursive finalization.

## Implementation and verification anchors

- `packages/core/src/plan.ts`: defaulting, session-target validation, lifecycle routing, and subplan inheritance.
- `packages/core/src/workflow-guidance.ts` and `packages/core/src/knowledge-sidecar.ts`: opt-out-aware guidance and finalization gates.
- `packages/cli/src/cli.ts`, `packages/dsh-adapter/src/protocol.ts`, and `packages/cindy-adapter/plugin/node/claw-worker.cjs`: public CLI and adapter propagation.
- `packages/cli/test/cli-session-scope.test.ts` and `packages/cli/test/session-daemon.test.ts`: explicit session opt-out, session-storage, lifecycle, and host-action coverage; Core tests cover default and target-validation behavior.

## Search terms

- `knowledgeCapture`
- `--no-knowledge-capture`
- `KNOWLEDGE_CAPTURE_TARGET_REQUIRED`
- `cli-session-scope`
