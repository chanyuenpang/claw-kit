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
- This is adapter-local presentation guidance. It does not modify shared core
  `workflowGuidance`, CLI protocol, or `hostActions` semantics.

## Related code

- `packages/dsh-adapter/src/route-guidance.ts`
- `packages/dsh-adapter/src/host-actions.ts`
- `packages/dsh-adapter/src/protocol.ts`
- `packages/dsh-adapter/test/host-actions.test.mjs`
- `packages/dsh-adapter/test/protocol.test.mjs`

## Verification

The completed DSH route-guidance plan recorded adapter build and type-check
success plus 41 DSH tests. Focused coverage verifies mutation-note injection,
the `plan.show` exclusion, recovered-workflow rendering, and the unchanged
fallback prompt.

## Search terms

`DSH route guidance`, `claw_run(operation, args)`, `compactClawOutput`,
`renderGuidanceSnapshot`, `plan.show`
