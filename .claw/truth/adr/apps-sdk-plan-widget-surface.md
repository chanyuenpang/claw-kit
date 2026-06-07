# ADR: Apps SDK plan widget surface

## Status

Superseded

Superseded by: `abandon-apps-sdk-widget-route.md`

## Context

完成的 `claw-kit-flow-smoke` 计划确认：markdown chat rendering 不是计划 UI app-surface 需求的成功标准。`claw-kit` 需要一条真实的嵌入式 React 展示路径，同时继续保持默认计划变更输出 compact、render-first，避免在 `claw plan write`、`claw plan edit`、`claw plan done` 中回放或塞入完整 widget 数据。

完成的 `apps-sdk-plan-widget-server` 计划进一步确认：在接入完整 MCP SDK 或真实 Codex/ChatGPT host 之前，应该先用本地可运行的 Apps SDK-style tool/resource/preview contract 验证 widget envelope、UI template 和预览输出；Codex IAB 对本地 URL 的阻断属于 host-integration boundary，不代表 `claw-kit` widget contract 失败。

## Decision

将 React plan widget 的宿主边界固定为 Apps SDK MCP/App surface：

- widget 数据从 canonical `PlanViewModel` 派生为 Apps SDK `structuredContent` / tool result
- widget template 固定为 `ui://claw-kit/plan-widget.html`
- 默认计划 mutation 命令继续返回 compact render，不把完整 widget envelope 作为默认输出
- 显式 CLI 入口使用 `claw plan app` 生成 Apps SDK widget envelope
- widget 原型展示 collapsed summary、可展开 Goal，以及 unfinished-first Tasks
- 在 `apps-sdk-adapter` 中先使用 zero-dependency HTTP server prototype 暴露 health、tool result、UI resource 和 preview routes，再决定是否引入完整 MCP SDK dependency
- 本地 server prototype 复用 `claw plan app` / `PlanViewModel` 派生出的 canonical widget state，不把 raw `plan.json` 作为 widget state contract
- Codex IAB local URL blocking 记录为 host boundary；只有真实 host connection 验证通过后，才能把它视为端到端嵌入成功
- 本地 Codex plugin skills 只负责工作流引导；iframe widget 分发必须走 Apps SDK MCP/App surface，而不是 markdown chat rendering

## Consequences

- plan widget 有明确的 app-surface 集成边界，不再把 markdown 渲染误认为 React UI 完成态
- CLI mutation 输出保持轻量，聊天面板仍可立即显示计划状态
- 后续 Apps SDK server 实现需要遵守同一份 `structuredContent` contract 和 `ui://claw-kit/plan-widget.html` template
- zero-dependency prototype 降低早期验证成本，但也明确保持为 local prototype，不能替代真实 host/MCP 集成验证
- local URL blocking 的失败会被归类为 Codex IAB 宿主限制，避免误改 widget contract 或 core plan model
- `@claw-kit/apps-sdk-adapter` 成为 plan widget contract 与 React prototype 的长期承载位置

## Related Code

- `packages/apps-sdk-adapter/src/plan-widget-contract.ts`
- `packages/apps-sdk-adapter/src/server-runtime.ts`
- `packages/apps-sdk-adapter/src/server.ts`
- `packages/apps-sdk-adapter/src/plan-widget-html.ts`
- `packages/apps-sdk-adapter/test/server-runtime.test.ts`
- `packages/apps-sdk-adapter/web/PlanWidget.tsx`
- `packages/apps-sdk-adapter/server/README.md`
- `packages/cli/src/cli.ts`
- `docs/2026-06-06-apps-sdk-plan-widget-server.md`
- `docs/2026-06-06-codex-app-surface-notes.md`

## Search Terms

- `Apps SDK`
- `structuredContent`
- `ui://claw-kit/plan-widget.html`
- `claw plan app`
- `PlanViewModel`
- `zero-dependency HTTP server`
- `Codex IAB local URL blocking`
