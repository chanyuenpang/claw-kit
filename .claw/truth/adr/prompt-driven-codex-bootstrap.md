# ADR: Prompt-driven Codex startup recovery

## Status

Accepted

## Context

`claw-kit` 早期曾把 Codex 启动入口表述成 prompt-driven `bootstrap`，用来替代尚不稳定的 hook 自动化。

后续 adapter 收敛后，durable 结论已经变化：

- prompt 仍然是 Codex 主流程的 correctness surface
- `SessionStart` hook 现在可以承担 startup recovery enhancement
- startup 恢复结果统一落在 `startupRecovery` 命名下（`session-start-recovery.mjs` 并行实现已清理，canonical SessionStart 入口为 `claw hook SessionStart` CLI 命令）
- 可见入口不应再把 `bootstrap` 作为单独 workflow skill 暴露给主 agent

## Decision

Codex adapter 采用 prompt-driven session entry 加 startup recovery enhancement 的组合，但不再保留 standalone `bootstrap` 概念：

- 唯一可见 session-entry skill 是 `claw-kit:using-claw-kit`
- `using-claw-kit` 的第一条可见动作是读取 `planning`
- `planning` 是唯一可见 planning skill；旧的 legacy plan skill surfaces 不再作为 active main-agent path 保留
- `SessionStart` / `claw context` 暴露的 `startupRecovery` 只属于 hook/runtime 侧恢复状态，不是另一条可见 workflow 入口

## Consequences

- prompt surface 继续负责主流程合同，但不会再制造一个与 `using-claw-kit` 并列的 `bootstrap` 入口
- startup recovery 可以继续存在并随 runtime 演进，但它只恢复当前 workflow contract，不负责发明新的计划入口
- active adapter 文案、skill 引导和 canonical ADR 都应围绕 `using-claw-kit` -> `planning` -> `workflowGuidance` 维护

## Related Code

- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/codex-adapter/skills/planning/SKILL.md`
- `packages/codex-adapter/hooks/hooks.json`
- `packages/codex-adapter/references/codex-startup-recovery.md`

## Search Terms

- `startupRecovery`
- `claw hook SessionStart`
- `using-claw-kit`
- `planning`
- `bootstrap`
