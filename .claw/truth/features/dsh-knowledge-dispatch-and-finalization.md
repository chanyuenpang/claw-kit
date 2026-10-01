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

DSH 知识终结 dispatch 流程：项目作用域 root plan 进入完成型终态
`end.completed | end.closed` 且 effective `executionPolicy = "subagent"` 时，终态 mutation 先持久化 ready job
（`job.host = "dsh"`、`reportCapture.mode = "claim"`、`status = "queued"`），再返回
`knowledgeDispatch`（`buildKnowledgeDispatch` → `buildDshKnowledgeDispatch`，内部
`resources/dsh-delegate-writer/TEMPLATE.json`）。DSH adapter 先完成父端可信 capture，再把
immutable dispatch prompt 原样交给 DSH 原生 subagent（`subagents.start("spawn", ...)`）；该 subagent 创建 delegate
plan、跟随 workflowGuidance、`knowledge claim` 认领 job、顺序执行生成的 assignment
subplan、并以 claim token 调用一次 `knowledge done`。`end.leave` 是取消而非派发边界；
session-scoped delegate 不递归创建知识 job，通用终态 gate 由
[finalization lifecycle ADR](<../adr/hook-owned-two-phase-knowledge-finalization.md>) 拥有。

终态 mutation 返回 `knowledgeDispatch` 时，DSH adapter 自动派发 writer child
（`subagents.start("spawn", ...)`，label 由 `finalizerChildLabel` 生成：
`knowledge-finalizer-<完整 finalizeId>`；CLI delegate plan 标题仍仅使用前 12 位），并在 compact
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
  观测到结算的 child 直接短路，覆盖重复派发。记录在 `start` 返回后即保存；`run.result`
  存在并 settle（成功或失败皆可）后标记 `settled`，但只有规范 job 仍 queued 且目录
  证明没有 running child 才可重新派发。缺失 result 不等于已结算，不能据此解除去重。
- 服务层 durable 目录：`subagents.listChildren(agent.id)` 中 `kind === "child"`、
  `activity === "running"` 且 `label` 匹配完整 finalizeId label 的条目，覆盖 adapter
  重启；兼容识别旧的前 12 位 label。one-shot child 的 descriptor 同样可耐久发现。
  缺失 `listChildren`、非数组结果、diagnostic 条目或查询抛错都不能证明未投递，返回
  deferred，不再新建 child；这不是一次成功复用，也不是 fail-open admission。

capture、目录或 native admission 失败返回 `dispatch.ok: false` 与安全的 phase/code/guidance；
服务缺失另带 `retryable: false`。`FINALIZER_MANUAL_RETRY_GUIDANCE` 明说模型不得自行
运行 finalizer 或手动重试。queued job 由后续系统入口只读对账后恢复；未知 start 回执不能
盲重派，已 claim job 不切换 writer。child 退出但尚无规范终态时仅记录安全告警，不能
代替 `knowledge.done`。这些规则不承诺外部文档写入 exactly-once。

当前仍是 native 路线，不存在已上线的 Team 常驻 runner；未来 Team 的已确认设计边界
由 [delegation Truth](<dsh-subagent-delegation-contract.md>) 唯一记录，不能用成员复用建议
放宽当前逐 finalizeId 的 native 去重。实现锚点：`packages/dsh-adapter/src/index.ts`
中的 `finalizerChildLabel`、`resolveFinalizerReuse`、`dispatchOne`、`sweepPending`。

<!-- state: history -->
## Historical verification

<!-- dated: 2026-08-22 -->
### 旧 native 与 claim-time capture 路线的验证记录

以下记录属于各自版本与当时的采集路线，不证明当前安装版 Team 能力、HMR、模型覆盖或跨 job 复用已经验证。

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

<!-- state: current -->
## Current capture and operational constraints

DSH 的父会话在终态或未过期 queued 恢复入口通过当前宿主 `sessionQuery` 自动读取自身历史，并只把可信 `assistant/final` 规范化为 `final_answer`；没有可证明的最终答复时发布有效空采集，不冒充普通消息。受信 adapter 通过私有 stdin 将规范事件交给 CLI，CLI 保留既有 task conclusions 并在规范 job 锁内原子发布 report 与采集回执；writer claim 仅在真实回执存在时签发 token，不再读取 `.claw/runtime/report-collectors/dsh.json` 或启动旧 web 采集脚本。历史不可读、起点缺失或发布失败使未领取 job 保持 queued；Core job 锁内保存有界阶段、错误码、关联 ID 和次数（不保存报告正文或原始异常），父会话本次派发回执和后续 `claw_run context`/session-start 可查看安全诊断，成功采集与成功终结会消解旧告警。Core 为同一 child 保存不可变 claim receipt，结果未知时只读恢复，不重做 assignment；已领取但 child 遗失或外部写入确认丢失仍不可盲重派。锚点：`packages/dsh-adapter/src/capture.ts`、`src/index.ts`、`packages/cli/src/dsh-host-report.ts`、`src/dsh-finalizer-diagnostics.ts`、`src/knowledge-pending.ts`、`packages/core/src/knowledge-sidecar.ts`。

## 已知陷阱

