# ADR: Delegated review and deposition

## Status

Accepted

## Context

Codex plugin hooks 不是 `claw-kit` 的可靠基础，因此适配器依赖 prompt-driven workflow skills。随着 planning 语义与质量规则合并，独立 `plan-review` 已不再是核心生命周期阶段，但完成期的 truth/ADR 沉淀仍需要保持 specialist 化，避免主 agent 把规范沉淀写成泛化说明文档。

早期实现把 writer 的 `SKILL.md` 作为短路由，把完整执行规范放在 `TRUTH-AGENT-SPEC.md` 与 `ADR-AGENT-SPEC.md`。但 reference 对已派发 writer 是无条件必读内容，不具备按需披露价值；合同拆成两份文件反而增加加载步骤、同步面和遗漏风险。writer 仍需要在缺少主线程完整上下文时，仅凭窄输入独立完成 canonical deposition。

## Decision

把完成期沉淀固定为 delegated specialist workflow：

- `truth-writer` 负责将可复用稳定知识写入 `.claw/truth/`
- `adr-writer` 负责将 durable decisions 写入 `.claw/truth/adr/`
- Codex 与 OpenCode 的四份 writer `SKILL.md` 都是单文件、自包含的 delegated-subagent 合同，正文直接包含 Mission、Input、Routing、Writing、Workflow 与 Return
- frontmatter `name` 与 `description` 服务技能识别和派发；正文只面向已派发 writer，不承载 main agent 视角、caller、派发时机或另一个 writer 的职责
- 删除 Codex 与 OpenCode 下无条件必读的 `TRUTH-AGENT-SPEC.md` 与 `ADR-AGENT-SPEC.md`，不再维护二级 reference 跳转
- OpenCode 的 writer agent 定义与两份自包含 skill 保持相同的 subagent 视角
- 主 agent 只消费 `workflowGuidance` 派送契约、优先复用同类型 specialist、准备紧凑 bundle，并消费 canonical truth/ADR 结果；不读取或转述 writer 的完整执行规范
- `truth-writer` 仅在主 agent 判断 completed work 含 reusable truth 时派发；`adr-writer` 继续作为 root-plan closeout 的必需派发步骤
- 一旦选择 truth 派发或进入 required ADR closeout，`model`、`fork_context`、`waitForCompletion`、`preferReuseSameTypeInThread` 及 input/output contract 等结构化字段必须逐项遵守
- 不把 generic docs 或执行日志当作默认完成产物

## Alternatives Considered

- 保留短 `SKILL.md` 加无条件必读 reference：拒绝，因为没有减少 writer 实际加载内容，却扩大了合同同步面并引入跳转遗漏风险。
- 在 writer 正文保留 caller、派发时机和跨 writer 分工：拒绝，因为这些属于派发端 workflow 合同，不属于已派发 specialist 的执行上下文。
- 让 Codex 与 OpenCode 维护不同 writer 合同：拒绝，因为同一 deposition 语义会随 host 漂移。
- 对所有 completed work 无条件派发 `truth-writer`：拒绝，因为 truth deposition 必须保留 reusable-value gate；required 语义只适用于 root-plan 的 ADR closeout。

## Consequences

- 主 agent 保留更多上下文窗口用于真实执行与协调
- writer 可以在 `fork_context: false` 的窄 bundle 下从单个 `SKILL.md` 恢复完整写作规则，避免依赖主线程隐式上下文
- truth 的价值判断与实际沉淀职责分离：main agent 决定是否值得派发，writer 决定如何写入 canonical truth
- writer 的识别元数据与执行正文位于同一文件，但职责明确分层；合同测试应防止 reference 跳转和 main-agent 视角回流
- Codex/OpenCode 的 writer 合同拥有更小的文件同步面，移除 reference 后不得重新引入运行时引用
- 完成语义继续与 OpenClaw 风格的 truth/ADR 沉淀对齐
- planning 质量规则停留在核心 planning flow 中，而不是再拆成一个独立 review specialist

## Related Code

- `.claw/truth/`
- `.claw/truth/adr/`
- `packages/core/src/workflow-guidance.config.json`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/codex-adapter/skills/truth-writer/SKILL.md`
- `packages/codex-adapter/skills/adr-writer/SKILL.md`
- `packages/opencode-adapter/skills/truth-writer/SKILL.md`
- `packages/opencode-adapter/skills/adr-writer/SKILL.md`
- `packages/opencode-adapter/agents/claw-truth-writer.md`
- `packages/opencode-adapter/agents/claw-adr-writer.md`
- `packages/codex-adapter/hooks/subagent-contract.test.mjs`
- `scripts/opencode-plugin-bundle.test.mjs`

## Search Terms

- `truth-writer`
- `adr-writer`
- `delegated deposition`
- `delegated-subagent-only`
- `single-file writer contract`
- `self-contained SKILL.md`
- `TRUTH-AGENT-SPEC.md`
- `ADR-AGENT-SPEC.md`
- `reusable truth`
- `root-plan closeout`
- `durable decisions`
- `canonical truth`
