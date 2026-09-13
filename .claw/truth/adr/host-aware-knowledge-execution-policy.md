# ADR: Host-aware knowledge execution policy matrix

- Status: accepted
- Date: 2026-09-13

## Context

`knowledgeWriter.executionPolicy` 只有 `background | subagent` 两个值，但两个值的可用性完全取决于宿主能力：`background` 依赖 turn 级报告捕获加可用后台执行者，`subagent` 依赖原生子代理加 claim 时报告收集器。平台差异此前硬编码在 adapter 与 `HostIntegrationProfile.forcesSubagentKnowledgeWriter` 中，项目配置无法按 host 表达不同策略；能力最弱的 hostless standard 形态没有"零捕获、主代理自沉淀"的低摩擦选项，且协议校验强制每个项目显式写死一个全局值。

## Decision

1. 引入第三个策略值 `main-agent`：不收集任何聊天记录、不建 report 与 finalization job，main agent 在 plan 终态通过既有 `claw knowledge prepare/complete --source agent-memory` 路由自行沉淀；复用 direct assignments（`buildDirectKnowledgeAssignments`），不新建 prompt 体系。root plan 终态的 `workflowGuidance` 携带该两步 closeout 链。
2. `HostIntegrationProfile` 以能力矩阵取代 `forcesSubagentKnowledgeWriter`：`allowedKnowledgeExecutionPolicies` + `defaultKnowledgeExecutionPolicy`。codex 开放全部三值（默认 background）；cindy/dsh 开放 main-agent + subagent（默认 subagent，保留 background→subagent legacy coercion）；opencode 与 standard 开放 main-agent + background（opencode 默认 background，standard 默认 main-agent）。
3. `executionPolicy` 在 project.json 中可选：省略时按运行 host 的矩阵默认解析，而非全局物化 `background`；`claw init` 脚手架不再写入该字段。显式配置 host 不支持的值仍在 plan closeout 前 fail-fast（保持 0.2.38 已发布行为）。
4. 解析分层为两个函数：`fillKnowledgeExecutionPolicyDefault`（缺省填 host 默认、显式值透传，供 fail-fast 断言点）与 `resolveKnowledgeExecutionPolicyForHost`（全量 coerce，供 runtime 防御路径）。hostless（无 host）调用按 standard profile 解析。`resolveKnowledgeWriterForHost` 是唯一运行时解析点：base writer → plan 模板 override → `knowledgeWriterByHost[host]` 字段级合并 → 矩阵解析；caller 未传 writer 时回落 projectConfig。
5. `knowledgeWriterByHost` 作为 project.json sibling 键存在（不嵌进 `knowledgeWriter`），因为 writer 快照会被复制进 registry/job 文件，sibling 形状避免覆盖表泄漏进 job。

## Alternatives

- 保留全局双值 + adapter ���编码：无法表达"同一仓库在不同 host 用不同策略"，standard 形态得不到低摩擦默认。否决。
- 缺省时静默 coerce 而非 fail-fast：会掩盖用户显式配置的意图（如 hostless 上显式 subagent 被悄悄换成 main-agent）。否决——显式不支持值必须可见地失败，coerce 只用于缺省兜底与 cindy/dsh legacy 路径。
- 嵌套 `knowledgeWriter.hosts`：快照泄漏问题（见 Decision 5）。否决。

## Consequences

- 一个仓库可同时服务能力不同的 host（本仓库即首例：base `main-agent` + `knowledgeWriterByHost.codex = subagent`）。
- 未显式配置的存量项目升级后行为随 host 变化（standard hostless 从 background 变为 main-agent）：用户可自行显式写回；CHANGELOG 记录该行为变化。
- main-agent 会话不产生 report/job 审计痕迹，沉淀质量依赖 invoking agent 的记忆完整性；cindy/dsh 保持 subagent 默认以保留报告捕获质量。
- 验证锚点：core 181/181、cli 189/190（唯一失败为基线即存在的 maintenance-prewarm 环境问题，stash 验证与本次改动无关）、adapter bundle 测试全绿。

## Evidence

- `packages/core/src/integration-contract.ts`（矩阵与解析函数）
- `packages/core/src/knowledge-sidecar.ts`（resolveKnowledgeWriterForHost、main-agent 运行时开关）
- `packages/core/src/workflow-guidance.ts`（applyMainAgentCloseoutGuidance）
- `packages/core/src/project-check.ts`、`packages/core/src/context.ts`、`packages/core/src/init.ts`（schema 与脚手架）
- `packages/cli/test/invocation-host.test.ts`（矩阵断言）
- `.claw/project.json` + `.claw/project-override.json`（本仓库 dogfood：移除个人覆盖的冗余全局 subagent，改用 byHost）
