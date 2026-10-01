# ADR: DSH knowledge finalization preserves the delegate lifecycle

This ADR owns DSH host integration and the ready-job/claim/done lifecycle. Backend selection and reusable-role decisions belong to [delegation ownership](<dsh-delegation-contract-ownership.md>). Native one-shot remains a compatibility path, not the mandatory backend for new jobs. This source decision does not claim live profile activation.

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
  `KnowledgeFinalizationHost` 增加 `"dsh"`。由于 DSH 没有独立 background runner，Host
  capability 边界把项目配置的 `background | subagent` 都归一为 `subagent` policy lifecycle；
  这与 Cindy 一样是 launcher 能力约束，不是失败 fallback。
- DSH 知识终结保留统一的 delegate lifecycle，不把它绑定到某一种执行 backend：终态 mutation 先持久化
  ready job（`job.host = "dsh"`、claim-mode report capture），再返回
  `knowledgeDispatch`（`buildKnowledgeDispatch` → `buildDshKnowledgeDispatch`，
  内部 `dsh-delegate-writer/TEMPLATE.json`）；DSH adapter 先完成父端可信 capture，再把
  immutable prompt 交给能力选择的 writer，writer 创建逐 job 独立的 delegate plan、`knowledge claim`
  认领 job、顺序执行 assignment subplan、以 claim token 调用一次 `knowledge done`。
  采集边界由 [report-collection ADR](<adapter-owned-report-collection.md>) 拥有，不用 `knowledge wait`。
- DSH adapter（`@veewo/dsh-claw-kit`，静态 Cordis bundle 插件）注册**单个原生工具
  `claw_run`**：`execute` 优先经 daemon 执行 mutation，并在可证明的预执行缺口自动使用同一 typed session service 的受信 CLI baseline；
  消费 CLI 生成的 `hostActions`（`create_goal`/`update_goal` → DSH 原生 goals；
  `update_plan` → 进度投影）、按白名单返回 compact guidance。`isHostActionsHost`
  （`codex | dsh`）取代 `effectiveHost === "codex"` 作为 hostActions 构建门控——DSH 与
  Codex 共享同一版本化 hostActions 协议，无需 code-mode 信封。
- `agent/session-start` 注入恢复的 workflow guidance，并对规范 queued job 做恢复；bundled
  skills 经 `ctx.skills` 分层注册表投递。DSH 不依赖 turn-stopping report hook，父端通过
  live `sessionQuery` 在派发前采集；采集失败保持 queued，不回滚前台 canonical plan。
- Adapter 统一拥有 finalizer 派发与恢复；不能把模型侧 Team 清单、成员 inactive 或投递 acceptance 当成工作完成。当前 role 复用决策见 [delegation ownership](<dsh-delegation-contract-ownership.md>)，native one-shot 去重只是兼容分支。Core 仍是 job、claim、材料与终态的唯一 owner。

- Model-allowed business commands share the typed `ClawCommandService` contract and real registry/focus preparation across daemon and one-shot CLI baseline; only known unsupported or proven pre-send transport gaps authorize fallback. Unknown-outcome mutation must not be replayed. Internal/admin operations remain outside model authority. See `../features/dsh-claw-run-route-guidance.md` for the current route.
- The adapter recovers queued dispatch on subsequent system entry using canonical per-job execution evidence and backend-appropriate reconciliation; same-claim Core receipts recover a lost claim response without a second assignment run. A lost child after claim or lost external write acknowledgement remains outside exactly-once guarantees without destination idempotence.

## Alternatives

- Cindy 式 Orca/原子 dispatch（Ghost `list_tools`+`call_tool`、claim-time
  `--cindy-report-stdin` 捕获）：拒绝。DSH 没有 Orca Worker 面，且原生 subagent 更直接
  （“比 Cindy 顺，无需 Orca”）；Orca 式原子 claim capture 在 DSH 也没有可扫描的
  transcript。
- Codex 式固定 code-mode driver 信封（`run_code` + 每轮内联 ~15KB driver、`eval`）：
  拒绝。DSH 插件工具 execute 本身是完整 Node 环境，`claw_run` 就是固定 driver 的最佳
  载体；避免信封仪式、模型维护与 token 开销，并保留 hostActions 语义对称。
