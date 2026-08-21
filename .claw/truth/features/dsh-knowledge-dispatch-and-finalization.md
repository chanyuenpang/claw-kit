# DSH knowledge dispatch and finalization

<!-- state: current -->
## Current behavior

`dsh`（DeepSeek Harness）是 claw-kit 的一等 invocation host 与 knowledge finalization launcher。

- `SUPPORTED_CLAW_HOSTS = ["codex", "opencode", "cindy", "dsh"]`（`packages/cli/src/invocation-host.ts`）。
- `isHostActionsHost`（`codex | dsh`）：这两个 host 的 CLI 输出携带版本化 `hostActions`
  （`update_plan` / `create_goal` / `update_goal`），由各自 adapter 自动消费。
- `isSubagentPolicyHost`（`codex | cindy | dsh`）：这三个 host 支持
  `knowledgeWriter.executionPolicy = "subagent"`；其他 host 在配置时直接拒绝该 policy。
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

## 关联代码

- `packages/dsh-adapter/`（`@claw-kit/dsh-adapter`，静态 Cordis bundle 插件）
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
- `knowledge claim` 的 DSH capture 分支在 dsh-capture 文件缺失或 session 不匹配时保持
  可复现、可报告；窗口过滤以 `reportCapture.startedAt` 为起点且空 capture 合法。
- `claw_run search` 的召回列表对模型完全可见：`query` / `count` / `results[]` 的
  `sourcePath`/`kind`/`snippet`/`score`，内部字段不泄漏。

## 关键检索词

`dsh`、`DSH adapter`、`knowledgeDispatch`、`buildKnowledgeDelegateDispatch`、`claw_run`、
`isSubagentPolicyHost`、`isHostActionsHost`、`delegate-writer`、`knowledge claim`、
`search recall`、`compactClawOutput`
