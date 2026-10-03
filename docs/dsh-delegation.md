# DSH adapter-owned delegation

This describes the current source implementation, not proof that a running DSH profile has loaded it. Use matching CLI/Core and DSH artifact builds; no host restart or platform installation is implied by a passing source test.

## Caller contract

All operations use the native claw_run tool through the current SDK carrier. The model does not supply a session, workspace, backend, member or provider.

| Operation | Semantic arguments | Result |
|---|---|---|
| delegate.start | role: researcher or feature-architect; brief; optional output: auto/reply/report | assignment_id and state |
| delegate.result | assignment_id; optional bounded wait_ms | pending/running/unknown/completed/failed, result and report registration evidence |
| delegate.complete | assigned worker's assignment_id; status completed/failed; result/error; document_path only when granted | immutable result acknowledgement |

Researcher is reply-only and has a read-only role contract. Architecture auto mode produces exactly one granted Markdown report only when activeWorkflow exists; otherwise it returns an inline design. Role instructions are not a new filesystem sandbox. The adapter validates completion identity and report realpath boundaries and rejects caller-supplied execution identity.

The adapter derives report paths, chooses Team/native, locates the correct role, waits and recovers receipts. A new host invocation is a new assignment, not permission to reuse an earlier answer. Registered reports use an internal expectedPlanPath precondition; parent focus changes defer registration rather than modifying another plan or switching focus.

## Runtime ownership

- DSH owns members, continuations, mailbox acceptance and live actor identity.
- The adapter owns role dispatch, FIFO admission, delivery/recovery and report registration.
- Core owns canonical plans, knowledge jobs, claims, frozen materials and terminal results.
- Shared role skills own the semantic work and permitted output, not backend choreography.

Team selection uses the exact Agent's exposed Team surface only as a route hint. The Host's actual `agentTeams` or `subagents` business method owns authorization and argument validation; exact tool schemas, task/wait helpers, provider catalogs, descriptions and projections are not shadow permission gates. Team remains optional. Exact Lead/member identity and scoped Host rejection remain authoritative.

Execution carrier and model preference are separate. Foreground architecture may use Team; researcher inherits the caller; new background finalizers use the native subagent family. Architect high-capability/high and finalizer low-cost model/effort values are best-effort preferences. Missing or malformed advisory metadata selects a callable default carrier and records unknown rather than blocking. The adapter does not read private Team configuration, infer capability or price from a model name, or weaken Host permissions. Service handles are replaceable views; current methods are acquired immediately before the durable attempted marker. After attempted, the adapter performs exactly one real send with no intervening capability/catalog/model preflight. A missing acknowledgement remains outcome-unknown and cannot trigger a different model, backend or resend.

## Foreground receipts

Operational invocation receipts live under the host user's .claw/runtime/adapters/dsh/delegation directory, partitioned by the real workspace and opaque parent session. They are not a role roster, a second claw plan, or knowledge jobs. They survive package replacement without adding unsupported events to the DSH session log. The current host rejects unregistered required Session events, so no custom chat event is written.

Receipts use immutable owner envelopes, private atomic replacement and a bounded cross-process lock. The adapter does not steal a live lock by age. SDK calls and report registration happen outside the receipt transaction. Unknown delivery remains pinned and is never automatically resubmitted or moved to another backend. Normal completion advances the next queued assignment for that role; inactive is not a completion receipt.

Compatibility deliberately excludes soft observations. Long-lived foreground role identity uses parent/workspace/role/carrier, not model preference or Team description. A unique teammate with the expected role name and exact membership remains reusable when description, provider/context display fields, diagnostics or caller model change; the receipt records `reuse-existing/unknown` instead of claiming new options were applied. Spawn projections missing raw id recover from one authoritative roster reread. Native catalogs similarly ignore unrelated diagnostic rows and tolerate one read failure; target-id corruption, duplicate targets and exact actor/membership failures remain hard errors.

## Automatic finalizer

Finalizers are never dispatched by the main model. At a parent terminal transition the adapter freezes only proven parent finals in the canonical half-open capture window. Empty proven captures remain valid; unreadable or unbounded material is not fabricated as empty.

A reusable native writer gets one role identity per actually submitted options recipe (caller observations and unfulfilled preferences are excluded) but a full, distinct finalization ID, delegate plan, claim and material set for every job. Core reserves the exact member and permits only one delivery attempt. Positive durable receipt evidence can repair a lost acknowledgement; an unknown outcome cannot justify a second send. Legacy one-shot jobs keep their original evidence and native fallback.

A later job waits for both the previous job and its delegate to end. The durable releasedAt proof prevents later delegate-file retention from blocking an already-verified release. The adapter completes matching final bookkeeping when safe and wakes the parent queue without requiring another parent turn. It never closes an unrelated or newer delegate.

The reusable protocol requires a matching CLI/Core dispatch contract with full per-job delegate identity. Unsupported older contracts fail explicitly rather than sharing truncated plan names in one reused session.

## Verification and limits

Focused coverage includes actual adapter entry wiring, an assembled-plugin semantic entry, A/B same-member execution without a new parent turn, late A isolation from B, exact claim ownership, capture windows, unknown receipt/no-resend, native continuation/one-shot behavior, report focus guards, and private-store process contention/crash recovery.

These tests use controlled Host services and temporary projects. They do not prove current-profile activation, every provider, destructive toggle/HMR behavior, or every operating system. No live profile toggle or runtime file surgery is a substitute for those checks.
