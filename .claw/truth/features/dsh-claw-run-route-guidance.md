# DSH claw_run route guidance

<!-- state: current -->
## Current behavior

`@veewo/dsh-claw-kit` owns the invocation route for DSH workflow mutations. Its
single native tool is `claw_run(operation, args)`; models do not run the
command hints directly in pwsh or another shell.

- `claw_run(operation: "context", args: {})` is the sole DSH startup-recovery route. The adapter supplies the current host identity; models must not invoke `claw context` directly or add `--host`.
- `compactClawOutput()` prepends one adapter-owned route note to the visible
  `notes` of successful `plan.*`, `task.*`, and `subplan.*` workflow mutations.
  The note says that `commandHints` describe `operation` and `args` syntax only.
- Read-only `plan.show` is explicitly excluded, so viewing a plan does not add
  workflow-route noise. Search keeps its existing compact recall surface.
- `renderGuidanceSnapshot()` appends the same route note only when it renders a
  recovered bound workflow. The no-workflow project fallback remains unchanged.
- The adapter stores the rendered workflow snapshot by DSH agent scope. Concurrent
  Web threads cannot overwrite each other's injected `[claw workflow]` context; a
  global last-writer snapshot is not a valid multi-session fallback.
- DSH's snake_case operation catalog maps onto the complete shared daemon contract:
  plan fields include requirements, questions, acceptance criteria, rules, key decisions,
  references, closeout fields, and their removal forms; `plan.edit.operations` preserves
  an explicit canonical mutation order, and `plan.resume.plan_id` selects a plan directly.
- `task.add` accepts one task or a batch, while `task.done` normalizes `choice`/`choice_id`
  to daemon `choiceId`. Known mapped operations reject catalog-external arguments instead of
  silently dropping them; unknown operations continue to pass through for daemon validation.
- `ClawSession` captures bounded startup stderr and rejects pre-handshake child exits as
  `CLAW_SESSION_OPEN_FAILED`, preserving a structured CLI error code/message when present.
  `CLAW_SESSION_OPEN_TIMEOUT` is reserved for a genuinely silent, still-running child.
- Codex's fixed code-mode consumer, Plan Mode UI, and approval mechanics remain host-specific;
  DSH parity applies to the shared mutation and hostActions contracts, not those surfaces.
- These adapter changes do not modify shared core `workflowGuidance`, CLI protocol, or
  `hostActions` semantics.

## Related code

- `packages/dsh-adapter/src/route-guidance.ts`
- `packages/dsh-adapter/src/host-actions.ts`
- `packages/dsh-adapter/src/protocol.ts`
- `packages/dsh-adapter/src/claw-session.ts`
- `packages/dsh-adapter/test/host-actions.test.mjs`
- `packages/dsh-adapter/test/claw-session.test.mjs`
- `packages/dsh-adapter/test/protocol.test.mjs`

## Verification

The completed DSH route-guidance plan recorded adapter build and type-check
success plus 52 DSH tests. Focused coverage verifies complete plan-field mapping,
explicit ordered mutations, plan-id resume, batch task and choice normalization, immediate
startup-error propagation, real timeout classification, mutation-note injection, the
`plan.show` exclusion, recovered-workflow rendering, explicit empty Todo projection,
per-agent snapshot isolation, and the unchanged fallback prompt.

## Search terms

`DSH route guidance`, `claw_run(operation, args)`, `compactClawOutput`,
`renderGuidanceSnapshot`, `plan.show`
