# External Writer Skill Config

## 状态

这是 `claw-kit` 当前工作流的稳定事实。

## 核心事实

- `.claw/project.json` 现在把 `externalTruthSkill` 和 `externalAdrSkill` 作为显式项目级覆盖字段保存；默认值是 `null`，不是隐式继承或推导值。
- `packages/core/src/init.ts` 在初始化时会写入这两个字段，`packages/core/src/project-check.ts` 与 `packages/core/src/context.ts` 会保持它们为可空字符串或 `null` 的显式形态，避免自动修正把字段吞掉。
- `packages/core/src/workflow-guidance.ts` 生成 `workflowGuidance.delegateSubagents` 时会返回显式 `skill` 字段和显式 `model: "gpt-5.4-mini"`，这样 Codex 适配器不需要再从上下文猜测 writer 绑定。
- 默认 writer 仍然是 `claw-kit:truth-writer` 与 `claw-kit:adr-writer`；当项目配置提供外部覆盖时，路由会切到裸 skill 名称，例如 `external-truth-writer` 和 `external-adr-writer`。
- `packages/cli/src/cli.ts` 新增了 `--external-truth-skill` 与 `--external-adr-skill`，因此 CLI 初始化和项目配置保持一致。
- `README.md`、`packages/codex-adapter/skills/using-claw-kit/SKILL.md`、`packages/codex-adapter/references/codex-subagent-dispatch.md` 已改为直接消费 `delegateSubagents[*].skill` 与 `delegateSubagents[*].model`，而不是依赖旧的隐式 writer 假设。
- `0.1.49` clarified the `delegateSubagents` note: `When dispatching a subagent, each entry is a required structured contract whose fields must be honored directly.` The required part applies to honoring the fields of an entry that is being dispatched; it does not turn every returned optional truth-writer suggestion into an unconditional dispatch requirement.

## 影响

- 以后如果项目需要替换内建 truth/ADR writer，应该优先通过 `.claw/project.json` 的外部 skill 覆盖完成，而不是在适配器里硬编码分支。
- 这套行为与 `truth-writer` / `adr-writer` 的正常沉淀流程兼容，仍然属于同一套 `workflowGuidance` 驱动合同。

## 证据

- [packages/core/src/types.ts](D:/Users/chany/Documents/claw-kit/packages/core/src/types.ts)
- [packages/core/src/init.ts](D:/Users/chany/Documents/claw-kit/packages/core/src/init.ts)
- [packages/core/src/context.ts](D:/Users/chany/Documents/claw-kit/packages/core/src/context.ts)
- [packages/core/src/project-check.ts](D:/Users/chany/Documents/claw-kit/packages/core/src/project-check.ts)
- [packages/core/src/workflow-guidance.ts](D:/Users/chany/Documents/claw-kit/packages/core/src/workflow-guidance.ts)
- [packages/core/src/plan.ts](D:/Users/chany/Documents/claw-kit/packages/core/src/plan.ts)
- [packages/cli/src/cli.ts](D:/Users/chany/Documents/claw-kit/packages/cli/src/cli.ts)
- [README.md](D:/Users/chany/Documents/claw-kit/README.md)
- [packages/codex-adapter/skills/using-claw-kit/SKILL.md](D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/using-claw-kit/SKILL.md)
- [packages/codex-adapter/references/codex-subagent-dispatch.md](D:/Users/chany/Documents/claw-kit/packages/codex-adapter/references/codex-subagent-dispatch.md)
