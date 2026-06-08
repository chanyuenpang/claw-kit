# Codex Session Entry Hardening

## Status

Accepted working truth for the current Codex adapter startup path.

## Core facts

- `@claw-kit` session entry still routes through `claw-kit:using-claw-kit`.
- `SessionStart` is an enhancement layer for developer-visible startup context, not the source of canonical workflow correctness.
- The startup hook implementation lives at `packages/codex-adapter/hooks/session-start-bootstrap.mjs`.
- Startup follows one unified flow; it does not branch on `SessionStart.source` such as `compact`.
- During `plan write`, the active task metadata is bound to the current host session with `ownerSessionKey` and `boundAt`.
- On `SessionStart`, the adapter first attempts to recover a session-bound active workflow from current `.claw` state.
- If recovery finds an active plan for the current session, the hook injects a minimal claw workflow snapshot and recomputed `workflowGuidance`.
- The recovered `workflowGuidance` is the only next-step contract surfaced back to the agent.
- If no recoverable active workflow exists, startup falls back to the existing default prompt behavior without extra recovery text.

## Workflow implications

- The startup hook may restore the current workflow contract, but it does not replace `claw plan write`, `claw plan edit`, or `claw plan done`.
- Canonical next-step routing still comes from current plan state plus recomputed `workflowGuidance`, not from hook event type or tool-use heuristics.
- Session recovery is valid only when `.claw` can recover an active plan bound to the current session.

## Related files

- `packages/codex-adapter/hooks/session-start-bootstrap.mjs`
- `packages/codex-adapter/hooks/hooks.json`
- `packages/cli/src/cli.ts`
- `packages/core/src/context.ts`
- `packages/core/src/plan.ts`
- `packages/core/src/types.ts`

## Boundaries

- The hook only injects minimal startup context; it does not take over goal, subagent, truth, or ADR orchestration.
- If `.claw` cannot recover a session-bound active workflow, the adapter should behave like normal startup rather than inventing recovery guidance.
