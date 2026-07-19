# Workflow performance contract

## Scope

The formal workflow optimization is measured as a lifecycle, not as a single
search command. The fixed corpus contains low, medium, and high cases with one,
three, and five business tasks. Every run records the machine, Node runtime,
CLI build, cold or warm condition, success state, command count, and stage
latency.

The predecessor baseline is `0.1.68` plus the search-help and recall-guidance
fix. The legacy planning path performs five management commands before business
work: create, patch, append tasks, complete planning, and activate.

## Atomic refine-and-activate contract

The optimized path exposes one plan mutation that applies planning content,
appends outcome tasks, and executes the current template task's declarative
`guidance.onPlanStart` actions. The default template uses those internal actions
to complete its planning task and enter `process.active`. The entire mutation is
serialized against the current plan and is written once.

Each mutation must produce ordered, versioned plan events internally. Events
describe canonical CLI state only; they never read host state or wait for host
tools. The CLI derives host progress and Goal Mode actions before projecting the
public result; default command responses do not expose the raw `events` array.

Required event fields:

- schema version and event id
- event type and timestamp
- canonical plan path, title, current status, and previous status
- affected and completed plan task ids
- command source and mutation id shared by every event in one atomic mutation

Compatibility rules:

- Existing `plan create`, `plan edit`, and `plan done` remain supported.
- The optimized mutation uses the same plan validation, workflow guidance, file
  lock, session binding, and template route checks as existing edits.
- Codex consumers use `hostActions`; host-neutral and OpenCode consumers use the
  projected guidance fields. No public consumer reads raw events.
- Host actions are derived output. The plan file remains the canonical state.
- A host action failure does not roll back a committed CLI mutation; repeating
  consumption must be idempotent by event id.

## Turn-report hook fast path

`claw hook auto-doc` is registered at turn scope, so its no-work path must be
decided before the main CLI module is loaded. The lightweight entry may inspect
only the hook payload, the `.claw` directory directly under hook `cwd`, the
hashed per-session knowledge registry, and no compatibility fallback. It must
not read the canonical task-binding registry or walk parent directories to
inherit another working directory's project context. The process checks its
actual `cwd/.claw` before reading hook stdin, because `.claw` is initialized at
a deterministic level.

If the session knowledge registry has neither an active nor pending target, the
command exits successfully without loading the main CLI, reading the transcript,
parsing project configuration, launching a worker, or mutating `.claw`. A
pending ended-plan owner remains a valid target after the canonical task
binding has been removed, so final-turn capture is preserved.

## Invocation host boundary

Host identity is invocation-scoped. The CLI resolves `--host` and `CLAW_HOST`
once, accepts only `codex` or `opencode`, and rejects conflicting sources before
any project mutation. It does not copy the result back into `process.env`.

Only Codex results may contain `hostActions`. Session bindings and knowledge
registries do not persist host identity. Turn-end hooks write their native host
directly into a newly queued finalization job, and detached finalization or
completion workers start without inheriting the foreground `CLAW_HOST`; writer
routing uses the job's host snapshot.

## Observable knowledge closeout

After a knowledge-writer pass succeeds, the worker appends one idempotent
`knowledge_finalization` JSONL entry to the adjacent report. The entry exposes
the finalize id, completion time, successful result, attempt count, writer
thread when available, host, and encoding summary. The report is not deleted
by finalization: it moves with the completed task into `.claw/archive/tasks`
and is removed only when archive retention prunes that task. The default
`maxTasksToKeep` archive limit is `9`.

## Phase gates

- No more than three management commands before the first business action:
  create, one recall query, and atomic refine-and-activate.
- Same-machine formal-workflow P50 improves by at least 25% against the fixed
  legacy corpus without reducing validation or traceability.
- Core, CLI, Codex/OpenCode adapter, bundle, and encoding checks remain green.
- Search and closeout measurements are reported separately from plan mutation.
- The unbound `auto-doc` path must remain covered independently from bound and
  completed-plan report capture.

Run `npm run benchmark:workflow` after building the CLI to capture the legacy
baseline. Optimized reports must reuse the same corpus and report both paths.

The first atomic implementation measurement on the fixed Windows machine is
stored in `benchmarks/workflow/0.1.68-atomic-windows.json`: legacy P50 was
`902.79ms`, atomic P50 was `385.06ms`, an observed improvement of `57.35%`.
The formal management-command count, including the one common recall query,
fell from six to three. These figures are machine-specific and do not replace
cross-runtime regression tests.
