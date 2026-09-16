# DSH knowledge dispatch and finalization

<!-- state: current -->
## Current behavior

`dsh`（DeepSeek Harness）是 claw-kit 的一等 invocation host 与 knowledge finalization launcher。

- `SUPPORTED_CLAW_HOSTS = ["codex", "opencode", "cindy", "dsh"]`（`packages/cli/src/invocation-host.ts`）。
- `isHostActionsHost`（`codex | dsh`）：这两个 host 的 CLI 输出携带版本化 `hostActions`
  （`update_plan` / `create_goal` / `update_goal`），由各自 adapter 自动消费。
- `isSubagentPolicyHost`（`codex | cindy | dsh`）：这三个 host 支持
  `knowledgeWriter.executionPolicy = "subagent"`；其他 host 在配置时直接拒绝该 policy。
- DSH 没有独立 background runner；Host capability 会把项目配置的
  `background | subagent` 都归一为原生 subagent lifecycle。新项目保留通用默认值
  `background`，但 DSH effective writer 必须生成 ready job 与 `knowledgeDispatch`。
- `KnowledgeFinalizationHost` 增加 `"dsh"`（`packages/core/src/knowledge-sidecar.ts`）。
- DSH 的 `claw_run` 工具把 `claw search` 召回结果完整暴露给模型：
  `compactClawOutput` 白名单包含 `query` / `results` / `count`，每条命中只保留
  `sourcePath` / `kind` / `snippet` / `score`（内部字段如 storePath 仍隐藏）。
  0.2.21.18 之前白名单不含 search 结果字段，模型只能看到 `{ok,command}`，知识召回
  闭环断裂；该版本补上 search 字段后，`claw_run search` 的知识召回列表
  （truth_doc/adr 命中）全可见。

DSH 知识终结 dispatch 流程：项目作用域 root plan 进入 `end.*` 且
`executionPolicy = "subagent"` 时，终态 mutation 先持久化 ready job
（`job.host = "dsh"`、`reportCapture.mode = "claim"`、`status = "queued"`），再返回
`knowledgeDispatch`（`buildKnowledgeDispatch` → `buildKnowledgeDelegateDispatch`，内部
`resources/delegate-writer/TEMPLATE.json`）。DSH adapter 把 immutable dispatch prompt
原样交给 DSH 原生 subagent（`subagent` / `subagent_fork`）；该 subagent 创建 delegate
plan、跟随 workflowGuidance、`knowledge claim` 认领 job、顺序执行生成的 assignment
subplan、并以 claim token 调用一次 `knowledge done`。

终态 mutation 返回 `knowledgeDispatch` 时，DSH adapter 自动派发 writer child
（`subagents.start("spawn", ...)`，label 由 `finalizerChildLabel` 生成，与 CLI
delegate plan 标题同形：`knowledge-finalizer-<finalizeId 前 12 位>`），并在 compact
result 中返回执行回执；主模型不自行执行 writer，只消费该回执
（`dispatch.ok`）（与 delegate 只执行 claim → assignment subplan → 单次
`knowledge done` 的边界一致）。派发是 fire-and-forget：adapter 只取执行回执
（`dispatch.ok`），不 await 子代理结果；子代理使用专用 `AbortController`，不复用
claw_run 工具信号 `exec.signal`（工具调用返回时该信号会 abort，曾导致子代理在首
个 turn 前被取消、`plan.done` 后 finalizer 从未运行——2026-08-22 修复，提交
`0a15891`，锚点 `packages/dsh-adapter/src/index.ts`）。compact result 把
`dispatch` 前置到 `command` 之后，且仅在实际存在 dispatch 时重插该字段：向对象
写入 `undefined` 会破坏 DSH lossless-JSON 工具输出校验（0.2.26.0 加载后普通
`plan.create` 曾报 "value is not lossless JSON"——2026-08-22 修复，提交
`cebd5b9`）。

adapter 以 `finalizeId` 为键保证「同一 finalizeId 至多一个未结算 writer child」：
派发前先经 `resolveFinalizerReuse` 查重，命中则跳过 `start` 并返回
`dispatch: { ok: true, reused: true, runId, policy }`，未命中才 `start` 并返回
`dispatch: { ok: true, runId, policy }`。查重有两条来源，由便宜到贵：

- 进程内 `finalizerDispatches`（`Map<string, { runId, settled }>`）：本进程启动且尚未
  观测到结算的 child 直接短路，无竞态，覆盖重复派发。child 的 `run.result` settle
  （成功或失败皆可）后记录标记 `settled`，该 `finalizeId` 因此可再次派发——job 仍在
  queued 时只有**新** child 能 claim 它。`run.result` 缺失时不保留任何记录，避免一条
  永不结算的记录占住一个已死 child 的 job。
