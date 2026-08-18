# External Writer Skill Config

<!-- state: current -->
## 状态

这是 `claw-kit` 当前工作流的稳定事实。

## 核心事实

- `.claw/project.json` 以 `knowledgeWriter` 对象保存 writer 配置：`executionPolicy`、`externalSkills`、`model`、`reasoningEffort` 与 `datedSectionsToKeep`。`executionPolicy` 接受 `background | subagent` 且默认 `background`；Codex 按配置选择 launcher，Cindy 当前只支持 subagent 并把两种配置值都归一化为 Orca `knowledge_finalizer`。它不改变 assignment 语义；host-specific orchestration 由各 adapter 拥有。
- `externalSkills` 的非空有序列表选择真实外部 skill assignments；列表缺失或为空时选择 Core 内部 built-in governance assignment。该内置 contract 不以 `claw-kit:knowledge-writer` 用户 skill 发布。`datedSectionsToKeep` 的治理语义由 `truth-and-adr-corpus-semantics.md` 唯一拥有。
- Background policy 在支持它的 host 上于 Stop/session-idle 创建 job；subagent policy 在终态 mutation 返回 dispatch 前创建 ready job。Cindy 总是采用后一条路径，并把归一化后的 `subagent` 快照写入 `KnowledgeFinalizationJob.writer`。后续重试使用该快照，不从变更后的项目配置重新推导 capability。
- claim 把冻结配置解析为有序 assignments 与一次性 template。Codex 与 Cindy delegate 都在 session-scoped 动态 assignment subplan 中顺序执行；Cindy 通过 Ghost operations 消费专用内部 delegate template，而不是直接执行 assignment prompts。任一失败都会阻止后续 assignment 并以 claim token 写入失败终态。main agent 不根据 `keyDecisions` 拆分 Truth/ADR phase。
- `memory.autoUpdate` 有效时，冻结 external-document assignment 会在内置或 external skill assignments 之后追加；因此配置 external skills 只替换 built-in Truth/ADR governance，不会替换同一 job 的 existing-document governance stage。existing job、generated assignment plan、其 tracked subplan 与相邻 report 共同构成审计边界；`knowledge done` 保持既有协议，不接收或要求独立 doc-update receipt。doc-updater 是 Core 内部 template-backed resource：作为 active parent plan 的 stage 时创建 subplan；被显式独立调用时创建 own plan，模板或 CLI 不可用时按 fallback 运行。
- 内置与外部 assignment 使用不同 prompt builder。内置 prompt 直接展开隐藏治理 contract；外部 prompt 明确调用配置的 skill、要求无人值守且禁止询问、确认或等待交互。两者都要求使用 task status 区分已完成 scope 与 pending / blocked intent，禁止把 requirements 或 intentions 写成结果，也禁止在 governed docs 中引用会被销毁的 supplied materials。
- 外部 skill 自己拥有输出语义与文档治理。finalizer 不为外部 writer 建立 canonical Markdown 写前快照，也不执行 `datedSectionsToKeep` 裁剪；通用的编码归一化、recall refresh、report result 与 job lifecycle 仍继续运行。
- Codex 与 Cindy 的动态 assignment subplan 都必须进入 `end.completed` 且 tasks 非空、全部 `done`。内置 assignment 在没有 external-document stage 时包含六步治理合同；追加 doc-updater 时会在 ADR 后增加 existing-document stage，并把跨语料一致性复查顺延为终末任务。外部治理 skill 与可选 doc-updater 的每项完成结果都纳入同一 job 终态判断。
- `externalTruthSkill` 与 `externalAdrSkill` 只作为 legacy repair input；它们不是当前 schema owner，不能恢复独立 phase policy。
- CLI 初始化入口 `--external-writer-skill <skill>` 写入单项 `knowledgeWriter.externalSkills` 配置。

## 影响

- 项目替换内建治理时，通过 `.claw/project.json` 的 `knowledgeWriter.externalSkills` 配置有序 skill 链，不在适配器里硬编码治理分支。
- `executionPolicy` 在支持多种策略的 host 上只改变 launcher；Cindy 目前固定为 subagent。所有路径共享 immutable job、assignment builder、claim ownership 与 done protocol。Codex 与 Cindy 各自加载内部 delegate template，并通过各自 host route 建立 assignment subplan；不能把 shell bridge 或 Ghost operation 细节描述为所有 host 的共同步骤。

<!-- state: history -->
## Evolution history

<!-- dated: 2026-08-06 -->
### Removed redundant receipt transport

A per-path receipt and CLI transport briefly duplicated evidence already retained by the job, generated assignment plan, tracked subplan, and report. The receipt path was removed while doc-updater remains a template-backed internal resource with active-stage, standalone-plan, and fallback routes.

<!-- dated: 2026-08-04 -->
### Cindy 改为模板拥有 assignment subplan

Cindy 先前在 claim 后由 atomic executor 直接顺序执行 prompts；当前改为加载专用内部 session delegate template，并用 claim 返回的 template 建立 assignment subplan。Ghost transport 与 originating report capture 仍是 Cindy 特有边界。

<!-- dated: 2026-08-01 -->
### Subagent host 与 orchestration 边界扩展

- 早期 `subagent` 只由 Codex 支持，且文档把内部 delegate template 与 assignment subplan 泛化为所有 launcher 的共同步骤。Cindy 后续加入无 plan/subplan 的 atomic executor，并最终收敛为只支持 subagent：即使项目仍写默认 `background`，Cindy job 也以 subagent ready-job 时序创建。两者共享 job、assignments 与 token lifecycle，但 Codex 使用 session delegate plan，Cindy 使用 atomic executor。

<!-- dated: 2026-07-21 -->
### 外部 writer 从严格 skill 执行改为无人值守治理适配

此前外部 writer 只接收最小输入边界且也必须完成 claw session workflow。该约束无法同时适配外部 skill 的人工门与 finalizer 的无人值守执行；当前 runner 统一传递治理 prompt，并仅对内置 writer 保留 session workflow 完成断言。

## 证据

- `packages/core/src/types.ts`
- `packages/core/src/init.ts`
- `packages/core/src/context.ts`
- `packages/core/src/project-check.ts`
- `packages/core/src/plan.ts`
- `packages/cli/src/cli.ts`
- `packages/core/src/knowledge-sidecar.ts`
- `packages/core/src/knowledge-assignments.ts`
- `packages/core/resources/delegate-writer/TEMPLATE.json`
- `packages/core/resources/knowledge-writer/`
