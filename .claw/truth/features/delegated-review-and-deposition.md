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

- Main agent 只依据 writer skill 的 frontmatter `description` 选择并派发 specialist，不内联读取 writer 正文；被派发的 writer subagent 必须完整读取对应 `SKILL.md` 后执行。
- Codex 的 `truth-writer` 与 `adr-writer` `SKILL.md` 都是 delegated-subagent-only 的自包含执行合同；完整的 Mission、Input、canonical routing、writing rules、workflow 与 return 均位于各自 `SKILL.md`。
- Codex 与 OpenCode 的 `TRUTH-AGENT-SPEC.md`、`ADR-AGENT-SPEC.md` 已删除。writer 每次执行都必须完整读取自包含合同，因此二级 reference 不再提供渐进加载价值。
- writer 正文只采用“已被派发的 subagent”视角，描述自身输入、路由、写入与验证职责；正文不承载 main-agent 职责、caller、派发时机或另一个 writer 的职责。
- OpenCode writer skills 与 agents 同步采用 subagent 视角，避免在 writer 上下文中重新引入 caller 或 main-agent 叙事。
- `truth-writer` 仍由 reusable-truth value gate 控制：只有 completed work 含可复用 truth 时才派发；`adr-writer` 仍是 root-plan closeout 的必需派发步骤。

## Search-owned canonical discoverability

- Truth writer 与 ADR writer 不承担任何 `SUMMARY.md` 的创建、维护、分层或覆盖职责。
- canonical truth / ADR 的召回、候选去重与可发现性统一由 `claw search` 负责；writer 写入后应验证目标可被 `claw search` 发现，而不是维护并行导航清单。
- `packages/core/src/init.ts` 的初始化只创建 `.claw/truth/` 目录，不创建 `SUMMARY.md`；`packages/core/src/completion-hooks.ts` 的完成提示也不再建议维护 Summary。
- 当前 corpus 基线为 `0` 个 `SUMMARY.md`、`87` 篇 canonical Markdown。`packages/core/src/memory.ts` 的 `collectProjectMemorySources(...)` 仍排除旧项目遗留的任意 `SUMMARY.md`，防止历史导航内容污染 search，同时继续递归索引 canonical 正文。
- writer 写入的仓库位置继续统一使用项目根目录相对路径；search-owned discoverability 不改变路径 containment、事实核对或 encoding 验证职责。

## Skill 文案写作合同

- claw-kit skill 正文优先使用正向指令，重点说明角色、输入、正确执行顺序、选择条件与完成标准，让 agent 直接获得可执行路径。
- 反向限制只保留安全、数据破坏、授权或协议歧义等确有价值的硬边界，并保持简短；一般流程偏好应改写为正向行为合同，而不是堆叠禁止句。
- 本轮遵循“尽量不大改”的范围，只定点修正高频 `planning`、`using-claw-kit` 与 truth / ADR writer 文案；`config`、`init`、`update`、`researcher`、`search` 中必要的安全与职责边界继续保留。
- truth writer 的输入是 main agent 已筛选出的必要事实与证据；ADR writer 的输入是 completed `plan.json`。两类 writer 都自行负责 canonical routing，主 agent 不预先替 writer 决定落盘文档。
- truth writer 与 ADR writer 在 canonical 文档中记录任何仓库位置时，统一使用项目根目录相对路径；该规则覆盖正文、Markdown 链接、证据和 related-code sections，确保项目知识可跨机器与工作目录复用。

主要证据锚点是 `packages/codex-adapter/skills/truth-writer/SKILL.md`、`packages/codex-adapter/skills/adr-writer/SKILL.md`、`packages/opencode-adapter/skills/truth-writer/SKILL.md`、`packages/opencode-adapter/skills/adr-writer/SKILL.md`、对应 OpenCode writer agents，以及 Codex / OpenCode contract tests。

## workflowGuidance 实现事实

- `packages/core/src/workflow-guidance.config.json` 的 `process.hasCompletedTasks` 已要求主 agent 先判断 completed task 是否包含 reusable truth；仅在判断为 true 时才整理 completed subtask report 并执行 returned `truth-writer` contract。
- `process.allTasksDone` 同样把 truth deposition 定义为条件步骤，同时继续要求先写回 `retrospective` 与 `keyDecisions`，再执行 returned `adr-writer` contract 完成 root-plan closeout。
- `delegateSubagents` 仍可返回 truth contract；“返回 contract”不等于“必须 dispatch”。一旦主 agent 选择 truth dispatch，或进入 required ADR closeout，就必须逐字段遵守对应结构化 contract。
- writer delegate 的 `model`、`fork_context`、`waitForCompletion`、`preferReuseSameTypeInThread`、input/output contract 与 keep-open reuse 策略保持不变；本轮只收紧激活边界和职责分层。

## 关联代码

- 主流程路由：`packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- Codex truth 自包含合同：`packages/codex-adapter/skills/truth-writer/SKILL.md`
- Codex ADR 自包含合同：`packages/codex-adapter/skills/adr-writer/SKILL.md`
- guidance source：`packages/core/src/workflow-guidance.config.json`
- OpenCode truth 自包含合同：`packages/opencode-adapter/skills/truth-writer/SKILL.md`
- OpenCode ADR 自包含合同：`packages/opencode-adapter/skills/adr-writer/SKILL.md`
- OpenCode writer agents：`packages/opencode-adapter/agents/claw-truth-writer.md`、`packages/opencode-adapter/agents/claw-adr-writer.md`
- Codex contract tests：`packages/codex-adapter/hooks/subagent-contract.test.mjs`
- OpenCode contract tests：`scripts/opencode-plugin-bundle.test.mjs`
- 初始化边界：`packages/core/src/init.ts`
- completion guidance：`packages/core/src/completion-hooks.ts`
- search source collection：`packages/core/src/memory.ts`

## 验证标准

- Codex 与 OpenCode 的四份 writer `SKILL.md` 必须保留完整的 Mission、Input、canonical routing、writing rules、workflow 与 return，并保持 delegated-subagent-only frontmatter。
- Writer 合同及 OpenCode agents 必须只使用被派发 subagent 视角；不得恢复 main-agent 职责、caller、派发时机、其他 writer 职责或 `AGENT-SPEC` 二级 reference。
- Main agent 的调用边界应保持为：按 frontmatter `description` 派发，writer subagent 再完整读取自身 `SKILL.md`。
- `process.hasCompletedTasks` 与 `process.allTasksDone` 的 summary、nextsteps、notes 都不得恢复无条件 truth dispatch；`process.allTasksDone` 必须继续保留 required ADR closeout。
- 结构化 delegate 参数与同线程 specialist 复用语义不得因路由精简而漂移。
- Writer skills / agents 与 contract tests 不得恢复 Summary 职责；`npm run check` 必须继续覆盖该合同。

## 落地验证

- Node YAML frontmatter 等价校验通过，证明 Codex 与 OpenCode writer skill 的 frontmatter 可按同一语义解析。
- `packages/codex-adapter/hooks/subagent-contract.test.mjs` 的 Codex contract tests `3/3` 通过。
- `scripts/opencode-plugin-bundle.test.mjs` 覆盖的 OpenCode contract tests `6/6` 通过。
- `npm run check` 与 `git diff --check` 通过。
- Python `quick_validate` 未进入校验阶段，仅因当前环境缺少 `PyYAML` 无法启动；这属于验证工具依赖缺失，不是 writer contract 失败。
