# ADR: SessionStart 恢复 session 绑定的 workflow snapshot

## Status

Accepted

## Context

`claw-kit` 已经把 Codex 启动恢复责任收敛到 `SessionStart`，并要求 agent 在后续流程中以 `workflowGuidance` 作为唯一 next-step contract。

这带来两个新的恢复约束：

- 同一线程发生 Codex compact 之后，startup 恢复不应再按 source 分叉出另一套 compact 专用流程
- 恢复逻辑必须优先依赖当前 `.claw` canonical state，而不是 recent tool use 或 thread 内瞬时推断
- 如果 session-bound active workflow 能够恢复，startup payload 需要把当前 plan content 一并带回 JSON / additional prompt surface，方便 resumed agent 直接续跑而不必先重新打开 plan

同时，startup 恢复只在能够确认当前 session 对应的 active workflow 时才应该注入最小 workflow contract；否则应保持现有 startup 行为不变，避免创造额外 recover prompt 干扰 `using-claw-kit` 的默认入口。

随着 Goal mode 与 delegated specialists 真正进入日常执行流，默认 startup prompt 还需要承担一个额外约束：它既要保持最小化，避免重复低价值状态信息，也要明确声明当前 thread 已授权使用 Goal mode、`truth-writer` 与 `adr-writer`，防止 agent 误把“等待用户再次授权”当成合法分支。

## Decision

统一使用一条 `SessionStart` 恢复流来承接 `.claw` 项目的 startup recovery，并把 session 绑定信息落到 task metadata：

- `plan write` 记录当前 host 的 `ownerSessionKey`
- `SessionStart` 不再按 hook source 区分 `startup`、`resume`、`compact` 的恢复逻辑
- `SessionStart` 启动时尝试从 `.claw` 中恢复与当前 `ownerSessionKey` 绑定的 active workflow
- 恢复成功时，只注入最小 workflow snapshot 和基于当前 canonical state 重算得到的 `workflowGuidance`
- 恢复成功时，额外把当前 plan content 放进 recovered JSON / additional prompt surface，但仍然保持最小化，不重复 project root、`.claw` 路径或 raw 计划历史
- 注入内容只包含继续执行所需的最小 contract，不重复 project root、`.claw` 路径或 raw `plan.json`
- 如果没有可恢复的 active workflow，则保持精简版 startup 提示：保留 `.claw` 项目识别、`using-claw-kit` 入口、当前 thread 对 Goal mode / required delegated subagents 的显式授权，以及 “follow workflowGuidance” 合同
- 默认 startup prompt 不再重复 project root、protocol check、或要求 agent 先 “report recovered harness state”

## Consequences

- Codex compact 后的同线程继续对话可以自动回到当前 session 已绑定的 workflow，而不是重新靠 prompt 猜测上下文
- resumed agent 可以直接看到当前 plan content，因此恢复后的第一轮更像“继续执行”而不是“重新发现计划”
- startup recovery 继续保持为 enhancement，而不是替代 `plan write`、`plan edit`、`plan done` 和 truth/ADR deposition 的 correctness 机制
- workflow 恢复与 `workflowGuidance` contract 保持一致，减少 adapter 在 compact 后自行发明下一步的空间
- 没有 active workflow 时，系统仍然退回现有 `using-claw-kit` 入口，不增加新的恢复文案分支
- 默认 startup prompt 现在也成为 adapter contract 的一部分：它负责声明 thread-local authorization，减少 Goal mode 与 delegated specialists 的误阻塞
- 历史版本实跑对比进一步说明，startup feel 的风险不在于它“过重”本身，而在于一旦把 startup recovery 暴露成独立入口，它就会与 `plan write`、`process.active` 并列竞争主 agent 的注意力，稀释 task-scope 主流程
- 因此较早版本也不应被概括成“普遍更轻”；durable 结论是 startup surface 必须收敛到恢复当前 workflow contract，而不能扩张成另一个显式 workflow 起点
- active adapter surface 现已统一采用 `startupRecovery` 命名；这类恢复结果属于 hook/runtime 侧状态，而不是用户面前的另一条 workflow skill

## Related Code

- `packages/cli/src/cli.ts`
- `packages/cli/test/cli.test.ts`
- `packages/core/src/context.ts`
- `packages/core/src/plan.ts`
- `packages/core/src/types.ts`
- `packages/codex-adapter/hooks/session-start-recovery.mjs`
- `packages/codex-adapter/hooks/hooks.json`

## Search Terms

- `ownerSessionKey`
- `SessionStart`
- `compact`
- `workflowGuidance`
- `active workflow snapshot`
