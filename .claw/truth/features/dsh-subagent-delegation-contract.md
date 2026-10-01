# DSH adapter-owned role delegation

<!-- state: current -->
## Current source behavior

The DSH adapter owns execution mechanics; shared role skills own the meaning of the investigation/design and allowed output. Source implementation is not proof of current-profile installation. Distribution remains owned by [shared-source Truth](<shared-planning-skill-source.md>).

## Semantic entry

- Main callers submit delegate.start with role, brief and optional output, then obtain delegate.result for its assignment. Workers submit delegate.complete using the assigned result contract.
- Host call ID, actual actor and canonical workspace determine identity. Model arguments cannot select a backend/member/provider or forge parent/session/workdir.
- Researcher remains reply-only with a read-only source contract. Architecture receives one validated report path only when an active workflow exists; without one it returns an inline design.
- Member lookup, Team/native choice, per-role FIFO, waits, recovery and report registration are adapter responsibilities. Fresh assignments re-read current evidence; retained context is not a cached answer.

## Boundaries

Exact-Agent Team exposure is only the enablement signal. Actual business calls check their own service/provider/identity needs; no model-side wait/taskboard choreography is required. Team stays optional and host authorization is not bypassed.

Per-invocation receipts are stored in the host user's .claw/runtime/adapters/dsh/delegation namespace, partitioned by real workspace and opaque parent. They are not role roster or claw plan records. DSH owns member/transport facts. Unknown sends are not replayed or moved across routes; inactive is not success.

Architecture report completion verifies the assigned actor and exact realpath boundary. The adapter registers references only against the captured current parent plan, using the CLI's internal expectedPlanPath guard. Focus changes defer registration without altering another plan. Only returned registration evidence permits a success claim.

## Automatic knowledge finalizer

The main model never starts or retries a writer. The adapter uses the [canonical capture boundary](<dsh-knowledge-dispatch-and-finalization.md#current-capture-and-operational-constraints>), chooses the compatible backend, reserves exact execution and reuses a role when supported. Core remains the sole canonical job/claim/material/terminal owner. Each job gets its own full-ID delegate plan and immutable claim receipt; joint job/delegate completion drives the next job even without another parent turn. Core persists `releasedAt` after verified release so later delegate-file cleanup cannot block an already-released role. The adapter only closes the matching finished delegate, never an unrelated or newer plan. Old one-shot work retains its original execution evidence.

## Evidence and limits

See [implementation and verification guide](<../../../docs/dsh-delegation.md>) and [ownership ADR](<../adr/dsh-delegation-contract-ownership.md>). Tests cover the actual adapter entry with controlled services, assembled skill layout, identity/capture/receipt isolation, queue wakeup, guarded references and process-safe private storage. They do not constitute live profile toggle/HMR, every-provider or cross-OS verification. Role output instructions do not create a new filesystem sandbox.

<!-- state: history -->
## Evolution

<!-- dated: 2026-10-02 -->
### Semantic façade and role reuse

DSH backend mechanics move out of the role prompt. Core business ownership, full multi-host skill packages and per-job isolation remain unchanged.

<!-- dated: 2026-10-01 -->
### Distinguish native handles and Team membership

The previous role mapping corrected background job, continuable child and Team distinctions. That remains historical interface context, not a reason to make current DSH agents orchestrate those handles themselves.
