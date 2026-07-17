# ADR: Codex plan mutations use a fixed code-mode consumer

## Status

Accepted

## Context

Codex 的 claw plan mutation 会同时产生 CLI JSON 和需要调用原生 host tools 的 `hostActions`。如果让 Agent 在 `hostActions`、`workflowGuidance.goalTool` 和分离 host 调用之间自行选择，action 顺序、幂等性、字段投影和 Goal Mode 调用次数都会依赖临场判断。

公开的 Codex 插件接口不能让 CLI 子进程直接调用 `update_plan`、`create_goal` 或 `update_goal`；这些原生 host tools 只能从 code-mode 的 `tools` namespace 调用。同时，code-mode isolate 不能直接 import 本地插件模块。

真实 Host lifecycle 验收推翻了 `schema-v2 ensure_goal` 方案：依赖当前 Goal 状态或 host error text 做补偿会把宿主内部状态重新泄漏给 consumer；在同一个 code-mode call 中先 complete 再 create 也不可行，因为 Codex 在调用结束时结算 complete，并会清掉同调用中新建的 Goal。`0.1.75` 因此改为由 CLI 按 mutation 提交后的 plan 状态投影 schema-v1 原生 Goal actions，并以跨调用 lifecycle 验证其行为。

## Decision

Codex adapter 的所有 claw plan mutations 只走固定的单调用 code-mode consumer：

- Agent 只向 `runClawPlanMutation` 提供 claw command、working directory 和 timeout，不解释或手写 action dispatch。
- consumer 解析 CLI JSON，并按返回顺序消费 `hostActions`；每个 action 按 `id` 至多成功执行一次。
- `hostActions` 是 Codex 唯一的 host 执行源。`workflowGuidance.goalTool` 继续作为 core 和其他 host 的兼容合同存在，但 Codex 不解释、不执行，也不据此补建或重试 action。
- consumer 只白名单调用 `update_plan`、`create_goal` 和 `update_goal`，且只把经过验证的 `input` 投影给 host tool；`meta` 等策略字段不得透传。
- Goal action 继续使用 schema-v1 原生命令，不引入 `ensure_goal` pseudo-action，也不匹配 host error text 或读取当前 Goal 状态。
- CLI 只按 mutation 提交后的 plan 状态路由 Goal action：`process.wait` / `process.discussing` 发出 `update_goal(status="complete")`，进入或恢复 `process.active` 发出 `create_goal`，`end.completed` 发出 `update_goal(status="complete")`。
- consumer 逐条执行 CLI 返回的 action；不能在同一个 code-mode call 中合并 complete→create，resume 的 `create_goal` 必须位于后续 mutation call。
- 未知 `schemaVersion`、未知 tool、不兼容 input 或缺失 host tool 一律 fail closed。Codex 不提供 direct-call 或 split-call fallback。
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md` 内嵌固定 `runClawPlanMutation` driver，以便在 isolate 内直接执行；`packages/codex-adapter/scripts/code-mode-host-action-consumer.mjs` 保留为完整、可复用且可测试的 source contract。
- Goal lifecycle 变更发布前必须用未发布的本地构建通过真实 Host wait→active 验收：wait 后 Goal 为空，resume 后新 Goal 在跨调用结算后仍保持 active；单元合同测试不能替代该门禁。

## Alternatives Considered

- 让 Agent 判断 `hostActions` 与 `goalTool`：拒绝，因为会把顺序、去重和重复 Goal Mode 调用风险重新交给提示词解释。
- CLI 子进程直接调用 Codex host tools：拒绝，因为公开插件接口没有提供这条能力边界。
- code mode 失败后退回分离 host 调用：拒绝，因为 fallback 会绕过同一程序内的 schema 校验、幂等性和字段白名单。
- 在 isolate 内 import consumer 模块：不可行，因为当前 code-mode isolate 不能直接 import 本地插件模块。
- 使用 `ensure_goal`、查询 Goal 状态或匹配错误文本：拒绝，因为这些路径依赖不可移植的 host 内部状态与错误文案。
- 在同一 code-mode call 内先 complete 再 create：拒绝，因为调用结束时的 complete 结算会清掉同调用中新建的 Goal。

## Related Code

- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/codex-adapter/scripts/code-mode-host-action-consumer.mjs`
- `packages/codex-adapter/hooks/code-mode-host-action-consumer.test.mjs`
- `packages/codex-adapter/hooks/subagent-contract.test.mjs`
- `packages/codex-adapter/references/workflow-guidance-consumption.md`
- `packages/cli/src/cli.ts`
- `packages/cli/test/cli.test.ts`
- `.claw/tasks/实现-Goal-目标状态幂等保证并发布-0.1.72/plan.json`

## Consequences

- Codex 的计划镜像和 Goal Mode 生命周期由 CLI 投影的同一组 `hostActions` 驱动，避免 `goalTool` 造成第二次调用。
- action 的 schema、顺序、幂等性、input 边界和 tool 白名单成为可测试的程序合同，不再依赖 Agent 判断。
- plan-status router 消除 Goal 桥接对 Agent 所见历史状态、错误文本和补偿判断的依赖；source 与 versioned cache 中的 consumer/driver 必须保持该合同一致。
- wait/discussing 的 complete 与后续 resume create 分处不同 mutation calls，符合 Codex 的调用结束结算语义。
- 真实 Host lifecycle 成为 Goal action 发布门禁，避免仅靠 mock 或单元测试批准宿主时序错误。
- host tool 不可用或合同不兼容时会显式停止；调用方必须修复程序或接口版本，而不能静默绕过合同。
- 内嵌 driver 与独立 source contract 必须通过合同测试保持语义一致。

## Search Terms

- `runClawPlanMutation`
- `code-mode-host-action-consumer`
- `hostActions`
- `goalTool compatibility`
- `schemaVersion`
- `schema-v1 native Goal actions`
- `plan-status Goal router`
- `no ensure_goal`
- `no error-text matching`
- `complete then create across calls`
- `real Host lifecycle release gate`
- `action idempotency`
- `fail closed`
- `direct-call fallback`
- `split-call fallback`
