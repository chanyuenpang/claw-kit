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
- startup 恢复与 prompt-injected `workflowGuidance` 由 `SessionStart` hook 拥有；`using-claw-kit` 的默认 `First Action` 不检查 prompt guidance，其正向入口合同由 `using-claw-kit-session-entry.md` 拥有
- `using-claw-kit` 第一行按是否预期产生可复用项目知识决定直接工作或继续；继续时默认创建 project plan，完整 template-backed workflow skill 存在时改为创建 template plan
- 创建 project plan 后，`planning` 是唯一可见 planning skill；旧的 legacy plan skill surfaces 不再作为 active main-agent path 保留
- `SessionStart` / `claw context` 暴露的 `startupRecovery` 只属于 hook/runtime 侧恢复状态，不是另一条可见 workflow 入口

## Consequences

- prompt surface 继续负责主流程合同，但不会再制造一个与 `using-claw-kit` 并列的 `bootstrap` 入口
- startup recovery 可以继续存在并随 runtime 演进，但它只恢复当前 workflow contract，不负责发明新的计划入口
- 显式 `claw context` 保持为初始化、诊断或 hook/runtime 内部恢复入口；本 ADR 不重复默认 session-entry 路由
- active adapter 文案、skill 引导和 canonical ADR 都应围绕 `using-claw-kit` 的 direct work / default project plan / template plan 三路结果维护；plan 创建后再进入 seeded `planning` 与返回的 `workflowGuidance`

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
