# ADR: SessionStart 恢复 session 绑定的 workflow snapshot

## Status

Accepted

## Context

`claw-kit` 已经把 Codex 启动恢复责任收敛到 `SessionStart`，并要求 agent 在后续流程中以 `workflowGuidance` 作为唯一 next-step contract。

这带来两个新的恢复约束：

- 同一线程发生 Codex compact 之后，startup 恢复不应再按 source 分叉出另一套 compact 专用流程
- 恢复逻辑必须优先依赖当前 `.claw` canonical state，而不是 recent tool use 或 thread 内瞬时推断

同时，startup 恢复只在能够确认当前 session 对应的 active workflow 时才应该注入最小 workflow contract；否则应保持现有 startup 行为不变，避免创造额外 recover prompt 干扰 `using-claw-kit` 的默认入口。

## Decision

统一使用一条 `SessionStart` 恢复流来承接 `.claw` 项目的 startup recovery，并把 session 绑定信息落到 task metadata：

- `plan write` 记录当前 host 的 `ownerSessionKey`
- `SessionStart` 不再按 hook source 区分 `startup`、`resume`、`compact` 的恢复逻辑
- `SessionStart` 启动时尝试从 `.claw` 中恢复与当前 `ownerSessionKey` 绑定的 active workflow
- 恢复成功时，只注入最小 workflow snapshot 和基于当前 canonical state 重算得到的 `workflowGuidance`
- 注入内容只包含继续执行所需的最小 contract，不重复 project root、`.claw` 路径或 raw `plan.json`
- 如果没有可恢复的 active workflow，则保持现有 startup 提示与行为不变

## Consequences

- Codex compact 后的同线程继续对话可以自动回到当前 session 已绑定的 workflow，而不是重新靠 prompt 猜测上下文
- startup recovery 继续保持为 enhancement，而不是替代 `plan write`、`plan edit`、`plan done` 和 truth/ADR deposition 的 correctness 机制
- workflow 恢复与 `workflowGuidance` contract 保持一致，减少 adapter 在 compact 后自行发明下一步的空间
- 没有 active workflow 时，系统仍然退回现有 `using-claw-kit` 入口，不增加新的恢复文案分支

## Related Code

- `packages/cli/src/cli.ts`
- `packages/core/src/context.ts`
- `packages/core/src/plan.ts`
- `packages/core/src/types.ts`
- `packages/codex-adapter/hooks/session-start-bootstrap.mjs`
- `packages/codex-adapter/hooks/hooks.json`

## Search Terms

- `ownerSessionKey`
- `SessionStart`
- `compact`
- `workflowGuidance`
- `active workflow snapshot`
