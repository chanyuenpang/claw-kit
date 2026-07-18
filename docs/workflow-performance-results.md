# Workflow performance results

## Outcome

The second-stage workflow optimization met the fixed acceptance gates on the
Windows reference machine while preserving planning, workflow guidance, Goal
Mode, canonical truth/ADR routing, and compatibility commands.

## Foreground lifecycle

- The predecessor path used five plan mutations before business work. With the
  required recall query, this was six management commands.
- `claw plan start --requirements <text> --acceptance <criterion> --add-task
  <title> --detail <text>` reduces the plan lifecycle to create plus one atomic start. With
  recall, the formal flow uses three management commands.
- The 2026-07-17 explicit-command corpus measured sequential P50 `1602.15ms`
  and atomic P50 `463.76ms`, an observed `71.05%` improvement. Every low,
  medium, and high case completed successfully without temporary JSON inputs.
- Internal CLI events are versioned and share one mutation id. Default command
  responses omit the raw event array. Codex-only `hostActions` are idempotent,
  one-way projections for progress and Goal Mode; host-neutral and OpenCode
  responses contain guidance fields without Codex actions.
- `--host` and `CLAW_HOST` now resolve once per invocation. Unsupported values
  and flag/environment conflicts fail before mutation, while detached workers
  drop the foreground variable and finalization routes from `job.host`.

## Completion path

- Completion refresh uses a project-level leader with coalesced status files,
  operations, and dirty hashes. A changed dirty hash triggers another bounded
  cycle instead of overlapping workers.
- Embedding inference runs outside the SQLite write transaction. Only final
  vector persistence holds the short write transaction.
- A GitNexus embeddings preflight satisfies the matching closeout analyze, so
  the background worker does not repeat it. Transient busy/locked output uses
  bounded retry.
- Windows `.cmd` execution uses explicit `cmd.exe`; no `shell:true` argument
  path remains and the regression test observes no `DEP0190`.

## Turn-report hook path

- `auto-doc` now checks only the per-session knowledge registry in the
  lightweight CLI entry, and only when `.claw` exists directly under hook
  `cwd`. It neither reads the task-binding registry nor inherits a parent
  directory's project context.
  A missing `cwd/.claw` exits before hook stdin is read; with neither session
  signal, it exits before importing the main CLI or reading the transcript.
- A same-machine 25-run A/B on 2026-07-18 measured the unbound preflight at
  `98.9ms` median / `113.8ms` P95, versus `181.2ms` median / `232.2ms` P95 when
  directly loading the full CLI path, a `45.4%` median reduction. These are
  machine-specific process timings, not cross-runtime constants.
- Bound active-plan capture, completed-plan finalization, duplicate Stop,
  finalizer recursion protection, and OpenCode inline-message routing remain in
  the CLI regression suite.
- Knowledge registries remain host-free. The native Stop hook records its host
  only on the queued finalization job, avoiding stale per-session host state.

## Search path

- Search output now reports `route`, `queryEmbedding`, `embeddingRuntime`, and
  internal duration. The observable runtimes are lexical fast path, cache hit,
  persistent daemon, one-shot fallback, mock, and remote.
- Exact lexical P95 was `315.35ms`, below the `500ms` gate.
- Five distinct warm semantic queries all used `persistent_daemon`; P95 was
  `602.93ms`, below the `1s` gate.
- Query-cache samples were `302.29-339.36ms`. The forced one-shot fallback
  remained functional at `4392.01ms`.
- Plan-create prewarming is not enabled. The measured daemon warm path already
  passes the target, while automatic prewarm would load a model for workflows
  that may only use lexical recall. Telemetry now provides evidence to revisit
  this if the workload mix changes.

## Writer and complexity path

- Same-type writer reuse remains the default dispatch contract.
- ADR writer checks `keyDecisions` first. An absent or empty list returns the
  explicit `no durable keyDecisions` no-op before search or corpus inspection.
- The 15-case corpus separates expected knowledge value from execution readiness.
  Work expected to produce reusable project knowledge creates a plan, but the plan
  remains in `process.discussing` until downstream tasks are explicit and execution
  can continue without repeated user input, material choices, step review, or
  co-creation. Only then does it enter `process.active`.
- The three-state lifecycle gate kept direct false positives and premature Goal
  Mode activation at `0%`, retained `100%` formal-plan recall, and reached `100%`
  state accuracy across `direct`, `discussing`, and `active` cases.

## Evidence

- `benchmarks/workflow/0.1.68-windows-baseline.json`
- `benchmarks/workflow/0.1.68-atomic-windows.json`
- `benchmarks/search/0.1.68-telemetry-windows.json`
- `benchmarks/complexity-gate-corpus.json`
- `benchmarks/complexity-gate-calibration-result.json`
