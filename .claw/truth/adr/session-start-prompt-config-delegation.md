# ADR: SessionStart prompt 配置化与 plugin 委托架构

## Status

Accepted

## Context

SessionStart prompt 原本硬编码在 `packages/cli/src/cli.ts` 的两个 builder 函数（`buildSessionStartAdditionalContext` + `buildRecoveredWorkflowAdditionalContext`）中。这导致两个问题：

1. **平台无法差异化**：Codex 与 OpenCode 共用同一套硬编码文案，无法按平台发布不同的 SessionStart prompt。
2. **OpenCode plugin 绕过 claw hook**：plugin 的 `experimental.chat.system.transform` 硬编码了精简版静态文本，缺少 `claw hook SessionStart` 返回的关键内容（预授权声明、反阻塞条款、plugin 驱动引用），导致 agent 不走 claw 流程。

## Decision

### 1. SessionStart prompt 配置化

- `GuidanceConfig` 类型新增 optional `sessionStart` 字段，与 `goalModeObjective` / `delegates` / `states` 平级
- `sessionStart` 含 `default`（无 active plan）和 `recovered`（有 active plan）两个分支
- `recovered` 分支的结构化字段（`snapshotFields`）用数组定义顺序，运行时按 plan 状态条件填充
- core 新增 `buildSessionStartDefaultPrompt` 和 `buildSessionStartRecoveredPrompt` 两个 export 函数
- 两个 config 文件（`workflow-guidance.config.json` Codex 默认 + `workflow-guidance.opencode.json` OpenCode 变体）各自维护 sessionStart 模板
- 复用已有 `CLAW_GUIDANCE_CONFIG` 环境变量切换机制
- config 缺失 `sessionStart` 时，用与原硬编码逐字一致的 fallback 常量保持向后兼容

### 2. OpenCode plugin 委托 claw hook SessionStart

- plugin 在 `session.created` 时调用 `claw hook SessionStart` 获取完整动态 context，存入 `clawSessionContext`
- `experimental.chat.system.transform` 优先使用 `clawSessionContext`，只有当 claw CLI 不可用时才 fallback 到静态文本

## Alternatives

保持 cli.ts 硬编码 + 在 plugin 侧单独维护一份文案：这会导致两份文案长期分叉，且无法按平台差异化。

## Consequences

- Codex 与 OpenCode 可以通过各自的 config 文件发布不同的 SessionStart prompt，互不干扰
- 所有平台 adapter 统一走 claw hook SessionStart 获取 prompt，消除硬编码分叉风险
- `summarizeRecoveredPlanContent` 留在 `cli.ts`（纯数据格式化，不属于 prompt 文案），输出作为 `planContentLines: string[]` 参数传入 core builder
- `codex-adapter/hooks/session-start-recovery.mjs` 是废弃并行实现，文案与 canonical CLI 版本不一致且无 live hook 绑定，后续需清理

## Related Code

- `packages/core/src/workflow-guidance.ts` — `GuidanceConfig` 类型扩展、两个 builder export 函数、fallback 常量
- `packages/core/src/workflow-guidance.config.json` — Codex 默认 sessionStart 模板
- `packages/opencode-adapter/workflow-guidance.opencode.json` — OpenCode 变体 sessionStart 模板
- `packages/opencode-adapter/plugin/index.ts` — `invokeClawSessionStart()` 函数
- `packages/cli/src/cli.ts` — 两个 builder 改为调用 core export

## Search Terms

- `sessionStart`
- `GuidanceConfig`
- `buildSessionStartDefaultPrompt`
- `buildSessionStartRecoveredPrompt`
- `CLAW_GUIDANCE_CONFIG`
- `invokeClawSessionStart`
