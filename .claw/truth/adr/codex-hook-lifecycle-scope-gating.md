# ADR: Codex Hook Lifecycle Scope Gating

## Status

Accepted

## Context

`claw-kit` 需要确认 Codex hook 的正确职责边界。hook 可以在 session lifecycle 上提供 startup recovery enhancement，但它不是 canonical harness correctness 的唯一基础，也不是完整的 thread orchestration API。

本地验证已经确认：

- `SessionStart` hook 适合做 startup recovery enhancement
- 其他 hook 即使存在，也不应承担 `.claw` canonical workflow 的主要职责
- developer context 注入不能替代 `plan write`、`workflowGuidance`、truth deposition、ADR deposition 这些主流程

因此，hook command 应只承担轻量、可恢复、可跳过的 session-entry 责任，尤其是 `SessionStart`。

## Decision

Codex adapter 对 hook 生命周期做 scope gating：

- 只把 `SessionStart` hook 作为启动增强路径
- `SessionStart` hook 通过 `packages/codex-adapter/hooks/session-start-recovery.mjs` 运行
- 启动时先根据 `cwd` 检查是否命中 `.claw` 项目
- 命中 `.claw` 项目时，执行 `claw context`，把紧凑 project context 和 “使用 [@claw-kit](plugin://claw-kit@claw-kit-local) 推进任务” 的提示写入 `additionalContext`
- 未命中 `.claw` 项目时，不做任何注入
- canonical harness correctness 继续由 prompt-driven workflow 与 CLI/core semantics 负责

## Consequences

- Codex session start 获得 attach-free startup recovery enhancement，同时不要求 hook 接管主流程
- hook 实现可以保持足够简单，减少复杂 command 带来的不稳定性
- 非 `.claw` 项目不会被误注入 `claw-kit` 上下文
- 即使 hook 不工作，主 agent 仍可通过 `using-claw-kit` 和 `claw context` 恢复流程

## Related code

- `packages/codex-adapter/hooks/session-start-recovery.mjs`
- `packages/codex-adapter/hooks/hooks.json`
- `packages/codex-adapter/.codex-plugin/plugin.json`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
