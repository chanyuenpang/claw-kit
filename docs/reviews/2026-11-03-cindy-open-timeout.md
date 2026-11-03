# Cindy session open timeout follow-up

A Cindy session reported `CLAW_SESSION_OPEN_TIMEOUT` on `plan.create` and
`plan.show` with no elapsed time, process or cause, and the same failure
repeated on the next call. The adapter, not the plan, was the failure point.

## Findings

The Cindy worker bounded the whole `claw session open` transport at a hard 5s
(`packages/cindy-adapter/plugin/node/claw-worker.cjs`). That budget is smaller
than the CLI's own worst-case startup path: Node cold start plus the client's 5s
daemon-start wait plus `session.open` work. A local probe with a CLI that
delayed the handshake by 6s returned the bare timeout at 5179ms while the CLI
was still starting; the killing happened at the exact moment the CLI would have
reported its own structured error. Warm local opens take ~0.45-0.7s, so the
failure needs only a slow cold start or a daemon that never publishes state.
The DSH adapter already uses 15s, and release scripts use 10s.

The worker also discarded the CLI's stderr envelope on early exit (collapsed to
`SESSION_CONNECTION_LOST`), and the client ignored the detached daemon's stderr
and observed a crashed daemon only after its full startup budget.

## Changes

- Cindy worker open budget: 15s default, `CLAW_CINDY_SESSION_OPEN_TIMEOUT_MS`
  override. On timeout the failure carries elapsed time, limit, pid, launch
  shape, the stderr tail and a `session-transport-timeout` trace event.
- A CLI handshake rejection's structured stderr error (for example
  `SESSION_DAEMON_UNAVAILABLE`) is preserved with its own code, message and
  diagnostics instead of a generic connection loss.
- Broker timeouts now outlive the worker budgets (45s execute, 20s
  session-start) so the worker's structured failure is what reaches the model.
- The client writes detached daemon stderr to `<runtimeRoot>/daemon/stderr.log`,
  observes an early daemon exit immediately and reports
  `SESSION_DAEMON_UNAVAILABLE` with its exit code and stderr diagnostics.

## Verification

- New worker tests: 6s cold start succeeds, timeout diagnostics include
  budget/pid/launch/stderr, and the CLI's structured stderr code is preserved.
- New client test: a crashed daemon reports its exit cause and stderr without
  waiting out the startup budget.
- Cindy worker suite and client suite pass. Pre-existing unrelated failures
  remain in `cindy-skill-surface` (asserts removed skill text) and four CLI
  tests that still expect the old claim/receipt dispatch template.

## Not addressed

The daemon-start budget itself stays at 5s. If a real host needs longer, the new
diagnostics show the daemon failure before changing that budget.
