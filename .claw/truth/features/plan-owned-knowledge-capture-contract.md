# Plan-owned knowledge capture contract

<!-- state: current -->
## Current behavior

- New public plan creation has one project workflow. Core resolves the existing ancestor project or initializes missing local claw structure/default configuration at the workspace; existing configuration and personal overrides are preserved.
- Public `scope` / `--scope` is removed. DSH/Cindy expose `knowledge_capture`; canonical requests and plans use `knowledgeCapture`. CLI accepts `--knowledge-capture true|false` and the false alias `--no-knowledge-capture`. Explicit input overrides ordinary template defaults; the remaining default is true.
- Persisted `PlanDocument.knowledgeCapture` decides whether this plan accumulates knowledge. False does not select another store, add a session TTL, suppress normal retrospective requirements, or disable single-focus/Goal behavior. Subplans inherit the parent policy.
- Finalizer auxiliary plans are non-capturing, but still perform the source job’s Truth/ADR work. The knowledge-result lifecycle cannot enable recursive capture. Canonical actor/job/delegate binding—not template labels or a session-storage requirement—owns claim and safe closeout.
- Each public root gets a fresh task container; identical display titles do not overwrite another actor’s plan. Session identity remains host-owned and binds the current focus. Parent end.leave remains temporary descent/resume behavior.
- Old session-stored plans, bindings and frozen receipts remain readable in place. Their internal scope is recovery metadata, not a public creation choice. Existing legacy retention behavior is not transferred to new capture:false plans.
- Maintenance derives protected task paths from existing focus ownership and unfinished job/execution records. Archive, pruning and inactive-task deletion retain source/delegate evidence until focus reconciliation and finalizer release settle; unrelated tasks remain eligible. No separate pin registry or agent step is introduced.
- Removed scope, invalid capture values and current-focus conflicts are rejected before bootstrap writes. Initialization failures carry phase/effect evidence; accepted or unknown mutations are not replayed.

## Implementation and verification anchors

- [Creation owner](../../../packages/core/src/plan.ts), [initialization owner](../../../packages/core/src/init.ts), and [configuration view](../../../packages/core/src/context.ts).
- [Knowledge owner](../../../packages/core/src/knowledge-sidecar.ts) and [shared application](../../../packages/cli/src/command-service.ts).
- [Bootstrap tests](../../../packages/core/test/project-bootstrap.test.ts), [creation tests](../../../packages/core/test/project-create.test.ts), and [delegate closeout tests](../../../packages/cli/test/knowledge-delegate-close.test.ts).

<!-- state: history -->
## Evolution history

<!-- dated: 2026-10-08 -->
### Replace the two public controls with capture intent

The earlier contract retained public scope as a separate storage/lifecycle choice and exposed only negative CLI capture opt-out. Session creation therefore required an explicit false value, while project+false guidance incorrectly waived retrospective text that the owner still required. The unified contract removes that choice, adds an explicit boolean CLI form, and preserves old stored state without migrating or resending it. No-capture is not a request to shorten data retention.
