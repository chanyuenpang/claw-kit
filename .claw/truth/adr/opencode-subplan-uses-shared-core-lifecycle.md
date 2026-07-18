# ADR: opencode subplan 使用共享 core 生命周期

## Status

Accepted

## Context

`Compare-Codex-traditional-search-vs-claw-search-for-opencode-subplan-support` 计划澄清了本次判断对象：权威目标是本地 `claw-kit` 的 opencode plugin / adapter，而不是 upstream `anomalyco/opencode`。

本地证据显示，subplan 能力已经在共享 core plan lifecycle 中实现：`packages/core/src/plan.ts` 负责 `createSubplan`、父任务 `execution.type = "subplan"` 标记、子计划 `parentPlan` / `parentTaskId` 关联，以及 `completeSubplanAndResumeParent` 返回父计划继续执行。CLI 通过 `claw subplan create` 暴露这条能力。opencode adapter 通过 host wiring 选择 OpenCode 输入并注入 `CLAW_GUIDANCE_CONFIG`，再消费同一套 `claw hook SessionStart` / `workflowGuidance` 合同，而不是维护一套独立的 opencode-only subplan engine；`CLAW_HOST` 的输入合同见 `invocation-host-handling.md`。

## Decision

opencode 的 subplan 行为归属于共享 `@veewo/claw-core` plan lifecycle：

- subplan 创建、父子计划关系、完成后恢复父计划都由 `packages/core/src/plan.ts` 统一实现。
- CLI / host adapter 只负责暴露、调用和注入宿主语义；不得在 `packages/opencode-adapter` 中复制一套平行的 subplan 状态机。
- opencode 专属差异应继续通过 host wiring 表达，例如 `CLAW_HOST = "opencode"`、`CLAW_GUIDANCE_CONFIG`、session context 注入和 OpenCode plugin hook，而不是改变 subplan lifecycle 的 ownership；`CLAW_HOST` 的 invocation 输入合同由 `invocation-host-handling.md` 单独拥有。

## Alternatives

在 `packages/opencode-adapter` 内实现 opencode-only subplan engine：会让父子计划状态、恢复父计划、completion hook、测试覆盖和 CLI 行为与 core 生命周期分叉，后续 Codex / OpenCode 行为也更容易漂移。

把 upstream `anomalyco/opencode` 是否支持 subplan 当作本地功能判断依据：会误判 `claw-kit` plugin / adapter 的实际能力，因为本地 subplan 是 `claw-kit` 自己的 core lifecycle 加 host wiring，不依赖 upstream opencode 原生功能。

## Consequences

- Codex、OpenCode 和 CLI 共享同一套 subplan 数据模型和恢复语义。
- opencode adapter 的长期职责边界更清晰：负责 OpenCode 注入面与配置隔离，不拥有 plan lifecycle 业务逻辑。
- 回归测试应优先覆盖 core / CLI subplan 行为，再用 opencode plugin 测试确认 host wiring 没有破坏共享合同。
- 后续调查 opencode subplan 功能时，应先检查本地 `claw-kit` plugin / adapter 和 core implementation，而不是从 upstream opencode 仓库事实直接推断。

## Related Code

- `packages/core/src/plan.ts`
- `packages/core/src/completion-hooks.ts`
- `packages/core/src/types.ts`
- `packages/cli/src/cli.ts`
- `packages/opencode-adapter/plugin/index.ts`
- `packages/core/test/core.test.ts`
- `packages/cli/test/cli.test.ts`
- `.claw/tasks/Compare-Codex-traditional-search-vs-claw-search-for-opencode-subplan-support/plan.json`

## Search Terms

- `opencode`
- `subplan`
- `createSubplan`
- `completeSubplanAndResumeParent`
- `parentPlan`
- `parentTaskId`
- `CLAW_HOST`
- `CLAW_GUIDANCE_CONFIG`

