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

The adapter derives report paths, selects the subagents carrier, locates the correct role, waits and recovers receipts. A new host invocation is a new assignment, not permission to reuse an earlier answer. Registered reports use an internal expectedPlanPath precondition; parent focus changes defer registration rather than modifying another plan or switching focus.

## Runtime ownership

- DSH owns members, continuations, mailbox acceptance and live actor identity.
- The adapter owns role dispatch, FIFO admission, delivery/recovery and report registration.
- Core owns canonical plans and ordinary plan results; legacy job APIs are isolated compatibility paths.
- Shared role skills own the semantic work and permitted output, not backend choreography.

DSH 0.2.2-rc.2 removed teammate creation, messaging and the member roster from `agentTeams`; that service now owns shared task boards only (`isEnabled`, `setEnabled`, `createTask`, `getTask`, `listTasks`, `updateTask`). Every role therefore runs on the `subagents` family: `startActivation` admits a child, `sendMessage(sender, targetId, content, { signal })` delivers follow-up work, and `listChildren` supplies the durable catalog. Exact Lead/child identity and scoped Host rejection remain authoritative. Activation carries a flat request with an explicit `delivery`; the adapter uses `caller` so results stay adapter-owned instead of notifying the parent model.

Execution carrier and model preference are separate. Researcher inherits the caller; foreground architecture and new background finalizers use the same `subagents` family (continuable when the provider supports `prepareContinuable`, otherwise one-shot). Architect high-capability/high and finalizer low-cost model/effort values are best-effort preferences. Missing or malformed advisory metadata selects a callable default carrier and records unknown rather than blocking. The adapter does not read private Team task boards, infer capability or price from a model name, or weaken Host permissions. Service handles are replaceable views; current methods are acquired immediately before the durable attempted marker. After attempted, the adapter performs exactly one real send with no intervening capability/catalog/model preflight. A missing acknowledgement remains outcome-unknown and cannot trigger a different model, backend or resend.

## Foreground receipts

Operational invocation receipts live under the host user's .claw/runtime/adapters/dsh/delegation directory, partitioned by the real workspace and opaque parent session. They are not a role roster, a second claw plan, or knowledge jobs. They survive package replacement without adding unsupported events to the DSH session log. The current host rejects unregistered required Session events, so no custom chat event is written.

Receipts use immutable owner envelopes, private atomic replacement and a bounded cross-process lock. The adapter does not steal a live lock by age. SDK calls and report registration happen outside the receipt transaction. Unknown delivery remains pinned and is never automatically resubmitted or moved to another backend. Normal completion advances the next queued assignment for that role; inactive is not a completion receipt.

Compatibility deliberately excludes soft observations. Long-lived foreground role identity uses parent/workspace/role/carrier, not model preference or display labels. A unique continuable child with the expected catalog id, label and `mode: "continuable"` remains reusable when provider display fields, diagnostics or caller model change; the receipt records `reuse-existing/unknown` instead of claiming new options were applied. Native catalogs ignore unrelated diagnostic rows and tolerate one read failure; target-id corruption, duplicate targets and exact identity failures remain hard errors. Receipts admitted on the removed Team carrier are not resumed through a rewritten identity.

## Automatic finalizer

The adapter launches one native worker per source-plan handoff. It retains only dispatch-delivery deduplication, not a claimable job, reusable writer lease, capture admission, or dual-terminal queue. The worker reads the complete source plan and bounded ordinary conversation through `knowledge.materials`, then owns an ordinary non-capturing plan and knowledge subplan. Their actual results and document edits are the completion evidence. Old jobs are not automatically scanned or changed. See [source-plan finalization](<finalizer-execution.md>).

## Verification and limits

Foreground delegation retains its role/reuse, report-focus and receipt coverage. Finalizer checks cover actual tool wiring, ordinary conversation boundaries, launch-only deduplication, no resend after unknown admission, and material failures that preserve source evidence without blocking dispatch.

These tests use controlled Host services and temporary projects. They do not prove current-profile activation, every provider, destructive toggle/HMR behavior, or every operating system. No live profile toggle or runtime file surgery is a substitute for those checks.
