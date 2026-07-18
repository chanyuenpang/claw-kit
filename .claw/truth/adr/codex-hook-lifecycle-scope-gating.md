# ADR: Codex Hook Lifecycle Scope Gating

## Status

Accepted

## Context

`claw-kit` 需要确认 Codex hook 的正确职责边界。hook 可以在 session lifecycle 上提供 startup recovery enhancement，但它不是 canonical harness correctness 的唯一基础，也不是完整的 thread orchestration API。

本地验证已经确认：

- `SessionStart` hook 适合做 startup recovery enhancement
- `Stop` hook 可以承担 fail-open knowledge report capture 和 finalization queueing，但不拥有 `.claw` canonical plan lifecycle
- developer context 注入不能替代 `plan write`、`workflowGuidance` 或 hook-owned knowledge sidecar 的独立完成合同

因此，hook command 只承担轻量、可恢复、可跳过的 SessionStart recovery 与 Stop knowledge sidecar；两者都不能回滚或阻塞 foreground workflow。

## Decision

Codex adapter 对 hook 生命周期做 scope gating：

- `SessionStart` 只作为启动恢复增强路径；`Stop` 只作为 knowledge capture/finalization sidecar
- `SessionStart` hook 通过 `claw hook SessionStart` CLI 命令运行（注册于 `packages/codex-adapter/hooks/hooks.json`，实现于 `packages/cli/src/cli.ts`）
- 启动时先根据 `cwd` 检查是否命中 `.claw` 项目
- 命中 `.claw` 项目时，执行 `claw context`，把紧凑 project context 和 “使用 [@claw-kit](plugin://claw-kit@claw-kit-local) 推进任务” 的提示写入 `additionalContext`
- 未命中 `.claw` 项目时，不做任何注入
- `Stop` 在 CLI 加载前还必须确认当前 session knowledge registry 存在 active 或 pending target；没有 target 时快速退出
- `Stop` 的 report/job 失败保持 fail-open，writer orchestration 由 `hook-owned-two-phase-knowledge-finalization.md` 单独拥有
- canonical harness correctness 继续由 prompt-driven workflow 与 CLI/core semantics 负责

## Consequences

- Codex session start 获得 attach-free startup recovery enhancement，同时不要求 hook 接管主流程
- hook 实现保持 scope-gated：SessionStart 只恢复，Stop 只捕获和排队，复杂 writer 工作在 detached finalizer 中完成
- 非 `.claw` 项目不会被误注入 `claw-kit` 上下文
- 即使 hook 不工作，主 agent 仍可通过 `using-claw-kit` 和 `claw context` 恢复流程

## Related code

- `packages/cli/src/cli.ts`
- `packages/cli/src/knowledge-hook-preflight.ts`
- `packages/core/src/knowledge-sidecar.ts`
- `packages/codex-adapter/hooks/hooks.json`
- `packages/codex-adapter/.codex-plugin/plugin.json`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