- 动态 Cordis 插件承载生产 adapter：拒绝。动态插件无 `process`，不能 spawn CLI。
- Arbitrary CLI/shell forwarding or replay of timeout/unknown-outcome commands: rejected because it widens model authority and risks duplicate mutations; the baseline has a closed typed domain and pre-execution fallback gate.
- background detached worker 承载 subagent-policy job：拒绝。subagent policy 要求终态
  mutation 的 ready job 由 executor claim，background worker 不认领（既有 lifecycle
  合同，不因 DSH 放宽）。

## Consequences

- DSH 起源的 job 复用统一的 job/assignment/claim-token/done 协议；delegate 编排模板与
  built-in governance 仍为 Core 内部资源。
- 自动派发的 finalizer subagent 以 fire-and-forget 运行（adapter 只消费 `dispatch.ok`
  执行回执），使用专用 `AbortController` 而非 claw_run 工具信号，确保工具返回后子代理
  存活（2026-08-22 修复 `0a15891`）；compact result 仅在存在 dispatch 时前置重插该
  字段，避免 `undefined` 破坏 DSH lossless-JSON 校验（`cebd5b9`）。
- DSH claim 依赖父端已发布的可信 capture receipt，而不是 executable collector/journal；
  历史读取成功但没有可信 final event 可发布真实空 capture，历史读取失败不能伪装空材料。
  Codex/Cindy 的 collector 合同与 DSH 的父端采集差异由
  [report-collection ADR](<adapter-owned-report-collection.md>) 拥有，本文不再拥有另一套采集规则。
- `SUPPORTED_CLAW_HOSTS` 增加 `"dsh"`，`compactPlanCommandResult` 与 daemon 路径的
  hostActions 门控统一走 `isHostActionsHost`；Codex/DSH 的 compact 输出语义一致。
- Native one-shot job 不在执行中迁移；它继续使用自己的完整 finalizeId label、旧 label 兼容与 service-level child catalog。可复用 role 则必须使用匹配的 CLI/Core 完整 delegate 身份合同，不能从 one-shot 的短标题兼容行为推导跨 job 安全性。
- 前台在父计划终态和 adapter 异步派发回执后即可答复，不把后台 finalizer 纳入前台必要结果的 Team 等待链。成功接收不代表知识写入成功；未知结果不能授权重发，source 测试也不能证明运行 profile 已激活。

<!-- state: history -->
## Decision evolution

<!-- dated: 2026-10-02 -->
### 将 native-only 决策收窄为兼容路线

以下原决策保留用于旧 job 与重复投递排查；“尚未实施”仅描述当时的 Team 状态，已由 capability-selected adapter role source 取代。

- finalizer 派发的复用 owner 是 adapter，键是 `finalizeId`：同一 `finalizeId` 至多存在
  一个未结算 writer child，派发前先判重（进程内记录 + 服务层 `listChildren` 的 durable
  目录），命中即跳过 `start` 并返回 `reused: true`；目录缺失/损坏或 admission 回执未知
  则 deferred，不能把未知结果当未执行。queued job 由下一次系统入口调和，模型不得手动
  重试；child 无结果 promise 也不是解除去重的依据。child 保持 one-shot `start`
  不变。机制与查重来源的当前行为由
  `.claw/truth/features/dsh-knowledge-dispatch-and-finalization.md` 拥有。

- 本 ADR 的当前 native 路线按 `finalizeId` 去重，不跨 `finalizeId` 复用 writer child；
  child label 使用完整 ID，兼容旧短 label。判重经服务层 `listChildren`，不能用模型侧
  `list_agents` 的 Team/continuable 清单证明普通 one-shot child 不存在。
- 尚未实施的 Team 设计允许同 Team 成员身份跨 job 复用，但不复用 job 材料、claim 或
  plan，不改变当前 native 行为；其边界与角色 owner 由
  [delegation ownership ADR](<dsh-delegation-contract-ownership.md>) 维护。前台在父计划终态
  和异步派发回执后即可答复，不把后台 finalizer 纳入前台必要结果的 Team 等待链。

<!-- dated: 2026-10-01 -->
### 旧 native 采集与复用说明的适用范围

此前以短 child label、catalog fail-open 和 claim-time journal/collector 描述 native 路线；当前完整 ID 与 deferred admission 防止未知结果造成第二个 writer，采集已转为父端 live Host 回执。当时跨 finalizeId 不复用的约束仅属于 native one-shot child 路线，不是今天 reusable-role source 的限制。以下验证记录保留用于旧版本兼容和事故推理，不证明新 Team runner 或当前安装版行为已验证。

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
- `packages/core/resources/dsh-delegate-writer/TEMPLATE.json`
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