- 服务层 durable 目录：`subagents.listChildren(agent.id)` 中 `kind === "child"`、
  `activity === "running"` 且 `label` 等于本 finalizeId label 的条目，覆盖 adapter
  进程重启后进程内 Map 丢失的场景。label 在 one-shot child 上同样耐久（runtime 为每个
  child 快照 descriptor），因此 finalizer 保持 one-shot `start` 仍可被发现。该查询
  fail-open：服务缺失、投影注册表缺失或 session store 抛错都不得阻塞派发，也不得被
  报告为一次复用。

失败路径返回 `dispatch: { ok: false, retryable: false, reason, guidance }` 且不保留
记录：**自动**重试留给下一次终态转换；`retryable: false` 只约束模型，`guidance`
（`FINALIZER_MANUAL_RETRY_GUIDANCE`）明说不得自行运行 finalizer、也不得手动重试派发，
因为手动重试是唯一还能产生第二个 writer child 的路径。`subagents` 服务缺失时返回同形状
的 `{ ok: false, retryable: false, reason: "subagents service unavailable", guidance }`。

端到端已验证（finalizeId `8a208046f490…`，task `Knowledge-dispatch-test`，goal
`verify knowledgeDispatch`）：`plan done` → ready job 持久化 → delegate plan
（`delegate-writer/TEMPLATE.json`）→ `claw knowledge claim --project-root . --finalize-id <id>`
→ built-in knowledge-governance assignment subplan（Truth 先于 ADR）→
`claw knowledge done --job <jobPath> --claim-token <claimToken> --status succeeded`。

第二次端到端验证（finalizeId `ba361e9bfb37…`，task `Auto-dispatch-E2E`，goal
`verify auto-dispatch end to end`）复验同一生命周期：`plan done` 自动派发 ready job
与 `knowledgeDispatch`，delegate subagent 完成 delegate plan → claim → assignment
subplan → 单次 `knowledge done`，确认自动派发路径与首次验证一致可用。

第三次端到端验证（finalizeId `9ee301c46ed5…`，task `Window-capture-check`，goal
`verify plan-window capture extraction`）验证 claim-time capture 的窗口过滤语义：
DSH capture 提取只采用当前 plan 窗口内的 `task.done` 结论，以 job 的
`reportCapture.startedAt`（registry `activeStartedAt`）为权威窗口起点，过滤出
`time >= startedAt` 的结论后写入相邻 report（空 capture 合法）；新 plan → 执行 →
`plan.done` 后的 capture 与 report 均按该窗口过滤，确认窗口提取端到端可用。

第四次端到端验证（finalizeId `00909bd12373…`，plan `DSH-full-loop-verification`，
goal `verify the complete dsh knowledge loop after 0.2.21.18: plan lifecycle,
automatic writer dispatch, report capture window, search recall`）在 0.2.21.18
真实 Host 上复验完整闭环：plan create/start/done 生命周期（goalSync 自动消费
`create_goal` + projection 进度）、`plan.done` 自动派发（daemon channel +
native subagent）、claim-time capture 窗口过滤、以及 `claw_run search` 召回
可见性全部通过，与 `docs/dsh-plugin-integration-research.md` §5.5 验收一致。

第五次验证（finalizeId `f7506ae1a528…`，plan `verify-finalizer`，goal
`verify knowledge finalizer auto-dispatch after signal fix`）在信号修复（专用
`AbortController` + fire-and-forget，`0a15891`；lossless-JSON 重插守卫，`cebd5b9`）
后确认 `plan.done` 真正启动运行中的 finalizer subagent：auto-dispatch 的 knowledge
job 被 claim 并走完 claim → assignment subplan → 单次 `knowledge done`，证明
`exec.signal` abort 修复后自动派发端到端可用。

## 已知陷阱

- `claw knowledge claim` 的 claim-time report capture 现在实现 `dsh` 分支：
  `packages/cli/src/dsh-capture.ts` 的 `readDshKnowledgeCapture` 读取 adapter 在终态
  mutation 写入的 dsh-capture 文件。DSH 起源的 job（`host` 为 `"dsh"`，或 host-less
  CLI closeout 产生的 `host: null`，后者在 dsh-capture 文件存在且 session 匹配时走
  同一分支）在 claim 时按 `reportCapture.startedAt` 窗口过滤后写入相邻 report 并标记
  captured。capture 文件缺失或 session 不匹配时仍会以 `DSH report capture is
  unavailable for knowledge session ...` 失败；空 capture 有效（与 Cindy empty-report
  合同一致：report 文件存在且为空、`reportCapture.status = "captured"`、
  `messageCount = 0`）。
- 本机 claw_run 工具由 adapter 用 `agent.session?.cwd` 锻造 workdir；当 DSH 子代理会话
  cwd 不是项目根（如 `C:\Windows\System32`）时，`plan.create` 会报 "found no .claw
  project"。该环境问题可通过直接在项目根执行 claw CLI 绕过，canonical `.claw` 状态不变。
