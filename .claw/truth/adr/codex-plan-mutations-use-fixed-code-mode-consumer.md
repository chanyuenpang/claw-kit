# ADR: Codex plan mutations use a fixed code-mode consumer

## Status

Accepted

## Context

Codex 的 claw plan mutation 会同时产生 CLI JSON 和需要调用原生 host tools 的 `hostActions`。如果让 Agent 在 `hostActions`、`workflowGuidance.goalTool` 和分离 host 调用之间自行选择，action 顺序、幂等性、字段投影和 Goal Mode 调用次数都会依赖临场判断。

公开的 Codex 插件接口不能让 CLI 子进程直接调用 `update_plan`、`create_goal` 或 `update_goal`；这些原生 host tools 只能从 code-mode 的 `tools` namespace 调用。同时，code-mode isolate 不能直接 import 本地插件模块。

## Decision

Codex adapter 的所有 claw plan mutations 只走固定的单调用 code-mode consumer：

- Agent 只向 `runClawPlanMutation` 提供 claw command、working directory 和 timeout，不解释或手写 action dispatch。
- consumer 解析 CLI JSON，并按返回顺序消费 `hostActions`；每个 action 按 `id` 至多成功执行一次。
- `hostActions` 是 Codex 唯一的 host 执行源。`workflowGuidance.goalTool` 继续作为 core 和其他 host 的兼容合同存在，但 Codex 不解释、不执行，也不据此补建或重试 action。
- consumer 只白名单调用 `update_plan`、`create_goal` 和 `update_goal`，且只把经过验证的 `input` 投影给 host tool；`meta` 等策略字段不得透传。
- 未知 `schemaVersion`、未知 tool、不兼容 input 或缺失 host tool 一律 fail closed。Codex 不提供 direct-call 或 split-call fallback。
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md` 内嵌固定 `runClawPlanMutation` driver，以便在 isolate 内直接执行；`packages/codex-adapter/scripts/code-mode-host-action-consumer.mjs` 保留为完整、可复用且可测试的 source contract。

## Alternatives Considered

- 让 Agent 判断 `hostActions` 与 `goalTool`：拒绝，因为会把顺序、去重和重复 Goal Mode 调用风险重新交给提示词解释。
- CLI 子进程直接调用 Codex host tools：拒绝，因为公开插件接口没有提供这条能力边界。
- code mode 失败后退回分离 host 调用：拒绝，因为 fallback 会绕过同一程序内的 schema 校验、幂等性和字段白名单。
- 在 isolate 内 import consumer 模块：不可行，因为当前 code-mode isolate 不能直接 import 本地插件模块。

## Related Code

- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/codex-adapter/scripts/code-mode-host-action-consumer.mjs`
- `packages/codex-adapter/hooks/code-mode-host-action-consumer.test.mjs`
- `packages/codex-adapter/hooks/subagent-contract.test.mjs`
- `packages/codex-adapter/references/workflow-guidance-consumption.md`
- `packages/cli/src/cli.ts`
- `packages/cli/test/cli.test.ts`

## Consequences

- Codex 的计划镜像和 Goal Mode 生命周期由 CLI 投影的同一组 `hostActions` 驱动，避免 `goalTool` 造成第二次调用。
- action 的 schema、顺序、幂等性、input 边界和 tool 白名单成为可测试的程序合同，不再依赖 Agent 判断。
- host tool 不可用或合同不兼容时会显式停止；调用方必须修复程序或接口版本，而不能静默绕过合同。
- 内嵌 driver 与独立 source contract 必须通过合同测试保持语义一致。

## Search Terms

- `runClawPlanMutation`
- `code-mode-host-action-consumer`
- `hostActions`
- `goalTool compatibility`
- `schemaVersion`
- `action idempotency`
- `fail closed`
- `direct-call fallback`
- `split-call fallback`
