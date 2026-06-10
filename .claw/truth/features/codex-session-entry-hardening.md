# Codex Session Entry Hardening

## Status

Accepted working truth for the current Codex adapter startup path.

## Core facts

- `@claw-kit` session entry still routes through `claw-kit:using-claw-kit`.
- `SessionStart` is an enhancement layer for developer-visible startup context, not the source of canonical workflow correctness.
- The startup hook implementation lives at `packages/codex-adapter/hooks/session-start-recovery.mjs`.
- `claw context` and SessionStart logging now expose startup repair state through `startupRecovery`, not `bootstrap`.
- The first visible workflow action is to read `planning`; startup recovery is not a separate user-visible first-step workflow.
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
- 历史版本实跑对比说明，startup surface 一旦在 agent 视角上变成独立入口，就会和 `plan write`、`process.active` 形成并列竞争关系，稀释 task-scope 主流程。
- 因而 `SessionStart` 的 durable 边界不是“多给一步入口”，而是最多恢复当前 workflow contract；真正的 task 建立与推进语义仍由 `plan write` 和后续 `process.active` 承担。
- 旧的 standalone workflow skills 移除后，`planning` 承担唯一可见计划入口，`using-claw-kit` 不再暴露 bootstrap / reference-loading 分支来打断主线。

## Related files

- `packages/codex-adapter/hooks/session-start-recovery.mjs`
- `packages/codex-adapter/hooks/hooks.json`
- `packages/cli/src/cli.ts`
- `packages/core/src/context.ts`
- `packages/core/src/plan.ts`
- `packages/core/src/types.ts`

## Boundaries

- The hook only injects minimal startup context; it does not take over goal, subagent, truth, or ADR orchestration.
- If `.claw` cannot recover a session-bound active workflow, the adapter should behave like normal startup rather than inventing recovery guidance.
