# Superseded Apps SDK plan widget server

## 结论

- Apps SDK plan widget server 原型已经被产品/架构路线废弃。
- `@claw-kit/apps-sdk-adapter`、`npm run serve:plan-widget`、`/tool/plan-widget`、`/resource/plan-widget.html`、`/preview?task=<task>`、`ui://claw-kit/plan-widget.html` 不再是当前 `claw-kit` 主线能力。
- 这份文档只保留废弃事实，避免 future agents 误把旧 Apps SDK prototype 当成仍需维护的 canonical surface。

## 当前主线

- 当前主线是 CLI-driven `.claw` harness。
- plan mutation 命令返回 compact `workflowGuidance` 和 `planSummary`。
- 不再返回 render blocks，不再提供 `claw plan app` / `claw plan render`，不再维护 Apps SDK app/widget/chat-rendering 参考路线。
- `remove-app-widget-route` 完成后，README、Codex plugin 描述和 workflow skills 都应只指向 `workflowGuidance` + `planSummary`。

## 真实代码锚点

- 当前 workspace package 目录不包含 `packages/apps-sdk-adapter`。
- 当前 Codex adapter skill 目录不包含 `plan-chat-renderer`。
- CLI compact `planSummary` 输出锚点：`packages/cli/src/cli.ts`
- CLI plan summary 覆盖测试：`packages/cli/test/cli.test.ts`