- 原项目级 `dsh.json` executable collector 和本地 journal 不再是 DSH writer claim 的依赖。父端自动采集成功但没有可信 final event 是合法空 report；Host 历史读取或 CLI 发布失败则不启动 writer、不签 token，job 保持 queued，恢复入口继续根据规范 job 与原生 child catalog 对账。
- `claw_run` 的 workspace 与 session 由 adapter 锻造。`resolveWorkdir` 优先采用
  durable session header cwd，再兼容旧 session cwd/meta，最后按 exact session 的 workspace
  registry 解析；不能从宿主启动目录推导项目根。旧 child cwd 落到 `C:\Windows\System32`
  曾导致项目发现失败，当前应诊断真实绑定，不让模型用 shell/CLI 绕过 `claw_run`。
- 自动派发的 finalizer subagent 必须使用专用 `AbortController`，不能复用 claw_run
  工具信号 `exec.signal`：工具调用返回时信号 abort，子代理会在首个 turn 前被取消
  （2026-08-22 修复，提交 `0a15891`）。
- compact result 只在 dispatch 实际存在时前置重插 `dispatch` 字段；写入 `undefined`
  会触发 DSH lossless-JSON 校验失败（"value is not lossless JSON"，2026-08-22
  修复，提交 `cebd5b9`）。
- finalizer 判重不能走模型侧 `list_agents`：exact scope 可能提供 Team 清单或普通
  continuable 投影，均不能证明 native one-shot child 不存在。历史普通 control 投影曾
  显式丢弃 one-shot child，错误枚举会产生第二个 writer；当前必须在 adapter 内经
  服务层 `listChildren` 完成，不能从同名工具推断可用 schema。

## 关联代码

- `packages/dsh-adapter/`（`@veewo/dsh-claw-kit`，静态 Cordis bundle 插件）
- `packages/dsh-adapter/src/index.ts`（`finalizerChildLabel` / `resolveFinalizerReuse` /
  `finalizerDispatches` / `FINALIZER_MANUAL_RETRY_GUIDANCE`）
- `packages/dsh-adapter/test/finalizer-execute.test.mjs`（execute 级：同一 finalizeId
  只 `start` 一次）
- `packages/dsh-adapter/test/finalizer-dispatch.test.mjs`（判重纯缝）
- `packages/cli/src/invocation-host.ts`（`isHostActionsHost` / `isSubagentPolicyHost`）
- `packages/cli/src/cli.ts`（DSH dispatch 与受信内部操作接入）
- `packages/dsh-adapter/src/capture.ts`、`packages/cli/src/dsh-host-report.ts`（父端规范化与报告发布）
- `packages/cli/src/knowledge-command.ts`（DSH claim receipt 与 token）
- `packages/core/src/knowledge-sidecar.ts`（Host、capture、claim、done 的规范 owner）
- `packages/core/resources/dsh-delegate-writer/TEMPLATE.json`
- `docs/dsh-plugin-integration-research.md`（调研与正式化记录）

## 验证标准

- `--host dsh` 被 CLI 接受；`plan.done` 在 subagent policy 下持久化 ready job 并返回
  `knowledgeDispatch`（policy `subagent`、prompt 指向 delegate-writer 模板）。
- dispatch 的 subagent 能完成 delegate plan → claim → assignment subplan → done 全链路。
- 终态 mutation 返回 `knowledgeDispatch` 时，`claw_run` compact result 含
  `dispatch: { ok: true, runId, policy }` 确认（subagent 不可用时为
  `{ ok: false, reason }`），主模型不执行 writer。
- DSH 父端成功读取历史但无可信 final event 时可发布空 capture；历史读取失败不能冒充空采集。窗口当前仅按 `reportCapture.startedAt` 下界过滤，未实现计划终态上界；Team 排队场景的立即冻结/上界隔离仍是建议。writer claim 必须有真实 capture receipt，冲突 claim token 仍拒绝。
- `claw_run search` 的召回列表对模型完全可见：`query` / `count` / `results[]` 的
  `sourcePath`/`kind`/`snippet`/`score`，内部字段不泄漏。
- 同一 `finalizeId` 连续派发时 `subagents.start` 至多调用一次，running child 命中返回
  `dispatch.ok === true` 且 `reused === true`；child 结算不自动授权再派，仍须核对 queued job。
- `subagents` 缺失、capture 失败或 `start` 抛错时 `dispatch.ok === false` 且带安全诊断与
  `guidance`；下一次系统入口只读核对规范 job 与 durable child，模型不得手动重试。
- 服务层 `listChildren` 缺失、损坏或抛错时应 deferred，不启动第二个 child，不误报复用。

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

<!-- dated: 2026-10-01 -->
### 原生去重的身份与未知结果边界

旧说明以 finalizeId 前 12 位作为 child label，并允许 child catalog 缺失或查询失败时 fail-open 启动。当前实现用完整 ID 标记 child，保留旧 label 识别，并在无法证明未投递时 deferred。保留此差异用于重启恢复和重复 writer 事故排查；delegate plan 的短标题不是 native 去重身份。未实施的 Team 复用仅涉及未来成员身份，不能据此重派旧 native job。
