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

### 3. invokeClawSessionStart 必须显式传递环境变量

plugin 的 `shell.env` hook 注入的环境变量（`CLAW_HOST`、`CLAW_GUIDANCE_CONFIG`）只对后续 agent bash 工具调用生效，不对 plugin 自身的 `execSync` 生效。`CLAW_HOST` 的输入验证、优先级与 invocation-scoped 生命周期由 `invocation-host-handling.md` 拥有；`invokeClawSessionStart` 只需把 OpenCode 选择的输入与配置显式传递给 CLI：

```
env: { ...process.env, CLAW_HOST: "opencode", CLAW_GUIDANCE_CONFIG: <opencode config path> }
```

否则 plugin 调用的 claw hook 会继承默认的 core bundled config，而非 opencode 变体 config。

### 4. 平台 prompt 文案语义隔离

两个平台的 config 使用各自贴合平台语义的引用语法：

- **Codex 版**（core bundled `workflow-guidance.config.json` + `FALLBACK_SESSION_START` 常量）：使用 `@claw-kit` 提及和 `claw-kit:using-claw-kit` skill 引用。`[@claw-kit](plugin://claw-kit@claw-kit)` 是 Codex 有效的 official plugin markdown 链接语法（仍出现在 `packages/codex-adapter/references/` 中），但 core config 与 fallback 常量统一采用简洁的 `@claw-kit` 提及。
- **OpenCode 版**（`workflow-guidance.opencode.json`）：不使用 `plugin://` 语法，因为 opencode 不解析该协议。opencode 通过 `skills.paths` 注册 skill，agent 用 `skill` 工具按裸名（如 `using-claw-kit`）加载；sessionStart 文案以 "the claw-kit plugin" / "Load the `using-claw-kit` skill" 表达，确保 opencode session 拿到注入 prompt 后可直接进入 claw 流程。

> 修正记录：本节早先版本曾把 `plugin://` 归为 opencode 语法、并要求 Codex 回避它，方向恰好写反。详见 `.claw/truth/features/platform-sessionstart-prompt-isolation.md`。

## Alternatives

保持 cli.ts 硬编码 + 在 plugin 侧单独维护一份文案：这会导致两份文案长期分叉，且无法按平台差异化。

## Consequences

- Codex 与 OpenCode 可以通过各自的 config 文件发布不同的 SessionStart prompt，互不干扰
- 所有平台 adapter 统一走 claw hook SessionStart 获取 prompt，消除硬编码分叉风险
- `summarizeRecoveredPlanContent` 留在 `cli.ts`（纯数据格式化，不属于 prompt 文案），输出作为 `planContentLines: string[]` 参数传入 core builder
- `codex-adapter/hooks/session-start-recovery.mjs` 是已删除的废弃并行实现（文案曾与 canonical CLI 版本不一致且无 live hook 绑定），现已清理；canonical SessionStart 入口为 `claw hook SessionStart` CLI 命令
- **三重隔离**保证平台 config 安全独立：环境变量隔离（`CLAW_GUIDANCE_CONFIG` 指向不同文件）、进程隔离（`invokeClawSessionStart` 的 `execSync` 独立子进程）、文件物理隔离（各自维护独立 JSON 文件）。`cli.test.ts` 断言绑定 core bundled config，opencode config 的文案变更对 cli 测试无影响
- 任何通过 `execSync` 调用 claw CLI 的代码都必须在 options.env 中显式传递所需环境变量，不能依赖外部 hook 注入

## Related Code

- `packages/core/src/workflow-guidance.ts` — `GuidanceConfig` 类型扩展、两个 builder export 函数、fallback 常量
- `packages/core/src/workflow-guidance.config.json` — Codex 默认 sessionStart 模板
- `packages/opencode-adapter/workflow-guidance.opencode.json` — OpenCode 变体 sessionStart 模板
- `packages/opencode-adapter/plugin/index.ts` — `invokeClawSessionStart()` 函数，含显式环境变量传递
- `packages/cli/src/cli.ts` — 两个 builder 改为调用 core export

## Search Terms

- `sessionStart`
- `GuidanceConfig`
- `buildSessionStartDefaultPrompt`
- `buildSessionStartRecoveredPrompt`
- `CLAW_GUIDANCE_CONFIG`
- `CLAW_HOST`
- `invokeClawSessionStart`
- `execSync`
- `plugin://`
- `@claw-kit`
