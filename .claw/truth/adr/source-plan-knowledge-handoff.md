# ADR: Source-plan knowledge handoff for DSH, Codex, and Cindy

## Context

The former finalizer lifecycle created a claimable knowledge job and asked the writer to claim it, preserve a token, complete authenticated terminal registration, and potentially recover through receipt queries. Those steps were separate from the actual knowledge work. The completed source-plan route instead dispatches the originating session key and complete plan path, then uses normal claw workflow plans and subplans.

Current implementation evidence:

- `packages/cli/src/command-service.ts` routes DSH/Codex/Cindy terminal transitions through `buildSourceKnowledgeDispatch` when capture is enabled (lines 1000-1006).
- `packages/cli/src/knowledge-dispatch.ts` emits schemaVersion 2 with session key, source plan, and ordinary non-capturing plan/subplan instructions (lines 8-30).
- `packages/cli/src/knowledge-materials.ts` reads the complete source plan, produces writer templates, and collects host conversation where host owns collection (lines 13-81).
- `packages/dsh-adapter/src/index.ts` supplies DSH session history for `knowledge.materials` and preserves unavailable-history diagnostics (lines 489-501).

The completed project task record reports implementation and targeted verification, while explicitly distinguishing source changes/tests from installed artifacts and live-host testing. No installation, publication, or production finalizer E2E was claimed.

## Decision

For new DSH, Codex, and Cindy finalizer handoffs, dispatch originating session key, complete source-plan path, and project context to the host worker. The worker obtains the complete plan and available ordinary conversation through knowledge.materials, then completes work through an auxiliary non-capturing plan and its governance subplan. Normal plan/subplan terminal transitions are the workflow completion boundary; this new path does not create or require a claim job, claim token, authenticated receipt, or separate knowledge.done registration.

Retain plan and subplan as the agent's work-organization mechanism. The adapter supplies the worker's own session; the originating key is only the material-read target. Keep conversation extraction and its errors with the native host adapter.

This decision is scoped to the new source-plan route for DSH/Codex/Cindy. Explicit legacy job APIs are not automatically migrated or replayed; OpenCode's existing job-based route is outside this change. This decision does not assert any installed plugin has loaded the source revision.

## Alternatives

- Keep model-driven claim/token/receipt/done after the work: rejected because this adds a second completion protocol without advancing knowledge changes.
- Remove plans/subplans for unstructured direct edits: rejected because plans/subplans organize complex deposition.
- Make conversation completeness a hard gate: rejected because host history is best-effort; distinguish unavailable/error from incomplete-but-available evidence.
- Migrate or retry old unknown jobs: rejected because their outcomes cannot safely be inferred; retain without replay.

## Consequences

- Host adapters own source-plan dispatch and native material access; the writer performs evidence-based Truth/ADR stewardship in ordinary claw workflow.
- Handoff does not prove that knowledge edits occurred. The ordinary plan outcome reports changes, justified no-edit, or unfinished work.
- Claim/done/receipt safety rules remain relevant only to compatibility jobs and routes that still use them, not as prerequisites for the new source route.
- Verify source handoff, material boundaries, ordinary plan/subplan completion, and host error fidelity. Source tests do not prove live installed-host E2E.
