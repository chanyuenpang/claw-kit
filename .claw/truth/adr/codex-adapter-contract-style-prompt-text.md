# ADR: Codex Adapter Uses Contract-Style Prompt Text

## Status

Accepted

## Context

`claw-kit` 的 Codex adapter prompt 曾长期混用 `should`、`may`、`when available`、`when practical`、`if the tools are visible` 这类表述。对于 workflow contract 来说，这会让 agent 在执行时额外承担不必要的判断，导致流程结果不稳定。

当前 adapter 已经有足够明确的前提：

- Codex 具备 multi-agent 能力
- `workflowGuidance` 是 CLI 返回的正式下一步合同
- `.claw/project.json` 是项目级 harness 声明面

因此，prompt surface 需要从建议式表述收紧为合同式表述。

## Decision

Codex adapter prompt 采用 contract-style wording：

- 对 workflow、delegation、goal、truth、ADR、planning 的执行动作使用直接合同语气
- 明确写出 `Codex has multi-agent capability.`
- 当需要定位 agent-management 工具时，直接要求使用 `tool_search`
- 对进入 `process.active`、truth deposition、ADR deposition、researcher delegation 等步骤写出明确触发条件和动作
- 只在真实边界描述中保留事实性限定，而不是把执行合同写成建议

## Consequences

- agent 更容易稳定执行 workflow，而不是临场猜测流程
- prompt surface 能与 `workflowGuidance` 形成一致的 contract
- 需要主 agent 额外判断的分支显著减少
- skill 和 reference 文本需要持续维护，避免回退成宽泛建议风格

## Related code

- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/codex-adapter/skills/plan-workflow/SKILL.md`
- `packages/codex-adapter/skills/planning/SKILL.md`
- `packages/codex-adapter/skills/researcher/SKILL.md`
- `packages/codex-adapter/skills/truth-writer/SKILL.md`
- `packages/codex-adapter/skills/adr-writer/SKILL.md`
- `packages/codex-adapter/references/workflow-guidance-consumption.md`
- `packages/codex-adapter/references/codex-subagent-dispatch.md`