- 自动派发的 finalizer subagent 必须使用专用 `AbortController`，不能复用 claw_run
  工具信号 `exec.signal`：工具调用返回时信号 abort，子代理会在首个 turn 前被取消
  （2026-08-22 修复，提交 `0a15891`）。
- compact result 只在 dispatch 实际存在时前置重插 `dispatch` 字段；写入 `undefined`
  会触发 DSH lossless-JSON 校验失败（"value is not lossless JSON"，2026-08-22
  修复，提交 `cebd5b9`）。
- finalizer 判重不能走模型侧的 `list_agents`：它是服务层 `listChildren` 的 continuable
  投影，显式丢弃 one-shot child（`@deepseek-ai/dsh-tool-subagent-control` 的
  `lib/types/list-agents.js` 中 `project()` 对 `entry.mode !== "continuable"` 返回
  `undefined`），而自动派发的 finalizer 是 one-shot。用它做"是否已有 writer child"的
  判断会静默失效并重新产生第二个 child；判重必须在 adapter 内经服务层 `listChildren`
  完成。

## 关联代码

- `packages/dsh-adapter/`（`@veewo/dsh-claw-kit`，静态 Cordis bundle 插件）
- `packages/dsh-adapter/src/index.ts`（`finalizerChildLabel` / `resolveFinalizerReuse` /
  `finalizerDispatches` / `FINALIZER_MANUAL_RETRY_GUIDANCE`）
- `packages/dsh-adapter/test/finalizer-execute.test.mjs`（execute 级：同一 finalizeId
  只 `start` 一次）
- `packages/dsh-adapter/test/finalizer-dispatch.test.mjs`（判重纯缝）
- `packages/cli/src/invocation-host.ts`（`isHostActionsHost` / `isSubagentPolicyHost`）
- `packages/cli/src/cli.ts`（`buildKnowledgeDispatch` 的 dsh 分支、claim-time capture 的 dsh/host-null 分支）
- `packages/cli/src/dsh-capture.ts`（`readDshKnowledgeCapture` / dsh-capture 文件路径）
- `packages/core/src/knowledge-sidecar.ts`（`KnowledgeFinalizationHost` 增加 `"dsh"`）
- `packages/core/dist/src/resources/delegate-writer/TEMPLATE.json`
- `docs/dsh-plugin-integration-research.md`（调研与正式化记录）

## 验证标准

- `--host dsh` 被 CLI 接受；`plan.done` 在 subagent policy 下持久化 ready job 并返回
  `knowledgeDispatch`（policy `subagent`、prompt 指向 delegate-writer 模板）。
- dispatch 的 subagent 能完成 delegate plan → claim → assignment subplan → done 全链路。
- 终态 mutation 返回 `knowledgeDispatch` 时，`claw_run` compact result 含
  `dispatch: { ok: true, runId, policy }` 确认（subagent 不可用时为
  `{ ok: false, reason }`），主模型不执行 writer。
- `knowledge claim` 的 DSH capture 分支在 dsh-capture 文件缺失或 session 不匹配时保持
  可复现、可报告；窗口过滤以 `reportCapture.startedAt` 为起点且空 capture 合法。
- `claw_run search` 的召回列表对模型完全可见：`query` / `count` / `results[]` 的
  `sourcePath`/`kind`/`snippet`/`score`，内部字段不泄漏。
- 同一 `finalizeId` 连续两次终态 mutation 后 `subagents.start` 恰好调用一次，第二次
  返回 `dispatch.ok === true` 且 `reused === true`；child 结算后同一 `finalizeId` 可以
  再次派发。
- `subagents` 服务不可用或 `start` 抛错时 `dispatch.ok === false`、
  `dispatch.retryable === false` 且带 `guidance`；下一次终态转换仍会自动重试。
- 服务层 `listChildren` 缺失或抛错时判重 fail-open：不阻塞派发，也不误报复用。

## 关键检索词

`dsh`、`DSH adapter`、`knowledgeDispatch`、`buildKnowledgeDelegateDispatch`、`claw_run`、
`isSubagentPolicyHost`、`isHostActionsHost`、`delegate-writer`、`knowledge claim`、
`search recall`、`compactClawOutput`

<!-- state: history -->
## Evolution history

<!-- dated: 2026-09-16 -->
### 按 finalizeId 去重的 writer child 复用

此前 adapter 对每个 `knowledgeDispatch` 都无条件 `subagents.start("spawn", ...)` 一个新的
one-shot writer child，不做判重；唯一能产生第二个 writer child 的路径是模型在
`dispatch.ok === false` 后手动重试派发。该形态把"一个 finalizeId 一个 writer"完全交给模型
自律。保留这段历史的用途是事故推理：出现重复 writer child 时先区分是判重失效还是手动重试。
