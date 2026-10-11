# ADR: Prefer direct writes for low-frequency focus state

## Status

Accepted

## Context

Core focus commits and roll-forward, together with CLI `SessionRegistryV2`, persist low-frequency local plan/session state. Temporary-file replacement adds rename operations to these ordinary synchronization paths. The completed implementation work exercised plan creation, task completion, root completion, focus release/recovery, and a replacement-denied case; it also confirmed that serialization errors preserve existing destination content and a real write denial remains a single structured failure. No measured failure rate was available, and the historical finalizer incident did not establish its exact rename target.

## Decision

Use direct JSON writes for Core focus commit/roll-forward state and CLI `SessionRegistryV2`; serialize fully before opening or truncating the destination. Preserve existing serialization queues, identity checks, before/after hashes, focus journal recovery, and unknown-outcome no-replay behavior. Do not add retries, preflight checks, or fallback branches for these writes.

This is a bounded tradeoff: lower operational interruption cost for ordinary low-frequency focus/session synchronization is preferred over theoretical crash safety. A process or disk failure during a direct write can leave partial JSON requiring manual recovery; hash-based recovery does not repair arbitrary truncation. This decision does not establish that historical finalizer EPERM incidents share this cause, and does not change knowledge claim/delivery receipt persistence or the global atomic-write helper.

## Consequences

- Focus create/end/session synchronization avoids rename-specific failure points while retaining existing concurrency and reconciliation contracts.
- Callers must not describe direct writes as crash-atomic or claim arbitrary truncated JSON is automatically recoverable.
- Future changes to receipt persistence or broader atomic-write behavior require separate evidence and a separate decision.

## Implementation anchors

- `packages/core/src/focus-transitions.ts`
- `packages/core/src/io.ts`
- `packages/cli/src/session-registry-v2.ts`
- [Task layout and session bindings](../features/task-layout-and-session-bindings.md#low-frequency-focus-persistence)
