# OpenCode Subplan Support via Shared Core

## 结论

本地 `D:\Users\chany\Documents\claw-kit` 的 OpenCode subplan 支持不是来自 upstream `anomalyco/opencode` 的独立实现；它来自 claw-kit shared core 的 subplan 生命周期，再由 `packages/opencode-adapter/plugin/index.ts` 把 OpenCode host 环境接到同一套 CLI/core 路径上。

因此排查 OpenCode subplan 行为时，优先看本仓库的 `packages/cli/src/cli.ts`、`packages/core/src/plan.ts`、`packages/core/src/completion-hooks.ts` 和 `packages/opencode-adapter/plugin/index.ts`，不要把目标误定位到 upstream opencode。

## 真实调用链路

- `packages/cli/src/cli.ts` 暴露 `claw subplan create`，并在命令处理处调用 `createSubplan(...)`；返回 command source 为 `subplan.create` 的 compact plan result。
- `packages/core/src/plan.ts` 的 `createSubplan(...)` 在 task 根目录下派生与 root `plan.json` 同层的 flat child JSON，再走 `writePlan(...)`；文件名碰撞会显式失败。`writePlan(...)` 在有 `parentTaskId` 时写入 `parentPlan` / `parentTaskId`，把 parent task 的 `execution.type` 标记为 `subplan`，记录 `execution.subplan` / `execution.planPath`，并把当前 project-level session binding 切到 child plan。
- `packages/core/src/completion-hooks.ts` 的 `buildCompletionHooks(...)` 在 completed plan 同时带有 `parentPlan` 和 `parentTaskId` 时发出 `subplanClosureCandidate`。
- `packages/core/src/plan.ts` 的 `editPlan(...)` 收到 `subplanClosureCandidate` 后调用 `completeSubplanAndResumeParent(...)`，把 parent task 标记 done，将当前 session binding 恢复到 child 的 `parentPlan`，并基于 parent plan 返回下一步 `workflowGuidance`；root plan completion 则解除 binding。
- `packages/opencode-adapter/plugin/index.ts` 注入 `CLAW_HOST=opencode`，并在存在时注入 `CLAW_GUIDANCE_CONFIG=packages/opencode-adapter/workflow-guidance.opencode.json`，所以 OpenCode 侧 shell 调用同一个 `claw` CLI/core 生命周期，只替换 host-specific guidance。

## 验证锚点

- `packages/core/test/core.test.ts` 覆盖 `createSubplan uses the planning-aware default seed shape`、`createSubplan always uses planning shape even when project planning is disabled`，以及 `subplan completion resumes the parent plan and marks the parent task done`。
- 同一测试文件还覆盖直接 `writePlan(... parentTaskId ...)` 时 child plan 采用 flat sibling layout、碰撞显式失败、parent task execution 标记为 `subplan`，以及 session binding 在 child / `parentPlan` / root completion 之间正确切换。
- `packages/cli/test/cli.test.ts` 覆盖 CLI `subplan create` 与 `plan done` on subplan resume parent 的用户入口行为。

## 搜索比较结论

- 传统 `rg` / 文件阅读最适合确认精确本地代码、测试和 host glue。
- `claw search` 更适合召回较宽的 truth / ADR 背景，但这轮没有直接命中 subplan 实现本身。
- GitNexus 对 `createSubplan`、`completeSubplanAndResumeParent` 以及 `editPlan` 调用链定位很快，但对纯文本配置和 adapter host glue 弱于 `rg`。

## 关键检索词

- `subplan create`
- `createSubplan`
- `completeSubplanAndResumeParent`
- `subplanClosureCandidate`
- `parentPlan`
- `parentTaskId`
- `sessionKey -> planPath`
- `flat subplan JSON`
- `CLAW_HOST=opencode`
- `workflow-guidance.opencode.json`
