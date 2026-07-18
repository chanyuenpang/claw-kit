# Codex Workflow Prompt Contracts

## Status

Accepted working truth for the current Codex adapter prompt surface.

## Core facts

- `codex-adapter` 的 workflow、skill 和 reference 文本需要优先表达执行合同，而不是宽泛建议。
- 对主流程有约束力的语句，不应继续使用 `may`、`should`、`when practical`、`if visible` 这类会让 agent 额外判断的表述。
- `Codex has multi-agent capability.` 是当前 adapter 的明确前提。
- 当需要派发 specialist 时，应使用 `tool_search` 定位当前线程可用的 agent-management 工具。
- plan 第一次进入 `process.active` 时，应读取 `workflowGuidance.goalMode`，并使用 `recommendedObjective` 创建线程 goal。
- knowledge stewardship、research、planning、workflowGuidance 消费规则都应写成直接执行的合同。

## Workflow implications

- `using-claw-kit` 的当前入口路由由 `using-claw-kit-session-entry.md` 与 `codex-plugin-workflow-mechanics.md` 拥有；本文件不再重复其 prompt guidance 检查、next-step 来源优先级或具体入口句子。
- 调查型 task 使用 researcher specialist；完成期 Truth/ADR 由 hook-owned `knowledge-writer` 处理，不属于 main-agent specialist dispatch。
- task 相关 supporting docs 放在 `plan.references`，而不是依赖 task-local search。
- `claw search` 负责 project-scope recall；GitNexus 调查入口通过 `tool_search` 定位对应工具。

## 历史对比沉淀

- 以实际运行对比 `ff03a3c`（约 `0.1.11`）和 `084adb9`（约 `0.1.25`）可见，旧版 workflow 并不因为更早就更轻；在 `plan write` 阶段它同时暴露过 `askUser`、`goalMode`、`nextAction`、`instruction`、`recommendedCommands` 等多条并行 surface。
- 新版的真实改进主要发生在 `plan write` 本身：task-scope 入口更窄、更干净；但 writer dispatch contract 明显更重，也更显式，主流程会直接看到 `skill`、`model`、`fork_context` 等派发细节。
- 这次体验型调查表明，workflow feel 的主要回退点不是“`plan write` 变复杂”这一单点，而是 startup 恢复、task scope 建立、进入 `process.active` 被拆到了过多可见 surface。
- 当可见入口先被 `claw context` / startup recovery 抢走，再叠加一个不够唯一的 `plan write`，以及不够突出的 `process.active` 过渡时，主 agent 更容易遗漏“先写 plan”或“计划后切到 active 执行”这两个关键动作。
- 结果上，结构化合同并没有消失，但会被并列 surface 稀释：`plan write` 不再像唯一的 task-scope 入口，`process.active` 也不再像 planning 之后最醒目的主状态切换。

## Related files

- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/codex-adapter/skills/plan-workflow/SKILL.md`
- `packages/codex-adapter/skills/planning/SKILL.md`
- `packages/codex-adapter/skills/researcher/SKILL.md`
- `packages/codex-adapter/skills/knowledge-writer/`
- `packages/codex-adapter/references/workflow-guidance-consumption.md`
- `packages/codex-adapter/references/codex-subagent-dispatch.md`

## Boundaries

- 这里约束的是 Codex adapter 的 prompt contract，不直接改变 core 的 canonical file semantics。
- 事实边界仍可保留事实性表述；只有执行合同需要消除不必要的条件判断。
