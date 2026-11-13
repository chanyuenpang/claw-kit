# DSH adapter-owned role delegation

<!-- state: current -->
## Current source behavior

The DSH adapter owns execution mechanics; shared role skills own the meaning of the investigation/design and allowed output. Source implementation is not proof of current-profile installation. Distribution remains owned by [shared-source Truth](<shared-planning-skill-source.md>).

## Semantic entry

- Main callers submit delegate.start with role, brief and optional output, then obtain delegate.result for its assignment. Workers submit delegate.complete using the assigned result contract.
- Host call ID, actual actor and canonical workspace determine identity. Model arguments cannot select a backend/member/provider or forge parent/session/workdir.
- Researcher remains reply-only with a read-only source contract and directly inherits the caller's model/reasoning capability when the Host can pass it; it does not independently optimize a model. Architecture receives one validated report path only when an active workflow exists; without one it returns an inline design. Architect high-capability/high and finalizer low-cost preferences are best-effort intents, never exact model/effort admission gates.
- Member lookup, carrier choice, per-role FIFO, waits, recovery and report registration are adapter responsibilities. Fresh assignments re-read current evidence; retained context is not a cached answer.
- DSH 0.2.2-rc.2 removed teammate creation, messaging and the member roster from `agentTeams`, which now owns shared task boards only. Every role runs on the `subagents` family with a flat activation request (`parent`, `prompt`, `agentOptions`, `childId`, `name` at top level) plus required `delivery` and `signal`. The adapter passes `delivery: "caller"` so the result stays adapter-owned. Continuable role reuse requires a catalog row with the exact durable id, label and `mode: "continuable"`; `mode: "one-shot"` is not reusable.

## Boundaries

Role exposure through model-facing tools is not an admission proof. Actual Host `subagents` business calls own authorization and argument validation; exact tool schemas, provider catalogs, wait/taskboard closure and model metadata are not shadow permission gates. rc.2 `agentTeams` boards stay optional and are not a role carrier.

Per-invocation receipts are stored in the host user's .claw/runtime/adapters/dsh/delegation namespace, partitioned by real workspace and opaque parent. They are not role roster or claw plan records. DSH owns child/transport facts. Unknown sends are not replayed or moved across routes; inactive is not success. Delivery acquires the current business method before the durable attempted marker and then performs one send without another capability/catalog/model check. Existing role compatibility ignores description/display drift and unrelated diagnostics; exact child id/label/mode and output boundary remain authoritative. Native catalog reads get at most one immediate read-only retry; target diagnostic or persistent ambiguity still blocks. Receipts admitted on the removed Team carrier are rejected rather than silently re-identified.

Architecture report completion verifies the assigned actor and exact realpath boundary. The adapter registers references only against the captured current parent plan, using the CLI's internal expectedPlanPath guard. Focus changes defer registration without altering another plan. Only returned registration evidence permits a success claim.

## Automatic knowledge finalizer

The main model never starts or retries a writer. New DSH finalizers use the native `subagents` family, dispatched through the same flat `delivery: "caller"` activation as foreground roles. A small Core intent contract defines architect/researcher/finalizer preference meaning, while DSH alone resolves a supported launch recipe and records requested/applied/resolved-or-unknown metadata. Exact preferences may degrade without blocking, but permission/capture/claim failures may not. The adapter uses the [canonical capture boundary](<dsh-knowledge-dispatch-and-finalization.md#current-capture-and-operational-constraints>), chooses the compatible backend, reserves exact execution and reuses a role when supported. Core remains the sole canonical job/claim/material/terminal owner. Each job gets its own full-ID delegate plan and immutable claim receipt; joint job/delegate completion drives the next job even without another parent turn. Core persists `releasedAt` after verified release so later delegate-file cleanup cannot block an already-released role. The adapter only closes the matching finished delegate, never an unrelated or newer plan. Old one-shot work retains its original execution evidence.

## Evidence and limits

See [implementation and verification guide](<../../../docs/dsh-delegation.md>) and [ownership ADR](<../adr/dsh-delegation-contract-ownership.md>). Tests cover the actual adapter entry with controlled services, assembled skill layout, identity/capture/receipt isolation, queue wakeup, guarded references and process-safe private storage. They do not constitute live profile toggle/HMR, every-provider or cross-OS verification. Role output instructions do not create a new filesystem sandbox.

<!-- state: history -->
## Evolution

<!-- dated: 2026-11-13 -->
### DSH 0.2.2-rc.2 removes the Team member carrier

`agentTeams` became a task-board-only service, so the adapter's Team spawn/roster/message branch was deleted and all roles route through `subagents`. Activation switched from a nested `request` to the flattened request with explicit `delivery`/`signal`. Reproduced against the published rc.2 SDK packages; the previously published `0.2.72-rc.2` adapter still carried the rc.1 assumptions.

<!-- dated: 2026-10-02 -->
### Semantic façade and role reuse

DSH backend mechanics move out of the role prompt. Core business ownership, full multi-host skill packages and per-job isolation remain unchanged.

<!-- dated: 2026-10-01 -->
### Distinguish native handles and Team membership

The previous role mapping corrected background job, continuable child and Team distinctions. That remains historical interface context, not a reason to make current DSH agents orchestrate those handles themselves.
