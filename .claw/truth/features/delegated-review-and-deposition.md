# Delegated review and deposition

- Codex adapter 的 canonical deposition specialists 是 `truth-writer` 与 `adr-writer`；主代理应把可复用知识或 completed `plan.json` 以紧凑 bundle 交给它们，而不是在主上下文里展开成泛化文档。
- `researcher` 是 investigation-first specialist：调查、分析、证据收集类 task 优先交给它，以避免主 agent 为前置调查消耗过多 context。
- `researcher` 默认使用 `worker` + `gpt-5.4-mini` + 显式 `claw-kit:researcher` skill item；同线程已有合适 researcher 时优先复用。
- `researcher` 应先用 `claw search` 检索 `.claw` context、truth、ADR；若 `.claw/project.json` 中 canonical `gitnexus = true`，应发现并使用 GitNexus 相关能力辅助代码调查。
- planning 直接负责计划质量，因此 review 不再作为独立 workflow gate 插在计划推进前。
- canonical completion artifacts 仍落在 `.claw/truth/` 与 `.claw/truth/adr/`。
- specialist dispatch 默认支持同线程复用；`truth-writer`、`adr-writer` 与 `researcher` 不应在仍可能复用时立即关闭。
- 非用户明确要求时，不要产出独立的 generic docs、总结笔记或 PR 风格说明文档。

## Writer 主从边界

- Codex 的 `truth-writer` 与 `adr-writer` `SKILL.md` 均已压缩为 12 行的 delegated-subagent-only 二级路由；frontmatter 明确禁止 main agent 激活 writer。
- 主 agent 负责读取并执行 `workflowGuidance`、判断 completed work 是否包含值得沉淀的 reusable truth、优先复用当前线程中合适的同类型 specialist，并在需要新派发时只提供窄输入 bundle。
- 主 agent 不读取或转述 writer 的完整写作规范；writer skill 只接受窄输入，并要求被派发的 writer subagent 完整读取唯一对应 reference，且不得把 reference 转述回主 agent。
- truth 的完整执行与写入规范位于 `packages/codex-adapter/references/TRUTH-AGENT-SPEC.md`；ADR 的完整执行与写入规范位于 `packages/codex-adapter/references/ADR-AGENT-SPEC.md`。原先位于 writer skill 的耐久性判断、canonical routing、写入规则、时序、边界和返回合同已迁入这两份 reference。
- `truth-writer` 仍由 reusable-truth value gate 控制：只有 completed work 含可复用 truth 时才派发；`adr-writer` 仍是 root-plan closeout 的必需派发步骤。

## Skill 文案写作合同

- claw-kit skill 正文优先使用正向指令，重点说明角色、输入、正确执行顺序、选择条件与完成标准，让 agent 直接获得可执行路径。
- 反向限制只保留安全、数据破坏、授权或协议歧义等确有价值的硬边界，并保持简短；一般流程偏好应改写为正向行为合同，而不是堆叠禁止句。
- 本轮遵循“尽量不大改”的范围，只定点修正高频 `planning`、`using-claw-kit` 与 truth / ADR writer 文案；`config`、`init`、`update`、`researcher`、`search` 中必要的安全与职责边界继续保留。
- truth writer 的输入是 main agent 已筛选出的必要事实与证据；ADR writer 的输入是 completed `plan.json`。两类 writer 都自行负责 canonical routing，主 agent 不预先替 writer 决定落盘文档。

主要证据锚点是 `shared/skills/planning/SKILL.md`、`packages/codex-adapter/skills/using-claw-kit/SKILL.md`、`packages/codex-adapter/skills/truth-writer/SKILL.md`、`packages/codex-adapter/skills/adr-writer/SKILL.md`，以及对应的 OpenCode skills / references。本轮验证通过 Codex bundle `11/11`、OpenCode bundle `6/6`、`npm run check`、frontmatter 解析与 `git diff --check`。

## workflowGuidance 实现事实

- `packages/core/src/workflow-guidance.config.json` 的 `process.hasCompletedTasks` 已要求主 agent 先判断 completed task 是否包含 reusable truth；仅在判断为 true 时才整理 completed subtask report 并执行 returned `truth-writer` contract。
- `process.allTasksDone` 同样把 truth deposition 定义为条件步骤，同时继续要求先写回 `retrospective` 与 `keyDecisions`，再执行 returned `adr-writer` contract 完成 root-plan closeout。
- `delegateSubagents` 仍可返回 truth contract；“返回 contract”不等于“必须 dispatch”。一旦主 agent 选择 truth dispatch，或进入 required ADR closeout，就必须逐字段遵守对应结构化 contract。
- writer delegate 的 `model`、`fork_context`、`waitForCompletion`、`preferReuseSameTypeInThread`、input/output contract 与 keep-open reuse 策略保持不变；本轮只收紧激活边界和职责分层。

## 关联代码

- 主流程路由：`packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- truth 二级路由：`packages/codex-adapter/skills/truth-writer/SKILL.md`
- ADR 二级路由：`packages/codex-adapter/skills/adr-writer/SKILL.md`
- truth 完整规范：`packages/codex-adapter/references/TRUTH-AGENT-SPEC.md`
- ADR 完整规范：`packages/codex-adapter/references/ADR-AGENT-SPEC.md`
- guidance source：`packages/core/src/workflow-guidance.config.json`

## 验证标准

- 两份 writer `SKILL.md` 保持 12 行短路由，frontmatter 含 main-agent 禁用语义，只指向唯一对应 reference。
- 两份 writer reference 承载完整执行合同，writer 返回仅为 optional minimal telemetry，不向主 agent 转述 reference。
- `process.hasCompletedTasks` 与 `process.allTasksDone` 的 summary、nextsteps、notes 都不得恢复无条件 truth dispatch；`process.allTasksDone` 必须继续保留 required ADR closeout。
- 结构化 delegate 参数与同线程 specialist 复用语义不得因路由精简而漂移。

## 落地验证与已知测试漂移

- writer 二级路由定向测试已通过 `1/1`；主锚点是 `packages/codex-adapter/hooks/subagent-contract.test.mjs` 中的 `writer skills stay delegated-subagent-only second-layer routers`，它验证 main-agent 禁用语义、唯一 reference、最多 12 个非空行，以及 reference 文件存在。
- workflow guidance 的核心与 CLI 行为已分别通过 `@veewo/claw-core` `89/89` 和 `@veewo/claw` CLI `55/55`；这些测试覆盖 conditional truth dispatch、required ADR closeout，以及 returned delegate 的 skill/结构化字段保持。
- 完整静态与打包验证通过：`npm run check`、Codex plugin bundle `5/5`、OpenCode adapter check 与 OpenCode plugin bundle `5/5`、`git diff --check`。
- `packages/codex-adapter/hooks/subagent-contract.test.mjs` 的全量 `node --test` 当前另有一个与本轮 writer 边界无关的既有失败：`researcher dispatch contract stays explicit, host-light, and blocking for research work` 仍断言 researcher skill 内含已移除的 search-inline 文案。该失败属于 researcher 测试与现行 skill 的漂移，不能作为 writer 二级路由或 conditional truth dispatch 回归的证据。
- 修复上述 researcher 断言应作为独立范围处理；writer 边界收口不得顺带恢复已从 researcher skill 移除的旧文案，也不得把这项无关修复混入本轮沉淀。
