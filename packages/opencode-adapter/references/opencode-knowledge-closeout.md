# OpenCode knowledge closeout boundary

## Conclusion

Plan and session binding are claw-kit's foreground canonical lifecycle and must stay independent of the opencode plugin hooks. Plugin event, report, or worker failures are all fail-open: they must not change `claw plan create`, `claw plan edit`, `claw plan done`, subplan parent resume, or session binding semantics.

Knowledge capture uses a per-session registry / outbox separated from the foreground lifecycle. Creating a root plan or subplan derives an adjacent report path from the deterministic plan path: `<name>.json` pairs with `<name>.report`. Plan completion records a pending turn owner, but the canonical lifecycle immediately resumes the parent binding, or clears the binding on root completion; it never waits for report, hook, or the async writer.

## Long-term rules

- Each opencode turn writes at most one report on `session.idle`. If the current turn has a pending completed plan, that completed plan owns the final report; otherwise the current active plan owns it. A completion transition turn never writes two reports.
- The finalization worker only consumes the completed `plan.json`, its adjacent report, and a finalize id, then decides and deposits truth / ADR, and requests recall indexing.
- On opencode the worker runs through `opencode run --agent claw-knowledge-writer` inside the user's own opencode environment. It never assumes a Codex SDK runtime is installed locally; the opencode host must not require codex-runtime consent.
- The job's `host` field selects the runner: `opencode` → `opencode run`; anything else (including legacy jobs without the field) → Codex SDK.
- Writer success path order: writer completes, Truth/ADR encoding normalization, completion recall refresh, `succeeded` job persisted, then best-effort cleanup of the temporary report. Writer, encoding, or refresh failures enter the existing retry path and keep the report.
- Report cleanup only accepts paths under `.claw/tasks` and runs under file lock. It happens after `succeeded` is persisted and is a one-attempt best-effort cleanup; deletion failure does not rewrite the job, retry, or rerun the writer.
- The main agent no longer judges or dispatches the knowledge writer; async knowledge capture must not take over plan lifecycle or session binding.
- After a foreground plan mutation succeeds, plugin, report, or worker errors are observable side failures only; they cannot roll back, block, or rewrite canonical plan state.

## Related code

- `packages/core/src/plan.ts`: canonical plan create/edit/done and root/subplan lifecycle.
- `packages/core/src/session-bindings.ts`: explicit `sessionKey -> planPath` binding and parent resume.
- `packages/core/src/context.ts`: recovers the current workflow only through session binding.
- `packages/core/src/knowledge-sidecar.ts`: Truth/ADR Markdown encoding normalization, report path containment, best-effort cleanup, and the `host` field on finalization jobs.
- `packages/cli/src/cli.ts`: host-aware finalization runner (`runKnowledgeWriterForJob`) and the `runStopHook` message-payload path.
- `packages/cli/src/opencode-runner.ts`: `opencode run` finalization runner and NDJSON parser.
- `packages/opencode-adapter/plugin/index.ts`: `session.idle` report capture and `message.*` tracking.

## Known traps

- Do not infer the active plan from directory scans or event streams; without a session binding, recovery must stay empty.
- Do not treat both the pending completed plan and the already-resumed parent as the same turn's owner; that produces dual writes and ambiguous closeout evidence.
- Async writer completion and foreground `claw plan done` success are two different things; never describe the latter as completed truth / ADR deposition.
- Do not route the opencode host through the Codex SDK runner; the job's `host` field selects `opencode run`.

## Verification

- After forcing plugin, report, or worker failures, plan create/edit/done, subplan parent resume, and binding still complete via the canonical lifecycle.
- Creating a root plan and subplan each yields exactly one adjacent `.report` path derived from the `.json`.
- The completion transition `session.idle` produces exactly one report owned by the pending completed plan; ordinary `session.idle` only owns the active plan.
- The worker input only accepts a completed `plan.json`, adjacent report, and finalize id, and requests indexing after deposition.
- opencode finalization runs through `opencode run` without any codex-runtime dependency.

## Search terms

- `fail-open hooks`
- `session binding`
- `pending turn owner`
- `plan report`
- `finalize id`
- `knowledge-writer`
- `opencode run`
- `host-aware runner`
