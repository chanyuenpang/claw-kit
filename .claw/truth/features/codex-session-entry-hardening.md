# Codex Session Entry Hardening

## Status

Accepted working truth for the current Codex adapter startup path.

## Core facts

- `@claw-kit` session entry still routes through `claw-kit:using-claw-kit`.
- `SessionStart` is an enhancement layer for developer-visible startup context, not the source of canonical workflow correctness.
- The startup hook implementation is the `claw hook SessionStart` CLI command (registered in `packages/codex-adapter/hooks/hooks.json`, implemented in `packages/cli/src/cli.ts`).
- `claw context` and SessionStart logging now expose startup repair state through `startupRecovery`, not `bootstrap`.
- `runContextCommand()` already computes `startupRecovery.versionSync`, and SessionStart default/recovered prompt building appends version-sync notes from that field instead of dropping it.
- `startupRecovery.versionSync` is now a routing/reporting contract, not proof that `claw context` already executed a local upgrade.
- Startup recovery is not a separate user-visible first-step workflow. When the default entry creates a project plan, its seeded planning task becomes the plan's first visible work.
- Startup follows one unified flow; it does not branch on `SessionStart.source` such as `compact`.
- Project plan creation stores canonical session state at project level as `sessionKey -> .claw-relative planPath`; per-task `ownerSessionKey` / `boundAt` metadata is no longer the active workflow lookup surface.
- On `SessionStart`, the adapter first attempts to recover a session-bound active workflow from current `.claw` state.
- If recovery finds an active plan for the current session, the hook injects a minimal claw workflow snapshot and recomputed `workflowGuidance`.
- Recovered startup context also carries the active plan content in hook-specific `additionalContext` JSON, so the resumed agent can see the current goal, tasks, and references without rehydrating the plan by hand.
- The recovered `workflowGuidance` is the only next-step contract surfaced back to the agent.
- Prompt-injected recovery guidance belongs to SessionStart. `using-claw-kit` does not inspect it in its default `First Action`; the entry route is owned by `codex-plugin-workflow-mechanics.md` and is not duplicated by this startup document.
- When project `version` is ahead of the current CLI, SessionStart must distinguish the explicit `autoUpdate` gate:
- `autoUpdate = false`: only surface an informational lagging-version note.
- `autoUpdate = true` plus a newer published version: surface `claw-kit:update` as the required first action so both the CLI and the current host plugin surface are refreshed together.
- The 0.1.58 release round confirmed that this update-first route is also ordering-sensitive: the startup prompt / auth wording changes and the update prompt must continue to present `claw-kit:update` before any follow-up actions when a newer published version is available.
- If no recoverable active workflow exists, startup falls back to the existing default prompt behavior without extra recovery text, except for any version-sync note that explains a stale or lagging CLI prompt surface.

## Workflow implications

- The startup hook may restore the current workflow contract, but it does not replace project plan creation or later plan mutations.
- Canonical next-step routing still comes from current plan state plus recomputed `workflowGuidance`, not from hook event type or tool-use heuristics.
- Session recovery is valid only when `.claw` can resolve an active plan through the current session's explicit project-level binding. The startup hook must not scan task directories to infer an active plan.
- 历史版本实跑对比说明，startup surface 一旦在 agent 视角上变成独立入口，就会和 `plan write`、`process.active` 形成并列竞争关系，稀释 task-scope 主流程。
- 因而 `SessionStart` 的 durable 边界不是“多给一步入口”，而是最多恢复当前 workflow contract；真正的 task 建立由 `using-claw-kit` 选择的 `claw plan create` 承担，后续推进由返回的 `workflowGuidance` 与 `process.active` 生命周期承担。
- 旧的 standalone workflow skills 移除后，`using-claw-kit` 拥有 project-plan versus direct-work 的默认入口判断；只有创建 project plan 后，`planning` 才承担计划内容的可见入口，且不再暴露 bootstrap / reference-loading 分支打断主线。
- 当项目没有开启 `autoUpdate` 时，`SessionStart` 的 durable 责任只是报告 lagging-version 状态，而不是在恢复链路里替用户执行本地升级。
- 当 `autoUpdate = true` 且存在更高的已发布版本时，update-first 行为必须通过 prompt 合同显式落到 `claw-kit:update`，而不是继续隐藏在 `claw context` 内部。

## Related files

- `packages/codex-adapter/hooks/hooks.json`
- `packages/cli/src/cli.ts`
- `packages/cli/test/cli.test.ts`
- `packages/core/src/context.ts`
- `packages/core/src/session-bindings.ts`
- `packages/core/src/task-layout-migration.ts`
- `packages/core/src/plan.ts`
- `packages/core/src/types.ts`
- `packages/codex-adapter/skills/update/SKILL.md`
- `packages/codex-adapter/references/codex-startup-recovery.md`
- `packages/codex-adapter/references/project-config-reference.md`

## Boundaries

- The hook only injects minimal startup context; it does not take over goal, subagent, truth, or ADR orchestration.
- If `.claw` cannot recover a session-bound active workflow, the adapter should behave like normal startup rather than inventing recovery guidance.
- This SessionStart/version-sync path is a startup routing surface, not an implicit installer. Any real update path must refresh both the global CLI and the current host plugin install surface together.
