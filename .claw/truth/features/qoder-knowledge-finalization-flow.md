# Qoder in-conversation 知识终结链路

<!-- state: current -->
## 结论

qoder host 没有 headless writer runner，也不依赖 codex-sdk runtime。knowledge finalization 在会话内完成，分为两个阶段：Stop hook（`claw hook auto-doc --host qoder`，stdin JSON payload）在排队 job 时快照 `truthSnapshotBefore` 作为治理基线且不启动 detached worker；下一次 SessionStart 把 pending qoder job 以 subagent-dispatch directive 注入 `additionalContext`，由 main agent 派发 `knowledge-writer` subagent 后运行 `claw internal-knowledge-finalize-record --job <path>` 完成记账。record 命令本身不运行 writer，只对基线 diff 执行治理、编码归一化、结果写回与 `succeeded` job 持久化。

该链路已通过真实 writer dispatch 端到端验证（2026-07-25）。

## 长期行为 / 规则

- `SUPPORTED_CLAW_HOSTS` 为 `codex`、`opencode`、`qoder`；qoder Stop hook 使用 `claw hook auto-doc --host qoder`，经 stdin 接收 JSON payload。qoder 的 Stop event 发送 `last_assistant_message` 而非 `message`，且不带 `turn_id`；CLI 以 `last_assistant_message` 为 message fallback、以 `session_id` 为 turn id fallback。
- sidecar 排队 finalization job 时，仅当 `host === "qoder"` 才在 job 上快照 `truthSnapshotBefore`（queue-time Truth Markdown 基线）。因为 writer 在会话内运行、record 时刻的 truth 目录已包含 writer 改动，治理必须使用排队时的基线而不是 record 时刻的快照。
- Stop hook 对 qoder job 不调用 `launchKnowledgeFinalizationWorker`；job 保持 `queued`，由下一次 SessionStart 重新浮出。detached worker（`internal-knowledge-finalize`）遇到 qoder job 直接抛错拒绝。
- SessionStart 遍历 retryable job 时，把 `host === "qoder"` 的 job 收集为 pending 列表并注入 `buildQoderKnowledgeFinalizationDirective` 生成的 directive：每个 job 给出 Step 1（用 Agent 工具派发 GeneralPurpose subagent，任务文本是 finalizer 的 writer prompt，要求应用 knowledge-writer skill 更新治理文档）与 Step 2（运行 `claw internal-knowledge-finalize-record --job "<path>"`），并要求在无关工作前完成。Step 1 的 subagent 任务文本末尾附带 dispatch evidence 硬性要求：subagent 的最后动作必须把 `{"finalizeId": "<finalizeId>", "dispatchedAt": "<ISO-8601 UTC>"}` 写入 job 旁的 `<finalizeId>.dispatch.json` marker。
- `internal-knowledge-finalize-record` 先 claim job（已 `succeeded`、`running` 或 attempts 达上限时返回 `claimed: false`），只接受 `host === "qoder"` 的 job，其余 host 标记 `failed`。成功路径按序执行：内置 writer 时以 `truthSnapshotBefore` 基线做 changed-document dated-section governance（external skill 跳过治理）、Truth 编码归一化、completion recall refresh、向相邻 report 写入按 `finalizeId` 幂等的 `knowledge_finalization` 结果、持久化 `succeeded` job。
- record 读取 job 旁的 `<finalizeId>.dispatch.json` marker 作为派发证据：`finalizeId` 匹配才算有效，marker 消费后删除；结果以 `dispatch.dispatched`（含可选 `dispatchedAt`）写入 job、以 `dispatched` 写入 report entry 与命令输出。`finalResponse` 文案如实区分 `via subagent dispatch` 与 `without dispatch evidence (fail-open)`，不再无条件声称派发发生过。
- record 保持 fail-open：dispatch evidence 只作证据记录，缺失或不可读的 marker 不会阻止落账。未派发时基线与当前快照无 diff，job 仍以 `succeeded` 关闭并记录 0 changed docs 与 `dispatched: false`。record 失败时不重启 detached worker；仍为 `queued`/`failed` 的 job 由后续 SessionStart 再次浮出。

## 真实调用链路

1. plan 进入 `end.*` 后，qoder Stop hook 经 stdin payload 调用 `tryCaptureKnowledgeStop(...)`，sidecar 创建带 `host: "qoder"` 与 `truthSnapshotBefore` 的 job，Stop 不启动 worker。
2. 下一次 SessionStart 的 `runSessionStartHook` 把 qoder job 从 worker 启动循环中分流到 `pendingQoderFinalizationJobs`，directive 进入 `additionalContext`。
3. main agent 派发 knowledge-writer subagent 更新 `.claw/truth` 治理文档；subagent 最后写入 `<finalizeId>.dispatch.json` marker，随后 main agent 运行 `claw internal-knowledge-finalize-record --job <path>`。
4. record 命令 claim job、读取并消费 dispatch marker、按基线治理 diff、归一化编码、写回含 `dispatch` 证据的结果并持久化 `succeeded`，全程不加载 codex-sdk。

## 关联代码

- `packages/cli/src/invocation-host.ts`：`SUPPORTED_CLAW_HOSTS` 含 `qoder`。
- `packages/cli/src/cli.ts`：`runStopHook` 的 qoder 分流、`buildQoderKnowledgeFinalizationDirective`、`runInternalKnowledgeFinalizeRecord`、SessionStart pending-job 收集。
- `packages/core/src/knowledge-sidecar.ts`：`KnowledgeFinalizationJob.truthSnapshotBefore` 的 queue-time 快照。
- `packages/qoder-adapter/hooks/hooks.json` 与 `packages/qoder-adapter/references/qoder-hooks-strategy.md`：hook 注册与 payload 适配说明。

## 已知陷阱

- record 不是 writer：如果 main agent 跳过 Step 1 直接运行 record，沉淀仍以 0 changed docs 成功关闭且不会报错，但 job 与 report 会如实记录 `dispatched: false`，事后可审计。
- 不要为 qoder job 启动 detached finalizer 或让其进入 codex/opencode runner 路径；两处代码都会显式拒绝。
- 不要用 record 时刻的 truth 快照替代 `truthSnapshotBefore`；那样会漏掉本会话 writer 的全部 diff，治理与 changed-docs 统计都会失真。

## 验证标准

- `packages/cli/test/cli.test.ts` 覆盖：qoder job 必须携带 `truthSnapshotBefore` 治理基线、SessionStart `additionalContext` 包含 `internal-knowledge-finalize-record --job` directive 与 `Dispatch evidence (required)` marker 任务、record 在无 codex runtime 环境下完成 queued qoder job（`dispatched: false` fail-open）、record 从匹配 marker 记录 `dispatched: true` 并消费 marker、finalization 结果 `host` 为 `qoder`。
- 端到端验收以真实 knowledge-writer subagent dispatch 验证整条链路（Stop 排队 → SessionStart directive → dispatch → record），而不是仅靠单元测试。

## 关键检索词

- `qoder knowledge finalization`
- `internal-knowledge-finalize-record`
- `truthSnapshotBefore`
- `buildQoderKnowledgeFinalizationDirective`
- `pendingQoderFinalizationJobs`
- `claw hook auto-doc --host qoder`
- `last_assistant_message`
- `subagent dispatch`
- `dispatch evidence marker`
- `in-conversation finalization`
