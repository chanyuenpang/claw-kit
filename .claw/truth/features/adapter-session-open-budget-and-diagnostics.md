# CLI session-open budgets and transport failure diagnostics

<!-- state: current -->
## Current behavior

An adapter that owns a persistent CLI transport also owns the budget for opening it. That budget must outlive the CLI's own startup path - Node start, the open path's file-queue wait, and `session.open` - otherwise the outer timer fires first, kills a CLI that was still starting, and reports a bare timeout instead of the CLI's own structured cause. Layered budgets are therefore ordered inside-out: the innermost owner fails first, and its structured error is the one that must surface. The durable decision is recorded in [Transport budgets outlive the work they bound](../adr/transport-budgets-outlive-bounded-work.md). `claw session open` runs in the CLI process, so there is no daemon-start wait, discovery file, or protocol handshake ([in-process direct session transport](../adr/in-process-direct-session-transport.md)).

- The Cindy Ghost worker opens a transport with a 15000 ms default and accepts `CLAW_CINDY_SESSION_OPEN_TIMEOUT_MS` when it parses as a safe integer of at least 1000; the DSH adapter opens with the same 15000 ms. See `packages/cindy-adapter/plugin/node/claw-worker.cjs` and `packages/dsh-adapter/src/claw-session.ts`.
- A Cindy open timeout rejects the pending open before the close handler can race it, records a `session-transport-timeout` trace event, and then kills the child. The failure is `CLAW_SESSION_OPEN_TIMEOUT` with phase `transport`, operation `session.open`, elapsed and limit milliseconds, child pid, launch shape, a `SESSION_OPEN_BUDGET` diagnostic, and a bounded `SESSION_OPEN_STDERR` tail when the CLI wrote anything.
- An early child exit during the handshake preserves a structured failure the CLI already wrote to stderr - for example `PLAN_WRITE_CONFLICT` with its queue path and limit when the open could not acquire the execution queue - instead of collapsing it into `SESSION_CONNECTION_LOST`. Only a real JSON error envelope is adopted; warning lines written before it are ignored.
- The Cindy broker's RPC timeouts outlive the worker's own budgets: 45000 ms for `claw/execute` and 20000 ms for session start, so the worker's structured failure reaches the model instead of a generic broker timeout. See `packages/cindy-adapter/plugin/main.js`.
- The persistent session's open waits at most 8000 ms (`SESSION_OPEN_QUEUE_TIMEOUT_MS`) to acquire `sessions/<hash>/execution.queue.json`, the same cross-process queue used by one-shot commands. A timeout fails with the core owner's `PLAN_WRITE_CONFLICT`, written to stderr with a non-zero exit and no `session.open` line, so it surfaces before the adapter's 15000 ms budget. Command execution keeps the 30000 ms queue budget.
- Diagnostics stay fail-open: being unable to append the worker trace file never blocks startup or fails the resident worker.

## Operational boundaries and verification

- Ordering to preserve when changing a budget: open-path queue wait (8000 ms) < adapter transport open (15000 ms) < adapter single request (30000 ms) < broker execute (45000 ms). Each enclosing budget is above the single budget it bounds, but the execute limit equals the stacked worst case of one open plus one command, so a call that exhausts both still surfaces as a broker timeout rather than the worker's own failure. Raising an inner budget without its outer one re-introduces the masked failure.
- Worker regressions: a fixture that delays the handshake past the old 5 s budget still succeeds; a fixture that never starts the handshake reports budget/pid/launch/stderr diagnostics; a fixture that exits with a structured stderr envelope keeps that code. See `packages/cindy-adapter/test/claw-worker.test.mjs`; these three tests are Windows-only because their fixture wraps the CLI in `claw.cmd`.
- Session transport regressions: an open that cannot acquire the execution queue fails around eight seconds with `PLAN_WRITE_CONFLICT` and emits no `session.open` line; one-shot and persistent commands serialize on the same queue; `session status` reports the direct transport. See `packages/cli/test/session-transport.test.ts`.
- The 2026-11-03 source work ran those suites locally and confirmed the daemon-start budget no longer exists. It does not confirm behavior on an installed Cindy host or a published plugin/CLI pair, and unrelated pre-existing suite failures remained.

<!-- state: history -->
## Evolution history

<!-- dated: 2026-11-03 -->
### Hard 5 s open budget masked the CLI's own startup path

The Cindy worker bounded the whole `claw session open` transport at a hard 5 s, shorter than Node start plus the client's 5 s daemon wait plus `session.open`. A probe whose CLI delayed the handshake by 6 s returned the bare `CLAW_SESSION_OPEN_TIMEOUT` at 5179 ms and killed a CLI that was still starting, exactly when it would have reported its own cause. The same change removed a collapse of structured CLI stderr into `SESSION_CONNECTION_LOST` and a client that observed a crashed daemon only after its whole startup budget; it also added the worker diagnostics, the broker budgets that outlive them, and daemon stderr capture. Review notes: `docs/reviews/2026-11-03-cindy-open-timeout.md`.

<!-- dated: 2026-11-03 -->
### Direct session retired the daemon-start budget and its diagnostics

`claw session open` became in-process direct execution, so the client's 5000 ms daemon-start budget, the detached daemon stderr log, and the `SESSION_DAEMON_START_OBSERVATION` / `SESSION_DAEMON_UNAVAILABLE` failure path no longer exist. The bounded wait that remains inside open is the 8000 ms execution-queue wait, whose `PLAN_WRITE_CONFLICT` arrives before the adapter's open budget. The adapter-side budgets and the broker limits recorded above are unchanged.
