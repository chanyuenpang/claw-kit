# CLI-driven plan output contract

## 结论

- `claw-kit` 已明确放弃 Apps SDK / app / widget / chat-rendering 路线；这些不再是产品或架构主线。
- 主线是 CLI-driven `.claw` harness：agent 通过 `claw` CLI 操作 `.claw/` 项目状态，并消费 CLI 返回的 compact guidance。
- `claw plan write`、`claw plan edit`、`claw plan done` 的对外协调合同是 `workflowGuidance` 和 `planSummary`，而不是 render blocks、widget envelope 或 raw `plan.json` 回放。
- `planSummary` 来自 canonical `PlanViewModel.collapsedSummary`，用于给聊天协作提供紧凑状态摘要。
- `PlanViewModel` 仍可作为 core 内部摘要模型存在，但不再承载跨 surface app/widget/chat-rendering 路线。
- 不再提供或维护 `claw plan app`、`claw plan render`、`packages/apps-sdk-adapter`、`plan-chat-renderer` skill、Apps SDK widget 参考文档或相关 app surface 合同。

## 真实代码锚点

- 计划生命周期与 `workflowGuidance` 生成：`packages/core/src/plan.ts`
- 下一步 workflow guidance 合同：`packages/core/src/workflow-guidance.ts`
- `PlanViewModel.collapsedSummary` 来源：`packages/core/src/plan-view.ts`
- CLI compact 输出与 `planSummary` 裁剪：`packages/cli/src/cli.ts`
- 当前 CLI 测试断言 `planSummary`：`packages/cli/test/cli.test.ts`
- 当前 Codex workflow skills 消费 `workflowGuidance` 和 `planSummary`：`packages/codex-adapter/skills/using-claw-kit/SKILL.md`、`packages/codex-adapter/skills/plan-workflow/SKILL.md`

## 迁移含义

- Future agents 不应恢复 Apps SDK widget、plan app、plan render 或 chat render blocks，除非有新的明确产品决策覆盖这条 truth。
- Codex adapter 在计划变更后只需要根据 `workflowGuidance.nextStep`、`workflowGuidance.delegateSubagents`、`workflowGuidance.askUser`、`workflowGuidance.goalMode` 和 `planSummary` 协调下一步。
- 需要稳定重读计划内容时，使用现有 plan/task 文件和 CLI show 类命令；不要重新引入 render-specific surface。

## `remove-app-widget-route` 完成结果

- `packages/apps-sdk-adapter` 已删除。
- CLI 已移除 `claw plan app` / `claw plan render`。
- core 已移除 plan chat render helper、相关 type 和测试。
- Codex adapter 已移除 `plan-chat-renderer` skill 和 app/widget/chat-rendering 参考文档。
- README 已删除 plan widget prototype 说明。
- Codex plugin 描述、`using-claw-kit`、`plan-workflow` 已改为只消费 `workflowGuidance` + `planSummary`。
- 插件缓存已同步；验证基线为 `npm run check` 和 `npm test` 通过。
