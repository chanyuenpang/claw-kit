# Codex Session Entry Hardening

## Status

Accepted working truth for the current Codex adapter startup path.

## Core facts

- `@claw-kit` session entry still routes through `claw-kit:using-claw-kit`.
- `SessionStart` is an enhancement layer for developer-visible startup context, not the source of canonical workflow correctness.
- The startup hook implementation is the `claw hook SessionStart` CLI command (registered in `packages/codex-adapter/hooks/hooks.json`, implemented in `packages/cli/src/cli.ts`).
- `claw context` and SessionStart logging now expose startup repair state through `startupRecovery`, not `bootstrap`.
- `runContextCommand()` already computes `startupRecovery.versionSync`, and SessionStart default/recovered prompt building appends version-sync notes from that field instead of dropping it.
- The first visible workflow action is to read `planning`; startup recovery is not a separate user-visible first-step workflow.
- Startup follows one unified flow; it does not branch on `SessionStart.source` such as `compact`.
- During `plan write`, the active task metadata is bound to the current host session with `ownerSessionKey` and `boundAt`.
- On `SessionStart`, the adapter first attempts to recover a session-bound active workflow from current `.claw` state.
- If recovery finds an active plan for the current session, the hook injects a minimal claw workflow snapshot and recomputed `workflowGuidance`.
- Recovered startup context also carries the active plan content in hook-specific `additionalContext` JSON, so the resumed agent can see the current goal, tasks, and references without rehydrating the plan by hand.
- The recovered `workflowGuidance` is the only next-step contract surfaced back to the agent.
- When project `version` is ahead of the current CLI, SessionStart must surface one of three version-sync outcomes: prompt already reloaded through the updated CLI entrypoint, CLI updated but the current process may still be showing the older prompt surface, or CLI still lagging because npm latest is behind or the automatic update failed.
- If no recoverable active workflow exists, startup falls back to the existing default prompt behavior without extra recovery text, except for any version-sync note that explains a stale or lagging CLI prompt surface.

## Workflow implications

- The startup hook may restore the current workflow contract, but it does not replace `claw plan write`, `claw plan edit`, or `claw plan done`.
- Canonical next-step routing still comes from current plan state plus recomputed `workflowGuidance`, not from hook event type or tool-use heuristics.
- Session recovery is valid only when `.claw` can recover an active plan bound to the current session.
- 历史版本实跑对比说明，startup surface 一旦在 agent 视角上变成独立入口，就会和 `plan write`、`process.active` 形成并列竞争关系，稀释 task-scope 主流程。
- 因而 `SessionStart` 的 durable 边界不是“多给一步入口”，而是最多恢复当前 workflow contract；真正的 task 建立与推进语义仍由 `plan write` 和后续 `process.active` 承担。
- 旧的 standalone workflow skills 移除后，`planning` 承担唯一可见计划入口，`using-claw-kit` 不再暴露 bootstrap / reference-loading 分支来打断主线。
- 当自动更新成功且当前会话已经能看到更新后的 CLI entrypoint 时，`claw context` 应在同一次恢复链路里通过该更新后的 entrypoint 重跑 context，让新的 prompt surface 立即落到这次 SessionStart 恢复结果中。

## Related files

- `packages/codex-adapter/hooks/hooks.json`
- `packages/cli/src/cli.ts`
- `packages/cli/test/cli.test.ts`
- `packages/core/src/context.ts`
- `packages/core/src/plan.ts`
- `packages/core/src/types.ts`
- `packages/codex-adapter/references/codex-startup-recovery.md`
- `packages/codex-adapter/references/project-config-reference.md`

## Boundaries

- The hook only injects minimal startup context; it does not take over goal, subagent, truth, or ADR orchestration.
- If `.claw` cannot recover a session-bound active workflow, the adapter should behave like normal startup rather than inventing recovery guidance.
- This SessionStart/version-sync path is about refreshing the CLI prompt/runtime surface; it does not install or refresh the local Codex plugin cache payload.
