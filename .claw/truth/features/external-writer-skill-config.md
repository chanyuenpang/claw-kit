# External Writer Skill Config

<!-- state: current -->
## 状态

这是 `claw-kit` 当前工作流的稳定事实。

## 核心事实

- `.claw/project.json` 以 `knowledgeWriter` 对象保存 writer 内容配置：`externalSkills`、`model`、`reasoningEffort` 与 `datedSectionsToKeep`，并可用 sibling 键 `knowledgeWriterByHost` 按 host 做字段级覆盖（键 ∈ `codex | opencode | cindy | dsh | standard`，未指定字段继承 base writer；覆盖表只存在于解析点，不随 writer 快照写入 registry/job）。执行路线由 invoking adapter 固定拥有，不再由 `executionPolicy` 选择；旧字段只作为兼容输入被丢弃，新写入拒绝。`model`/`reasoningEffort` 是冻结的尽力偏好，不是 exact-match 门禁：launcher 在发送前解析受支持的 applied recipe 并记录真实选择或 unknown，不能因软偏好缺失阻塞，也不能借此放宽权限/capture/claim 与未知投递保护。
- 固定宿主路线见 `docs/2026-10-02-fixed-host-knowledge-closeout.md`：Codex/Cindy/DSH 由各自 adapter 派发原生 writer，OpenCode 走其 idle capture，standard/hostless 由 main agent 执行 agent-memory prepare/complete。旧 policy 事实只保留在历史段，不应驱动当前路由。
- `externalSkills` 的非空有序列表选择真实外部 skill assignments；列表缺失或为空时选择 Core 内部 built-in governance assignment。该内置 contract 不以 `claw-kit:knowledge-writer` 用户 skill 发布。`datedSectionsToKeep` 的治理语义由 `truth-and-adr-corpus-semantics.md` 唯一拥有。
- 终态 owner 按固定宿主合同冻结 job/材料；后续重试使用该快照，不从变更后的项目配置重新推导 governance。模型软偏好可以在新的、未发送 admission 前按当前宿主能力解析；一旦 admitted 或投递未知，执行 identity 与 applied recipe 不迁移。
- claim 把冻结配置解析为有序 assignments 与一次性 template。Required canonical assignments 按序执行并诚实报告失败；可选 external-doc task 以记录实际结果完成，不因 updater 失败否定已成功的 Truth/ADR 维护。main agent 不根据 `keyDecisions` 拆分固定 Truth/ADR phase。
- `memory.autoUpdate` 有效时，在所选 canonical writer 之后追加冻结范围内已有文档的可选 doc-updater assignment。其 changed paths、no-edit reason 或 failure 独立报告，保留 unresolved inconsistency，不回滚 canonical 成功。job、generated assignment plan、tracked subplan 与 report 仍是审计边界；`knowledge done` 不要求独立 doc-update receipt。
- 内置与外部 assignment 使用不同 prompt builder。内置 prompt 直接展开隐藏治理 contract；外部 prompt 明确调用配置的 skill、要求无人值守且禁止询问、确认或等待交互。两者都要求使用 task status 区分已完成 scope 与 pending / blocked intent，禁止把 requirements 或 intentions 写成结果，也禁止在 governed docs 中引用会被销毁的 supplied materials。
- 外部 skill 自己选择治理方法，但与内置及 same-agent route 一样必须复用现有 `knowledge-format.md` 的 canonical Truth/ADR 最小格式、事实证据、实现锚点，并保留无关编辑。内置 retention 偏好不强加给外部 skill；finalizer 对任何 route 都不建立治理快照或执行 dated trimming。
- 内置 assignment template 只有 canonical 维护与一致性复查两个 outcome tasks；可选 doc-updater 插入两者之间。外部 assignments 保留配置顺序，但不规定推理阶段。Core canonical completion 只维护既有 identity/claim/CAS 安全，不检查任意 session workflow 的 `end.completed`、非空 tasks 或全部 done。
- `externalTruthSkill` 与 `externalAdrSkill` 只作为 legacy repair input；它们不是当前 schema owner，不能恢复独立 phase policy。
- CLI 初始化入口 `--external-writer-skill <skill>` 写入单项 `knowledgeWriter.externalSkills` 配置。

## 影响

- 项目替换内建治理时，通过 `.claw/project.json` 的 `knowledgeWriter.externalSkills` 配置有序 skill 链，不在适配器里硬编码治理分支。
- 固定 host 路线共享 immutable job、assignment builder、claim ownership 与 done protocol；各 adapter 通过自己的 route 建立 assignment subplan。不能把某一宿主的 shell、Ghost、Team 或 native subagent 细节描述成所有 host 的共同步骤。

<!-- state: history -->
## Evolution history

<!-- dated: 2026-09-13 -->
### executionPolicy 从双值全局默认改为 host-aware 三值

此前 `executionPolicy` 只接受 `background | subagent`，协议校验要求显式存在，缺省归一化为全局 `background`，cindy/dsh 通过 profile 的 `forcesSubagentKnowledgeWriter` 强制 subagent。当前为三值可选 + host capability matrix（`allowedKnowledgeExecutionPolicies` / `defaultKnowledgeExecutionPolicy`，见 `adr/host-aware-knowledge-execution-policy.md`）。旧事实对理解 0.2.38 及以前的行为与配置迁移仍有用。

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
