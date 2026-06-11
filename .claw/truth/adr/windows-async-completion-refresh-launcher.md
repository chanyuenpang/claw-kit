# ADR: Windows Async Completion Refresh Launcher

## Status

Accepted

## Context

`claw plan done` 需要同时满足两个约束：

- 主 CLI 要立刻向调用方返回 JSON 结果，供 Codex / hook / shell capture 继续消费 `workflowGuidance`
- completion refresh 仍然要在后台异步继续跑 project memory reindex 和可选的 GitNexus refresh

在 Windows 上，直接从主 CLI 进程里用 `spawn(... detached: true, stdio: "ignore"); child.unref()` 启动 completion refresh，会让调用面的 stdout 捕获丢失 `plan.done` JSON。最小 Node 复现也会触发同样问题，因此这不是 plan 逻辑错误，而是 Windows 终端 / capture 对这种后台化模式的兼容性问题。

与此同时，completion refresh 里的 project embedding 可能有明显冷启动时间；如果没有显式状态推进和超时，后台 node 进程会看起来像泄露或卡死。

## Decision

- Windows 下的 completion refresh 不再由主 CLI 进程直接 `detached + unref`。
- 主 CLI 改为先写 `queued` status file，再通过外部 PowerShell `Start-Process` launcher 启动 `internal-completion-refresh`。
- `internal-completion-refresh` 启动后会先把 status file 更新为 `running`，完成后再写最终成功或失败 payload。
- `packages/core/src/memory.ts` 对 `embedding-worker.js` 增加默认 30 分钟硬超时；超时会在失败 payload 中写出 `timedOut` 和 `timeoutMs`。

## Consequences

- Windows 上 `claw plan done` 可以继续稳定返回 JSON，同时保留异步 completion refresh。
- 长时间本地 embedding 冷启动不再只表现成永远停留在 `queued`；至少可以看到 `running` 状态。
- embedding worker 如果真的挂住，不会无限期占住 completion-refresh node 进程和 sqlite lock。
- completion refresh 仍然可能因为已有 worker 占用 sqlite 而失败，因此并发控制仍然是后续可继续加强的方向，但这次 release 已经消除了最直接的 stdout 回归和无限挂起风险。

## Related code

- `packages/cli/src/cli.ts`
- `packages/core/src/memory.ts`
- `packages/core/test/core.test.ts`
- `packages/cli/test/cli.test.ts`

## Search Terms

- `plan done`
- `completion refresh`
- `internal-completion-refresh`
- `embedding-worker`
- `timedOut`
- `Start-Process`
