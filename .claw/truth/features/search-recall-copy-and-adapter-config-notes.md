# Search 与配置备忘收口

## 状态

这是 `claw-kit` 在 `2026-06-22` 这轮公开文案收口中沉淀下来的稳定事实。

## 核心事实

- root `README.md` 不再承载长篇 search-and-recall 说明；把那段内容删掉后，产品面入口更清爽。
- `packages/cli/README.md` 现在只保留一条短边界：`claw search` 用于保留的项目上下文，不是代码搜索；`GitNexus` 只是可选补充，不是必需路径。
- `packages/codex-adapter/references/project-config-reference.md` 和 `packages/opencode-adapter/references/project-config-reference.md` 适合作为备份配置注记，用来解释 `.claw/project.json` / `.claw/project-override.json`，但不应被描述成 harness contract，也不应被写成 required startup flow。
- 这类 round 的稳定作用范围是 README、包级 README 和 adapter reference 文档；它不应该被解读为 `SKILL.md`、plugin 逻辑或其他行为实现的变更。

## 影响

- 后续如果再收口公开文案，可以继续保持 root README 轻量、CLI README 只讲 recall boundary、adapter reference 只讲备份配置说明。
- 任何把 adapter reference 写成启动合同或 harness 必经步骤的文案，都会偏离这轮已确认的职责分层。

## 证据锚点

- `README.md`
- `packages/cli/README.md`
- `packages/codex-adapter/references/project-config-reference.md`
- `packages/opencode-adapter/references/project-config-reference.md`
