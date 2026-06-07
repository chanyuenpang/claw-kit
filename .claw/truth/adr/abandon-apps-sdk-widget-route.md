# ADR: Abandon Apps SDK widget route

## Status

Accepted

## Context

完成的 `remove-app-widget-route` plan 确认：`claw-kit` 不再继续 Apps SDK、app/widget 或 chat-rendering 路线。此前的 React plan widget、`claw plan app`、Apps SDK-style tool/resource/preview contract、renderer skills 和相关文档会把项目带向另一条宿主集成路线，但当前项目目标是保持 CLI-driven `.claw` harness workflow。

这不是暂缓实现，而是架构边界的取舍：`claw-kit` 的一方工作流应围绕本地 CLI、`.claw` project state、compact guidance 和 delegated deposition 运行，而不是维护额外 app/widget surface。

## Decision

完全放弃 Apps SDK / app / widget / chat-rendering 路线，并删除对应 package、命令、renderer skill、测试与文档入口。

`claw-kit` 保持 CLI-driven `.claw` harness：

- plan 命令输出 compact `workflowGuidance`
- plan 命令同时提供 `planSummary`，用于主线程快速理解当前计划状态
- 不再保留 deprecated app/widget compatibility commands
- 不再把 Apps SDK widget envelope 或 chat renderer 作为计划展示契约
- `truth-writer` 与 `adr-writer` 继续通过子代理沉淀 truth/ADR

## Consequences

- 项目架构重新收敛到 CLI/core 和 `.claw` canonical state，减少 Apps SDK host boundary 带来的维护面。
- Codex adapter 继续消费 CLI 返回的 compact `workflowGuidance` 与 `planSummary`，而不是维护独立 app/widget 渲染路径。
- 完成期知识沉淀仍保持 specialist 化，主线程只传递 completed `plan.json` bundle，不把 writer 流程内联为普通聊天输出。
- 未来如需 UI surface，需要作为新的显式架构决策重新提出；旧的 `claw plan app` 与 Apps SDK widget contract 不再是兼容目标。

## Related Code

- `packages/cli/src/cli.ts`
- `packages/cli/test/cli.test.ts`
- `packages/codex-adapter/skills/`
- `.claw/tasks/remove-app-widget-route/plan.json`

## Search Terms

- `Apps SDK`
- `app/widget`
- `chat-rendering`
- `workflowGuidance`
- `planSummary`
- `truth-writer`
- `adr-writer`
- `CLI-driven .claw harness`
