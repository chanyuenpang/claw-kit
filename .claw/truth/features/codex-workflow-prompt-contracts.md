# Codex Workflow Prompt Contracts

## Status

Accepted working truth for the current Codex adapter prompt surface.

## Core facts

- `codex-adapter` 的 workflow、skill 和 reference 文本需要优先表达执行合同，而不是宽泛建议。
- 对主流程有约束力的语句，不应继续使用 `may`、`should`、`when practical`、`if visible` 这类会让 agent 额外判断的表述。
- `Codex has multi-agent capability.` 是当前 adapter 的明确前提。
- 当需要派发 specialist 时，应使用 `tool_search` 定位当前线程可用的 agent-management 工具。
- plan 第一次进入 `process.active` 时，应读取 `workflowGuidance.goalMode`，并使用 `recommendedObjective` 创建线程 goal。
- truth、ADR、research、planning、workflowGuidance 消费规则都应写成直接执行的合同。

## Workflow implications

- 主 agent 先使用 `plan write` 建立 task scope，再依据 `workflowGuidance` 推进主流程。
- 调查型 task 使用 researcher specialist，完成期 truth 和 ADR 使用 writer specialist。
- task 相关 supporting docs 放在 `plan.references`，而不是依赖 task-local search。
- `claw search` 负责 project-scope recall；GitNexus 调查入口通过 `tool_search` 定位对应工具。

## Related files

- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/codex-adapter/skills/plan-workflow/SKILL.md`
- `packages/codex-adapter/skills/planning/SKILL.md`
- `packages/codex-adapter/skills/researcher/SKILL.md`
- `packages/codex-adapter/skills/truth-writer/SKILL.md`
- `packages/codex-adapter/skills/adr-writer/SKILL.md`
- `packages/codex-adapter/references/workflow-guidance-consumption.md`
- `packages/codex-adapter/references/codex-subagent-dispatch.md`

## Boundaries

- 这里约束的是 Codex adapter 的 prompt contract，不直接改变 core 的 canonical file semantics。
- 事实边界仍可保留事实性表述；只有执行合同需要消除不必要的条件判断。
