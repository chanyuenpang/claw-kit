# ADR: Windows Async Completion Refresh Launcher

## Status

Accepted

## Context

`claw plan done` 需要同时满足两个约束：

- 主 CLI 要立刻向调用方返回 JSON 结果，供 Codex / hook / shell capture 继续消费 `workflowGuidance`
- completion refresh 仍然要在后台异步继续跑 project memory reindex 和可选的 GitNexus refresh

在 Windows 上，直接从主 CLI 进程里用 `spawn(... detached: true, stdio: "ignore"); child.unref()` 启动 completion refresh，会让调用面的 stdout 捕获丢失 `plan.done` JSON。最小 Node 复现也会触发同样问题，因此这不是 plan 逻辑错误，而是 Windows 终端 / capture 对这种后台化模式的兼容性问题。

与此同时，completion refresh 里的 project embedding 可能有明显冷启动时间；如果没有显式状态推进和超时，后台 node 进程会看起来像泄露或卡死。2026-07-06 的历史事故还表明，重叠 completion refresh 会把多个 GitNexus analyze 送入同一 `.gitnexus/lbug`，并形成 shadow/WAL mismatch、锁失败、allocation failure 到 `0xC0000005` 的高置信度损坏链；因此 single-flight 也是数据完整性决策，不只是减轻重复工作的优化。

## Decision

- Windows 下的 completion refresh 不再由主 CLI 进程直接 `detached + unref`。
- 主 CLI 改为先写 `queued` status file，再通过外部 PowerShell `Start-Process` launcher 启动 `internal-completion-refresh`。
- `internal-completion-refresh` 启动后会先把 status file 更新为 `running`，完成后再写最终成功或失败 payload。
- `packages/core/src/memory.ts` 对 `embedding-worker.js` 增加默认 30 分钟硬超时；超时会在失败 payload 中写出 `timedOut` 和 `timeoutMs`。
- completion refresh 使用 `.claw/logs/completion-refresh/inflight.lock` 作为项目级 leader / single-flight 锁；重叠请求把 status files、operations 与 dirty hash 合并到当前 leader，而不是并行重复刷新。
- leader 观察到 dirty hash 变化时补跑 refresh cycle，但最多执行 `3` 个 cycles；状态持久化 `dirtyHash`、`refreshCycles` 与 `coalescedCount`。
- project embedding 在 SQLite 写事务外生成，最终 vector insert 才进入短事务，避免模型计算长期持有数据库写锁。
- `claw plan done` 的 GitNexus embeddings preflight 若已完成 analyze，后台 refresh 复用结果并跳过重复 analyze；瞬时 busy / locked 按 `100ms`、`250ms` 有界退避重试。
- Windows `.cmd` 子进程显式通过 `cmd.exe` 启动，不使用 `shell: true` 参数拼接。

## Consequences

- Windows 上 `claw plan done` 可以继续稳定返回 JSON，同时保留异步 completion refresh。
- 长时间本地 embedding 冷启动不再只表现成永远停留在 `queued`；至少可以看到 `running` 状态。
- embedding worker 如果真的挂住，不会无限期占住 completion-refresh node 进程和 sqlite lock。
- overlapping closeout 只执行一个有效 leader refresh；dirty 变化被有界 coalescing 吸收，同时保留状态可观察性与失败重试边界。
- 同一项目不会再由 completion refresh 并发启动多个 GitNexus analyze 去交错替换 LadybugDB 文件，从而封住 2026-07-06 历史事故所暴露的主要损坏路径。
- embedding 短事务降低 SQLite 写锁竞争；GitNexus preflight/analyze 去重与有界退避降低同一 closeout 内的重复工作和瞬时锁失败。
- 显式 `cmd.exe` 启动消除 Windows 参数拼接的 Node `DEP0190`，同时保持后台 one-shot fallback 与失败可见性。

## Related code

- `packages/cli/src/cli.ts`
- `packages/core/src/memory.ts`
- `packages/core/test/core.test.ts`
- `packages/cli/test/cli.test.ts`
- `.claw/tasks/实施-claw-kit-第二阶段端到端性能与流程优化/plan.json`

## Search Terms

- `plan done`
- `completion refresh`
- `internal-completion-refresh`
- `embedding-worker`
- `timedOut`
- `Start-Process`
- `inflight.lock`
- `single-flight`
- `coalescing`
- `dirtyHash`
- `refreshCycles`
- `coalescedCount`
- `GitNexus analyze dedupe`
- `DEP0190`
