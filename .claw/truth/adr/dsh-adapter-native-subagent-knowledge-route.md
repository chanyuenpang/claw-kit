# ADR: DSH knowledge finalization uses the native-subagent delegate route

## Context

DSH（DeepSeek Harness）需要与 claw-kit 既有的 ready-job / claim / done 终结生命周期
对齐的知识 closeout launcher。DSH 没有 Cindy 的 Orca Worker 卡片面，也没有 Codex 的
固定 code-mode driver 信封传统，但它有原生 `subagent` / `subagent_fork` 工具、完整 Node
环境的静态 Cordis 插件（可 spawn CLI）与版本化 `hostActions` 协议产物。需要决定 DSH
的 writer 派发形态与 host 归属。

调研基线见 `docs/dsh-plugin-integration-research.md`（§3.1 选型、§3.2 三条路径对比、
§3.3 推荐架构、§五 正式化进度）。`knowledgeWriter.executionPolicy = "subagent"`
原本只对 Codex / Cindy host 开放；DSH 接入后需要把 host 判定统一为共享谓词，并让 DSH
按自己的原生能力执行 dispatch。

## Decision

- DSH 是受支持的 invocation host 与 subagent-policy 知识 host：
  `isSubagentPolicyHost`（`codex | cindy | dsh`）取代逐 host 的 `!== "codex"` 检查；
  `KnowledgeFinalizationHost` 增加 `"dsh"`。
- DSH 知识终结复用与 Codex 相同的 native-subagent delegate 路线：终态 mutation 先持久化
  ready job（`job.host = "dsh"`、claim-mode report capture），再返回
  `knowledgeDispatch`（`buildKnowledgeDispatch` → `buildKnowledgeDelegateDispatch`，
  内部 `delegate-writer/TEMPLATE.json`）；DSH adapter 把 immutable prompt 原样交给
  DSH 原生 subagent，subagent 创建 delegate plan、`knowledge claim` 认领 job、顺序执行
  assignment subplan、以 claim token 调用一次 `knowledge done`。不做 Cindy 式原子
  claim-time capture，也不用 `knowledge wait`。
- DSH adapter（`@veewo/dsh-claw-kit`，静态 Cordis bundle 插件）注册**单个原生工具
  `claw_run`**：`execute` 内部经 `claw session open --host dsh` daemon 执行 mutation、
  消费 CLI 生成的 `hostActions`（`create_goal`/`update_goal` → DSH 原生 goals；
  `update_plan` → 进度投影）、按白名单返回 compact guidance。`isHostActionsHost`
  （`codex | dsh`）取代 `effectiveHost === "codex"` 作为 hostActions 构建门控——DSH 与
  Codex 共享同一版本化 hostActions 协议，无需 code-mode 信封。
- `agent/session-start` 注入恢复的 workflow guidance；`agent/turn-stopping` 做 turn
  report 捕获（fail-open）；bundled skills 经 `ctx.skills` 分层注册表投递。

## Alternatives

- Cindy 式 Orca/原子 dispatch（Ghost `list_tools`+`call_tool`、claim-time
  `--cindy-report-stdin` 捕获）：拒绝。DSH 没有 Orca Worker 面，且原生 subagent 更直接
  （“比 Cindy 顺，无需 Orca”）；Orca 式原子 claim capture 在 DSH 也没有可扫描的
  transcript。
- Codex 式固定 code-mode driver 信封（`run_code` + 每轮内联 ~15KB driver、`eval`）：
  拒绝。DSH 插件工具 execute 本身是完整 Node 环境，`claw_run` 就是固定 driver 的最佳
  载体；避免信封仪式、模型维护与 token 开销，并保留 hostActions 语义对称。
- 动态 Cordis 插件承载生产 adapter：拒绝。动态插件无 `process`，不能 spawn CLI。
- background detached worker 承载 subagent-policy job：拒绝。subagent policy 要求终态
  mutation 的 ready job 由 executor claim，background worker 不认领（既有 lifecycle
  合同，不因 DSH 放宽）。

## Consequences

- DSH 起源的 job 复用统一的 job/assignment/claim-token/done 协议；delegate 编排模板与
  built-in governance 仍为 Core 内部资源。
- `claw knowledge claim` 的 claim-time report capture 现在同时实现 `cindy`（stdin）、
  `codex`（transcript）与 `dsh`（`readDshKnowledgeCapture` 读取 adapter 写入的
  dsh-capture 文件）三个分支；DSH job（`host` 为 `"dsh"`，或 host-less closeout 的
  `null`，后者在 dsh-capture 文件存在且 session 匹配时走同一分支）在 claim 时按
  `reportCapture.startedAt` 窗口过滤后直接物化 capture（空 capture 合法）。capture
  文件缺失或 session 不匹配时 claim 仍会失败，finalizer 需先物化 capture。
- `SUPPORTED_CLAW_HOSTS` 增加 `"dsh"`，`compactPlanCommandResult` 与 daemon 路径的
  hostActions 门控统一走 `isHostActionsHost`；Codex/DSH 的 compact 输出语义一致。
- 端到端验证：finalizeId `8a208046f490…`（task `Knowledge-dispatch-test`）走完
  delegate plan → claim → built-in governance assignment subplan → `knowledge done`
  全链路，确认 DSH knowledge dispatch 生成与终结可用。第二次复验（finalizeId
  `ba361e9bfb37…`，task `Auto-dispatch-E2E`，goal `verify auto-dispatch end to end`）
  走同一自动派发路径成功，确认 `plan done` 的 ready-job + knowledgeDispatch 自动派发
  与终结全链路稳定可用。第三次验证（finalizeId `9ee301c46ed5…`，task
  `Window-capture-check`，goal `verify plan-window capture extraction`）确认 claim-time
  capture 以 `reportCapture.startedAt`（registry `activeStartedAt`）为窗口起点过滤
  `task.done` 结论，capture 与 report 的窗口提取端到端可用。第四次验证（finalizeId
  `00909bd12373…`，plan `DSH-full-loop-verification`，goal `verify the complete dsh
  knowledge loop after 0.2.21.18`）在 0.2.21.18 真实 Host 上复验完整闭环（plan
  lifecycle、自动派发、capture 窗口、search 召回可见性）全部通过，与
  `docs/dsh-plugin-integration-research.md` §5.5 验收一致。

## Related Code

- `packages/dsh-adapter/`（`src/index.ts`、`src/claw-session.ts`、`src/host-actions.ts`）
- `packages/cli/src/invocation-host.ts`（`isHostActionsHost` / `isSubagentPolicyHost`）
- `packages/cli/src/cli.ts`（`buildKnowledgeDispatch` 的 dsh 分支、compact 门控）
- `packages/cli/src/command-service.ts`（daemon 路径 hostActions 门控）
- `packages/core/src/knowledge-sidecar.ts`（`KnowledgeFinalizationHost` 增加 `"dsh"`）
- `packages/core/dist/src/resources/delegate-writer/TEMPLATE.json`
- `docs/dsh-plugin-integration-research.md`

## Search Terms

- `DSH knowledge dispatch`
- `native-subagent delegate`
- `buildKnowledgeDelegateDispatch`
- `claw_run`
- `isSubagentPolicyHost`
- `isHostActionsHost`
- `delegate-writer`
- `ready job`
- `claimToken`
