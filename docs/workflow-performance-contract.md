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

The optimized path will expose one plan mutation that can apply planning
content, append business tasks, complete explicitly named lifecycle tasks, and
enter `process.active`. The entire mutation is serialized against the current
plan and is written once. Validation failure writes nothing.

The command result must emit ordered, versioned plan events. Events describe
canonical CLI state only; they never read host state or wait for host tools.
Adapters consume the event stream in one direction and may derive host progress
and Goal Mode actions from it.

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
- Old event consumers may continue reading the existing fields.
- Host actions are derived output. The plan file remains the canonical state.
- A host action failure does not roll back a committed CLI mutation; repeating
  consumption must be idempotent by event id.

## Phase gates

- No more than three management commands before the first business action:
  create, one recall query, and atomic refine-and-activate.
- Same-machine formal-workflow P50 improves by at least 25% against the fixed
  legacy corpus without reducing validation or traceability.
- Core, CLI, Codex/OpenCode adapter, bundle, and encoding checks remain green.
- Search and closeout measurements are reported separately from plan mutation.

Run `npm run benchmark:workflow` after building the CLI to capture the legacy
baseline. Optimized reports must reuse the same corpus and report both paths.
