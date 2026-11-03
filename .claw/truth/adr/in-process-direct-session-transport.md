# ADR: In-process direct session transport

## Context

Adapters run one persistent CLI `session open` child per workspace/agent session and exchange one JSON line per request. The former implementation routed each line through a local session daemon: the CLI read a discovery file with pid, port, token, and protocol version; started a detached daemon under a startup lock when none existed; connected over loopback; and authenticated with the token and protocol version. The daemon then executed commands on a `SessionCommandExecutor`.

That daemon was a single-tenant proxy. Every adapter session already owned its own CLI child, and the daemon shared no business state. Retained context lives in `sessions/<hash>/session.json`, cross-process serialization lives in `sessions/<hash>/execution.queue.json`, and canonical plans belong to Core and project files. The daemon nevertheless turned a local function call into discovery, authentication, TCP, a second process lifetime, a startup wait, an idle TTL with published state, and four independent budgets that could silently consume an outer one. On restricted hosts it also required capabilities the caller did not otherwise need: detached child processes, loopback listening or connecting, and runtime-directory state writes. The resulting failure class - a bare `CLAW_SESSION_OPEN_TIMEOUT` from an open that never reached its owner's own structured failure - is recorded by [transport budgets outlive bounded work](transport-budgets-outlive-bounded-work.md).

The embedding/search daemon (`packages/core/src/embedding-daemon.ts`, `search-daemon.ts`) is a different concept: model-session reuse behind a local socket. This decision does not touch it, and "daemon" in this ADR never means that component.

## Decision

`claw session open` executes in the CLI process: it constructs `SessionRegistryV2` and `SessionCommandExecutor`, opens the retained record, and serves the JSONL command loop from that executor. There is no listener, token, discovery file, startup lock, idle TTL, protocol-version handshake, or daemon process.

- The adapter-facing contract is unchanged. The first stdout line is `session.open` with the session and `telemetry: {transport: "direct", durationMs}`; each command replies `{ok: true, command, ...envelope}` carrying `output`, `hostActions`, `postCommitEffects`, and `knowledgeDispatch`; a failed open or handshake exits non-zero with a structured `{error}` on stderr; `session.status` returns `{session, transport: {mode: "direct", pid, startedAt}}`.
- Retained state is data, not transport. Keep the storage root `.../claw/session-daemon-v2` and `CLAW_SESSION_DAEMON_RUNTIME_DIR`; the retained `session.json` `state` now means only whether the last close was clean, and no pid-liveness test reinterprets it. `execution.queue.json` remains the cross-process serialization authority for command execution, the registry's `command.queue.json` serializes only open/close/touch of the retained record, and both queue holders record a pid so a dead owner can be reclaimed.
- Identity stays `sha256(canonical workdir, agentSessionId)`, the workdir is immutable after open, and retained records expire seven days after the last update.
- Open budgets are ordered inside-out: the open path's file-queue wait is 8000 ms, below the adapter's 15000 ms open budget, below the adapter's 30000 ms single-request budget. Cindy's broker stays at 45000 ms execute and 20000 ms session start.
- Daemon-only error codes (`SESSION_PROTOCOL_UNSUPPORTED`, authentication, protocol-invalid, daemon-unavailable/entry-missing/start-observation, request-timeout/too-large, handle-invalid) are removed. `SESSION_CONNECTION_LOST` and `CLAW_SESSION_TIMEOUT` remain, produced by the adapter from the child process lifecycle.
- npm publishes `@veewo/claw-core` then `@veewo/claw`; `@veewo/claw-client` is removed with the transport it wrapped.

## Alternatives

- Keep the daemon as a shared executor: rejected because every adapter session already owns a CLI child and no product path multiplexes sessions; the claimed sharing was exercised only by a test double attach.
- Rewrite `@veewo/claw-client` as a spawn-based stdio client: rejected because it would add a second transport with zero repository consumers and duplicate the adapters' budget and stderr classification.
- Replace the persistent session with one process per command: rejected because it repeats Node start and focus recovery on every operation; DSH's trusted one-shot fallback already covers a proven pre-send transport failure.
- Rename the storage root and environment variable as part of the transport cleanup: rejected because they identify data, and `CLAW_SESSION_RUNTIME_DIR` already names session-workflow storage; renaming would silently orphan retained focus.
- Introduce pid-liveness or a new attach authority for the retained record: rejected because pid reuse would create a second error authority, and the canonical plan binding already owns focus recovery.

## Consequences

- Restricted hosts need one fewer capability set, and a killed adapter can no longer leave a detached process that keeps committing work invisibly.
- The outcome-unknown window remains: a kill during command execution can commit without a response. Reconcile with `plan show --simple`, never replay.
- Open no longer has a daemon-start tail. The CLI's only bounded wait inside open is the execution queue, and start diagnostics stay with the adapter's own `session open` budget.
- The CLI owns the command loop and retained-record lifetime directly (`packages/cli/src/cli.ts`, `session-command.ts`, `session-registry-v2.ts`); shared contract types live in `packages/core/src/session-contract.ts`, and the trusted one-shot entry (`command-entry.ts`) uses the same executor and queue.
- Verification: session transport regressions cover envelope parity, one-shot and persistent commands sharing one execution queue, an open that fails around eight seconds with `PLAN_WRITE_CONFLICT` under queue contention, `--receipt-only`, and crash reopen from the retained record or bound plan.

<!-- state: history -->
## Decision evolution

<!-- dated: 2026-11-03 -->
### Shared authenticated daemon transport retired

The removed path published a timestamped discovery file, authenticated each connection with a random per-instance token and a protocol version, used a startup lock so concurrent clients found one daemon, and reclaimed an idle daemon after a TTL. Its retained record carried live/disconnected state and connection timestamps. Those mechanisms are recorded here because older release and incident evidence refers to them; they are not a fallback, a compatibility mode, or a supported recovery path. `session.json` survives only as retained context, and the removed state fields no longer grant or deny access.

## Related code

- `packages/cli/src/cli.ts`
- `packages/cli/src/session-command.ts`
- `packages/cli/src/session-registry-v2.ts`
- `packages/cli/src/command-entry.ts`
- `packages/core/src/session-contract.ts`
- `packages/core/src/io.ts`

## Search terms

`in-process direct session`, `session open`, `direct transport`, `SessionRegistryV2`, `SessionCommandExecutor`, `execution.queue.json`, `retained session`, `SESSION_OPEN_QUEUE_TIMEOUT_MS`
