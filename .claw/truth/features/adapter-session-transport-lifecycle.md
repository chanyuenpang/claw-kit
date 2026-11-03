# Adapter-owned CLI session transport lifecycle

<!-- state: current -->
## Current behavior

DSH and Cindy may retain one CLI `session open` transport per workspace/session while a host thread uses claw operations. That transport is now the CLI child itself: it executes commands in-process through `SessionRegistryV2` and `SessionCommandExecutor`, with no shared daemon or proxy process behind it. Transport lifetime is distinct from retained session identity, canonical plan, and the independent knowledge-finalizer job. Soft-closing a transport does not delete the retained session or plan; the persistence contract belongs to [task layout and session bindings](task-layout-and-session-bindings.md). The budget for opening a transport, and the diagnostics its failure must carry, belong to [CLI session-open budgets and transport failure diagnostics](adapter-session-open-budget-and-diagnostics.md).

- The DSH adapter keys cached `ClawSession` transports by resolved workspace plus agent ID. On a successful `plan.done`, it releases only its own transport after host effects and knowledge dispatch, provided no later request started and none remains queued. A continuously idle transport is reclaimed after ten minutes without queued or running CLI requests. A newer request wins over an older completion callback. Plugin disposal and unexpected child exit also retire the corresponding cache entry. See `packages/dsh-adapter/src/index.ts` and `src/claw-session.ts`.
- DSH close is idempotent and ordered behind prior requests: it sends `session close`, waits up to two seconds for graceful child exit, then terminates and waits for only its owned subprocess handle if necessary. Native `SubprocessHandle.terminate()` is synchronous and returns `void`; cleanup must not `await` it or assume a promise, and best-effort termination catches synchronous cleanup failures without replacing the primary transport/operation error. Graceful exit waiting is a separate operation. Timeout, broken stdin, or abnormal exit invalidates the transport. An uncertain mutation outcome is not replayed; reconnect first reconciles canonical state. Windows DSH subprocess-local uses a separate Job runner per target CLI process, so a cached session commonly appears as a runner/CLI pair, not an extra proxy process per session.
- The Cindy Ghost worker separately caches CLI session children by workspace/session and applies completion release, ten-minute quiescent eviction, generation protection, and unexpected-exit removal. Its `claw/session-transports` read-only status and worker events include child PID and close reason; `packages/cindy-adapter/plugin/node/claw-worker.cjs` owns this path. Cindy's Orca knowledge-finalizer worker has its own host lifecycle and must not be stopped by CLI transport reclamation.
- DSH exposes a loopback-only, read-only `/claw-session-lifecycle` snapshot with workspace, session ID, state (`active`, `idle`, `reclaiming`, `dead`), queue size, request count, last activity, and close reason. `packages/dsh-adapter/scripts/session-process-snapshot.ps1` can correlate OS PID, creation time, ancestry, and working set; a PID absent from an adapter map is not thereby proven orphaned.
- Codex, OpenCode, the standard hostless flow, and OpenClaw already invoke short one-shot CLI processes rather than retaining one session owner. They are unaffected by the direct-session transport change: a persistent DSH/Cindy session is still a single CLI child. Do not apply DSH/Cindy reclamation to their independent finalizers or unrelated Node processes.

## Operational boundaries and verification

A source build does not update an already-running DSH Web installation or installed Cindy plugin. For existing transports, capture read-only PID/start-time/ancestry and workspace/session evidence, check active work and other host instances, finish work, then obtain explicit user consent before a managed host restart after installing the adapter. Resample afterward; never blanket-kill Node or infer ongoing CPU pressure from process counts or working set alone. `docs/dsh-session-lifecycle-investigation-20260928.md` contains the reproducible probe, historical measurements, cleanup procedure, and test outcomes; `packages/dsh-adapter/scripts/session-lifecycle-probe.mjs` measures a real isolated runner/CLI lifecycle without restarting the shared host process.

<!-- state: history -->
## Evolution history

<!-- dated: 2026-09-28 -->
### Unbounded DSH cache and bounded replacement

The earlier DSH adapter kept its per-session `ClawSession` indefinitely, including after `plan.done`; its old close sent text without waiting for exit. A read-only Windows snapshot found 56 runner/CLI pairs and one shared daemon among 125 Node processes, with paired working sets totaling about 7394 MiB at that instant. The isolated real-runner probe recorded zero pairs initially, two pairs after opening two sessions, one after closing one, and zero after closing both; the running Web GUI was not restarted, so the snapshot is not a before/after measurement of that installed GUI. This checkpoint explains the regression and its measurement boundary rather than asserting a current process census.

<!-- dated: 2026-11-03 -->
### Shared daemon behind persistent sessions retired

Earlier wording described the persistent session as a client of one shared, authenticated CLI daemon. `claw session open` now performs the retained-session and command work in its own process, so there is no daemon to discover, authenticate against, or restart. The adapter-owned reclamation rules - completion release, ten-minute idle eviction, generation guard, unexpected-exit removal - were unchanged by that removal.
