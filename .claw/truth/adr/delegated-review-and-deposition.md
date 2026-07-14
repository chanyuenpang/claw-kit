# ADR: Delegated review and deposition

## Status

Accepted

## Context

Codex plugin hooks 不是 `claw-kit` 的可靠基础，因此适配器依赖 prompt-driven workflow skills。随着 planning 语义与质量规则合并，独立 `plan-review` 已不再是核心生命周期阶段，但完成期的 truth/ADR 沉淀仍需要保持 specialist 化，避免主 agent 把规范沉淀写成泛化说明文档。

如果 `truth-writer` 与 `adr-writer` 的完整执行规范继续留在入口 `SKILL.md`，main agent 在派发前容易加载 writer 实现细节，模糊“主 agent 负责价值判断与派送、writer 负责 canonical deposition”的边界。writer 还需要在缺少主线程完整上下文时，仅凭窄输入独立执行。

## Decision

把完成期沉淀固定为 delegated specialist workflow：

- `truth-writer` 负责将可复用稳定知识写入 `.claw/truth/`
- `adr-writer` 负责将 durable decisions 写入 `.claw/truth/adr/`
- 两个 writer 的 `SKILL.md` 仅作为 delegated-subagent-only 二级路由：声明 subagent 身份、窄输入边界、唯一对应 reference，以及最小返回合同
- 完整执行规范分别由 `packages/codex-adapter/references/TRUTH-AGENT-SPEC.md` 与 `packages/codex-adapter/references/ADR-AGENT-SPEC.md` 承载；被派发的 writer 必须完整读取对应 reference，并独立完成沉淀
- 主 agent 只消费 `workflowGuidance` 派送契约、优先复用同类型 specialist、准备紧凑 bundle，并消费 canonical truth/ADR 结果；不读取或转述 writer 的完整执行规范
- `truth-writer` 仅在主 agent 判断 completed work 含 reusable truth 时派发；`adr-writer` 继续作为 root-plan closeout 的必需派发步骤
- 一旦选择 truth 派发或进入 required ADR closeout，`model`、`fork_context`、`waitForCompletion`、`preferReuseSameTypeInThread` 及 input/output contract 等结构化字段必须逐项遵守
- 不把 generic docs 或执行日志当作默认完成产物

## Alternatives Considered

- 保留包含完整写作规范的 writer `SKILL.md`：拒绝，因为会让 main agent 暴露于 specialist 实现细节，并使入口 skill 失去短路由职责。
- 让 main agent 在派发前读取 writer reference：拒绝，因为窄输入 specialist 应自行加载完整规范，主线程只需保留价值判断与派送契约。
- 对所有 completed work 无条件派发 `truth-writer`：拒绝，因为 truth deposition 必须保留 reusable-value gate；required 语义只适用于 root-plan 的 ADR closeout。

## Consequences

- 主 agent 保留更多上下文窗口用于真实执行与协调
- writer 可以在 `fork_context: false` 的窄 bundle 下独立恢复完整写作规则，避免依赖主线程隐式上下文
- truth 的价值判断与实际沉淀职责分离：main agent 决定是否值得派发，writer 决定如何写入 canonical truth
- writer 入口与完整规范形成可测试的二级路由契约，后续不得把实现细节重新堆回 `SKILL.md`
- 完成语义继续与 OpenClaw 风格的 truth/ADR 沉淀对齐
- planning 质量规则停留在核心 planning flow 中，而不是再拆成一个独立 review specialist

## Related Code

- `.claw/truth/`
- `.claw/truth/adr/`
- `packages/core/src/workflow-guidance.config.json`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/codex-adapter/skills/truth-writer/SKILL.md`
- `packages/codex-adapter/skills/adr-writer/SKILL.md`
- `packages/codex-adapter/references/TRUTH-AGENT-SPEC.md`
- `packages/codex-adapter/references/ADR-AGENT-SPEC.md`
- `packages/codex-adapter/hooks/subagent-contract.test.mjs`

## Search Terms

- `truth-writer`
- `adr-writer`
- `delegated deposition`
- `delegated-subagent-only`
- `second-layer router`
- `reusable truth`
- `root-plan closeout`
- `durable decisions`
- `canonical truth`
