# ADR: Delegated review and deposition

## Status

Accepted

## Context

Codex plugin hooks 不是 `claw-kit` 的可靠基础，因此适配器依赖 prompt-driven workflow skills。随着 planning 语义与质量规则合并，独立 `plan-review` 已不再是核心生命周期阶段，但完成期的 truth/ADR 沉淀仍需要保持 specialist 化，避免主 agent 把规范沉淀写成泛化说明文档。

## Decision

把完成期沉淀固定为 delegated specialist workflow：

- `truth-writer` 负责将可复用稳定知识写入 `.claw/truth/`
- `adr-writer` 负责将 durable decisions 写入 `.claw/truth/adr/`
- 主 agent 负责完成主要任务、准备紧凑 bundle，并消费 canonical truth/ADR 结果
- 不把 generic docs 或执行日志当作默认完成产物

## Consequences

- 主 agent 保留更多上下文窗口用于真实执行与协调
- 完成语义继续与 OpenClaw 风格的 truth/ADR 沉淀对齐
- planning 质量规则停留在核心 planning flow 中，而不是再拆成一个独立 review specialist

## Related Code

- `.claw/truth/`
- `.claw/truth/adr/`
- `packages/codex-adapter/skills/truth-writer/SKILL.md`
- `packages/codex-adapter/skills/adr-writer/SKILL.md`

## Search Terms

- `truth-writer`
- `adr-writer`
- `delegated deposition`
- `durable decisions`
- `canonical truth`
