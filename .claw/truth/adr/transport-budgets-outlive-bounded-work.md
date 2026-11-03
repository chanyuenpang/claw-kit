# ADR: Transport budgets outlive the work they bound

## Context

Adapters, the persistent CLI session process, and host brokers each impose their own timeout on one nested opening or request path: the CLI session's open competes for the shared file execution queue, an adapter bounds the `session open` handshake, the session bounds a single command, and a host broker bounds the RPC that carries it. These budgets had been chosen independently and were not ordered. A Cindy transport once bounded the whole open at 5 s while the CLI's legitimate cold start already included Node start plus a 5 s client daemon-start wait; the outer timer fired first, killed a CLI that was still starting, and returned a bare timeout with no elapsed time, process, or cause, while the same failure repeated on the next call. The worker also collapsed a CLI's structured stderr failure into a generic connection loss. The client daemon-start wait and its detached-daemon stderr observation were later retired with the daemon itself ([in-process direct session transport](in-process-direct-session-transport.md)). Current factual behavior, code anchors, and regression tests are owned by [CLI session-open budgets and transport failure diagnostics](../features/adapter-session-open-budget-and-diagnostics.md).

## Decision

Timeout budgets on one nested transport path are ordered inside-out, and the innermost owner is the one that reports failure.

- Every enclosing budget must outlive the worst-case time of the work it bounds; a budget that can fire before the work's own legit budget is a defect, not a safety margin.
- The innermost owner reports a structured failure - code, operation phase, elapsed and limit, and the target's identity such as pid and launch shape - and enclosing layers preserve that failure. An outer layer must not replace an available inner cause with a generic timeout or connection-loss code.
- Each layer must make its own layer's failure observable: the adapter records a trace event for its own timeout and captures bounded child stderr, and the CLI writes its owner's structured failure to stderr before exiting non-zero. Diagnostics remain fail-open and never block or fail the operation they describe.
- A budget that still proves insufficient is raised on evidence, not speculatively: the persistent session's open-path queue wait is bounded at 8000 ms so the file queue's `PLAN_WRITE_CONFLICT` surfaces before the adapter's 15000 ms open budget; the adapter's single-request budget (and the matching session command queue) stays at 30000 ms; the Cindy broker RPCs stay at 45000 ms and 20000 ms. The execute limit covers the stacked worst case of one open plus one command, so a call that exhausts both still surfaces at the broker rather than as the worker's own failure. The full ordering is recorded in the feature owner.

## Alternatives

- Raise every budget generously and accept slow failure: rejected because an unbounded or arbitrary budget converts a startup defect into a hung session, and it hides which layer actually failed.
- Retry `session open` automatically after a timeout: rejected because a timeout reports an outcome-unknown transport; the usual mutation-outcome rule requires reconciling canonical state rather than replaying, and a retry would also duplicate the surviving child process.
- Collapse all transport failures into one generic code and rely on log inspection: rejected because the model-facing result is the only evidence most callers see, and the pre-existing execute-first error-fidelity contract already requires preserving the business owner's code and phase.
- Raise only the innermost open-path wait to the full 30000 ms command budget: rejected because it would outlive the 15000 ms adapter open budget and reintroduce the outer-timer masking this decision forbids.
- Keep the retired client daemon-start budget as a safety margin: rejected because there is no startup wait left to bound; a budget without bounded work only delays the owner's own failure.

## Consequences

The layered ordering is an invariant of the transport path: changing any budget requires re-checking the budgets above and below it, and the open-path queue wait and the adapter open budget are not interchangeable knobs. Tests pin the boundaries that failed - a handshake that legitimately exceeds the old 5 s budget still succeeds, a queue-held open fails with `PLAN_WRITE_CONFLICT` before the adapter open budget, and a timeout or early child exit reports budget, pid, launch, and stderr instead of a bare code. Cost: a genuinely hung CLI still takes longer to surface at the adapter layer, and an adapter's bounded stderr capture and trace file must not be treated as authorization or as proof that a host adopted the change. The local verification covers fixtures and suites only; confirming a real Cindy host still requires an installed plugin and matching CLI.

<!-- state: history -->
## Decision evolution

<!-- dated: 2026-11-03 -->
### Client daemon-start budget retired with the daemon

The earlier ordering was client daemon start (5000 ms default) < adapter transport open (15000 ms) < session command (30000 ms) < broker execute (45000 ms). The daemon-start budget and the client's detached-daemon stderr log were removed with the shared daemon transport. The inside-out rule and the adapter-side budgets still own the same failure class; the retired numbers remain useful only when reading older incident evidence.
