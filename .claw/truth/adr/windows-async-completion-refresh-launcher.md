# ADR: Windows Async Completion Refresh Launcher

## Status

Accepted — 2026-11-12 的机会式维护决策取代历史必达补偿合同。

## Context

计划终态、知识完成与派发是业务事实；索引刷新和任务归档是可重建的维护工作。此前为补齐 commit → enqueue 的崩溃窗口，系统扫描历史计划、job、runtime receipt 和日志，重建刷新 intent。日志副本又可能被识别成待办，使一次维护故障扩散为后续入口的重复工作。

用户明确选择多次独立机会下的尽力执行，而非维护必达。一项任务的维护失败不得阻断其他任务、只读恢复、业务响应或知识整理。

## Decision

- 保留当前计划进入终态、首次成功 knowledge.done，以及已有 direct / knowledge.complete 显式入口的单次后台维护机会。只读入口和非终态命令不触发刷新补偿。
- 删除历史事实扫描、recovery worker/scheduler、durable refresh receipt、日志反推待办、镜像传播、dirty hash 和 trailing refresh cycles。不自动导入或重试旧维护记录；已有文件留作诊断，不迁移、不改写。
- 每次机会处理当时状态，不等待旧任务成功。启动失败、进程崩溃或本次操作失败后放弃该次机会；下一次独立机会可以再次刷新当前内容，但不是重放旧请求。不承诺无新入口时的进展或一定完成。
- 业务提交与 knowledgeDispatch 仍由原 owner 执行；不重放 mutation/writer，不删除业务恢复、必要迁移或知识整理。已迁移且无遗留 marker 的 Core 无锁快路径保持不变。
- 同一项目的刷新使用 Core tryWithFileLock 与稳定的 runtime/completion-refresh/worker 资源互斥。忙时直接记录 skipped，不等待、不加入队列。进程退出释放 OS 锁；不根据 PID/TTL 抢锁，不删除 mutex sidecar。
- 旧 logs/completion-refresh/inflight.lock 存在时，仅跳过本次可选维护，避免与旧协议 writer 并发；不在新任务入口清锁。升级清理遵守 resource-mutex 的离线停写边界。
- worker 内各项维护独立捕获失败，某项失败不阻止其他维护项。GitNexus 已有的有界命令级兼容回退不扩张为跨任务补偿。
- 每次机会最多写一份 queued / running / finished 或 skipped 日志，只有诊断作用。日志写失败不阻止维护，旧日志永不被读取为授权、进度 owner 或待办。
- Windows 保留外部 PowerShell Start-Process 启动方式，避免直接 detached Node 破坏 foreground stdout 捕获。launcher 仅在启动确认前保持引用，启动预算五秒；绝不等待维护完成。worker 使用专用 completion-refresh-entry，不再经过主 CLI 或 recovery entry。
- project embedding 的既有超时与短写事务保持不变；GitNexus 准备与 analyze 仍只在后台运行。维护失败不撤销业务结果。

## Alternatives

- 保留 durable receipt 并为日志增加更多去重/迁移协议：拒绝。维护不必达，不应再维护第二套恢复状态机。
- 删除共享资源互斥：拒绝。同一索引并发写可能损坏数据，尽力执行不等于允许并发破坏。
- 重放业务提交来补维护缺口：拒绝。未知结果只影响精确操作，不能成为重复业务副作用的理由。

## Consequences

- 异常退出可能漏掉一次刷新或归档；索引暂时过期、旧任务暂时保留是接受的代价。后续独立机会或显式维护处理当前状态。
- 历史维护记录不会在新任务入口复活或增殖；资源忙只跳过本次维护，不阻断其他业务。
- 维护没有成功保证；日志缺失也不是业务失败或需要重新完成计划的证据。

## Related code

- [刷新与互斥](../../../packages/cli/src/completion-refresh.ts)
- [专用 worker](../../../packages/cli/src/completion-refresh-entry.ts)
- [当前命令机会](../../../packages/cli/src/command-service.ts)
- [迁移快路径](../../../packages/core/src/task-layout-migration.ts)
- [恢复隔离回归](../../../packages/cli/test/completion-refresh-recovery.test.ts)
- [任务隔离回归](../../../packages/cli/test/completion-refresh-scheduler.test.ts)
- [互斥升级边界](../../../docs/resource-mutex.md)

## Search Terms

best effort; opportunistic maintenance; completion refresh; Start-Process; failure isolation; skipped busy; no historical recovery; no durable refresh receipt

<!-- state: history -->
## Evolution history

<!-- dated: 2026-08-02 -->
### Moved GitNexus preparation behind terminal dispatch

The launcher initially assumed a foreground GitNexus embeddings preflight whose completed analyze could be reused by the background worker. That still left terminal dispatch coupled to dependency readiness. The accepted route now queues all GitNexus preparation and both memory reindexes into detached completion refresh after terminal state and knowledge dispatch are durable.

<!-- dated: 2026-10-15 -->
### Move session-command recovery scans out of the response budget

Session commands previously reconciled historical terminals and refresh statuses synchronously before and after the business owner. Scanning, hashing, lock waits and worker launches could therefore consume a transport timeout either before the mutation or after its commit. Session commands now schedule a separate maintenance-only recovery worker after the owner attempt. Receipt reads still bypass recovery; `knowledge.done` schedules it only after owner success. Recovery reconstructs intent from canonical facts and never replays a business command.

On Windows the asynchronous PowerShell launcher remains referenced only until `Start-Process` acknowledges worker creation, with a five-second startup bound. Immediately unreferencing the launcher lost recovery in a real one-shot CLI regression even though its JSON reply succeeded. After acknowledgment, neither launcher nor its output pipe keeps the foreground CLI alive; a surviving daemon still observes worker exit to coalesce requests and perform a trailing scan. The existing project reconciliation and refresh single-flight locks remain authoritative across processes. A process dying before launch still relies on the next system entry, not mutation replay.

<!-- dated: 2026-11-12 -->
### Replace required recovery with independent best-effort opportunities

The owner explicitly accepts missed maintenance after crashes. Historical scans, refresh intents, log replay, coalescing and trailing cycles are removed. Current completion opportunities launch a fresh one-shot worker; a busy project mutex skips only that attempt. Canonical workflow/knowledge recovery and the Windows startup acknowledgment remain separate. Old maintenance artifacts are not upgraded or resumed.
