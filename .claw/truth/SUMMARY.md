# Claw Kit Truth Summary

- `claw-kit` 是从 OpenClaw 语义提炼出的 host-neutral harness core。
- Codex adapter 当前优先使用 prompt-driven bootstrap，而不是依赖 host hook 自动化；hook surface 只作为可选增强层。
- Codex 插件默认 hook 已收敛为 4 个 lifecycle hooks：`SessionStart`、`UserPromptSubmit`、`Stop`、`PreCompact`，每个命令都是 `claw hook <event>`。
- `claw hook` 必须先通过 `cwd` 解析 `.claw` project；解析不到 `.claw` 时返回 `skipped: true` 且不写日志，避免影响非 claw 用户。
- `.claw` project 内的 hook JSONL 写到 `%USERPROFILE%\.codex\claw-kit-hook.log`，并记录 `projectRoot`、`clawDir`、`projectId`、`projectName`。
- Codex-facing recall 术语是 `claw search`；计划写入前可以先运行 `claw search --query "<topic>"` 获取相关项目上下文。
- `claw memory ...` 仍保留为 legacy/debug 和底层 index 管理，不作为 Codex 主流程概念。
- Codex workflow 采用 investigation-first 规则：调查、分析、证据收集类 task 优先委派给 `researcher` specialist。
- `researcher` 默认合同为 `worker` + `gpt-5.4-mini` + 显式 `claw-kit:researcher` skill item；优先复用同线程已有 researcher。
- `researcher` 应先用 `claw search` 检索 `.claw` context、truth、ADR；若 `.claw/project.json` 中 `gitnexus.enabled = true`，应发现并使用 GitNexus 相关能力做代码调查。
- 任务范围通过 `claw plan write` 建立；planning 直接负责计划质量，不再依赖 standalone `plan-review` 作为单独 workflow gate。
- `claw-kit` 已明确放弃 Apps SDK / app / widget / chat-rendering 路线；不再维护 `apps-sdk-adapter`、`plan-chat-renderer` skill 或相关参考 surface。
- `claw plan write` / `claw plan edit` / `claw plan done` 现在返回 CLI-driven compact contract：`workflowGuidance` 和 `planSummary` 是主协调字段，不返回 render blocks，不提供 `claw plan app` / `claw plan render`。
- `remove-app-widget-route` 已删除 `packages/apps-sdk-adapter`、plan chat render helper/type/test、`plan-chat-renderer` skill 和 app/widget/chat-rendering 参考文档；验证基线是 `npm run check` 与 `npm test` 通过。
- Codex delegated specialists 可以在同线程复用同类型子代理；`truth-writer`、`adr-writer` 与 `researcher` 派发后保持可复用，不应在 dispatch 后立即关闭。
- `claw plan write` 与 `appendTasks` 已移除自动 truth follow-up；lighter model 的执行链是 normal task -> conditional `truth-writer` -> next task，而不是自动插入 `Update truth (if got valuable contexts)`。
- 当计划首次进入 `process.active` 时，`claw-kit` 可以基于 `plan.goal.text` 推荐 Codex thread goal；Goal mode 仍是 host-level thread feature，且不应自动覆盖已有 active goal。
- `release-truth-followup-publish` added ADR `release-truth-followup-workflow.md`, which freezes the no-auto-truth-followup contract and keeps truth deposition delegated to `truth-writer`.
