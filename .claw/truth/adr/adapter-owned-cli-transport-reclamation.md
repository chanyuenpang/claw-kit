# ADR: Reclaim adapter-owned CLI transports without ending sessions

## Context

A DSH Web conversation's first persistent claw operation can open a Windows Job runner and CLI `session open` pair. The adapter previously cached it beyond plan completion, multiplying idle pairs across conversations. Cindy's Ghost worker had a comparable persistent CLI cache. These transport processes must not be confused with the shared daemon, recoverable retained session, canonical plan, running request, or independent knowledge writer. See [adapter-owned transport behavior](../features/adapter-session-transport-lifecycle.md) for the current factual contract.

## Decision

Each adapter owns reclamation only for CLI transports that it created: DSH retires the corresponding transport on successful `plan.done` after host effects and knowledge dispatch; Cindy preserves the knowledge-dispatch envelope before releasing its CLI child. Both also retire a transport after ten minutes with no queued or executing CLI request. Serial close waits for previous work, sends a soft `session close`, then bounds graceful exit before terminating only that owned child handle. The request generation/queue gate prevents a delayed completion callback or idle timer from closing newer work. Unexpected child exit removes dead cache entries; an unknown mutation outcome is reconciled through canonical state rather than replayed.

Keep daemon retained records, plans, independent finalizers, and other platforms' unrelated processes outside this transport owner. Report session/workspace/state with read-only diagnostics; correlate process ancestry and PID/start time before cleanup. Existing host processes should be managed by an explicitly authorized host restart after installation, not blanket Node termination.

## Alternatives

- Multiplex several session identities through one CLI process: not selected without a new isolation protocol and its concurrency guarantees; Windows DSH currently uses a per-target Job runner.
- Kill every old Node or every PID absent from an adapter map: rejected because ownership, active work, and other host instances cannot be inferred from that signal.
- End daemon retained sessions or cancel knowledge finalizers when a transport closes: rejected because transport is only an attachment and the other lifecycles have separate owners.
- Apply this eviction to Codex, OpenCode, standard hostless, or OpenClaw: rejected because the audited hosts do not own a comparable per-session CLI child.

## Consequences

Idle process pairs become bounded by useful activity and a ten-minute quiescence window, while a later request takes precedence over older closure. Reconnection may pay runner/CLI startup latency but reuses the retained identity and canonical plan. DSH's Windows real-runner probe demonstrated one pair per live transport and zero after both closed; its historical measurements do not establish that an unrestarted Web installation has adopted the change. The completion, concurrent-next-plan, timeout, crash, reconnect, and Cindy worker boundaries were covered by focused adapter regressions recorded in `docs/dsh-session-lifecycle-investigation-20260928.md`. Keep operational cleanup consent separate from source implementation or tests.
