# ADR: claw-kit 工作流耗时优化路线

## Status

Accepted

## Context

正式 claw workflow 的耗时审计确认，主要摩擦不是必要的计划、验证或可追溯性本身，而是围绕真实开发工作的固定管理动作：planning/meta-task 膨胀、CLI plan 与 host progress/Goal Mode 的重复状态同步、逐任务 truth 派发，以及每次 `claw search` 独立启动本地 embedding worker。实测热态 `plan show` 约 143ms，而两次 search 分别约 3.95s。

初始审计仅完成研究与决策准备。后续第一阶段现已在仓库源码中落地，但全局 CLI 与本地插件的 `0.1.63` runtime 仍是旧版本；这些新合同必须经过发布和本地运行时刷新后，才会出现在实际 SessionStart 与 plan 输出中。

## Decision

按以下顺序推进后续优化：

1. 第一阶段已在仓库源码中实现：新项目和缺省配置使用 `truthDispatch=final_only`，显式 `per_task` 继续作为 opt-in；planning 的正常预算是 2–4 个 downstream outcome tasks，阶段只作为覆盖检查；final-only 中间任务不再机械调用 `update_plan` 或写入 `in_progress`，进入执行与最终收尾同步仍然保留。
2. writer 派发采用结构化条件合同：`truth-writer` 返回 `required=false` 与 `dispatchCondition=main_agent_confirms_reusable_truth`，由 main agent 判断 completed work 是否存在 reusable truth，无可复用 truth 时不派发；`adr-writer` 返回 `required=true`，继续作为 root plan closeout 的强制步骤。
3. 后续再降低高频命令成本：实现原子化 plan refine-and-activate，并为 `claw search` 增加 FTS-first 自适应快速路径。
4. 最后处理 host/runtime 架构成本：由 adapter 自动桥接 CLI plan 事件到 host progress/Goal Mode，并复用常驻 embedding worker。

复杂任务的计划、验证、完成期 truth/ADR 沉淀和可追溯性继续保留，不以削弱质量门禁换取表面提速。每项实现必须通过按真实任务复杂度分层的 A/B 验证，并共同观察首个有效工作时间、端到端总时长、工具调用数、状态写入次数、收尾时间和质量回归。

## Alternatives Considered

- 直接取消正式 planning、验证或 canonical deposition：拒绝，因为这会用治理质量换取时长，无法满足复杂任务的可追溯性要求。
- 先微调单次 `plan show` 性能：暂不优先，因为热态耗时相对较低，固定管理动作和 search runtime 启动成本的预期收益更高。
- 一次性同时重构 plan、search 与 host bridge：拒绝，因为难以归因收益与质量回归；应按优先级分阶段验证。

## Consequences

- 第一阶段已减少默认路径的 planning 膨胀、逐任务状态同步和无价值 truth 派发，同时保留显式 `per_task`、执行入口同步、验证与 ADR 收尾合同。
- truth deposition 的价值判断明确归 main agent 所有；返回 truth delegate 不等于必须派发，而 root-plan ADR deposition 仍然必须执行。
- FTS-first 快速路径、原子 refine-and-activate、自动状态桥接和常驻 worker 仍只是接受的后续方向，尚未实现。
- 在完成发布和本地 CLI/plugin refresh 前，当前全局与本地 `0.1.63` runtime 仍不会体现第一阶段新合同。
- 性能结论不能只看单条命令基准；必须同时覆盖交互成本、状态写入、首个有效工作时间和质量回归。
- 分阶段 A/B 让每项收益可归因，并允许在质量指标回退时停止推进对应路线。

## Related Code

- `.claw/tasks/研究-claw-kit-插件开发耗时与流程优化空间/plan.json`
- `.claw/tasks/实施-claw-kit-第一阶段流程耗时优化/plan.json`
- `packages/core/src/init.ts`
- `packages/core/src/context.ts`
- `packages/core/src/project-check.ts`
- `packages/core/src/types.ts`
- `packages/core/src/workflow-guidance.config.json`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/codex-adapter/skills/planning/SKILL.md`
- `packages/codex-adapter/references/workflow-guidance-consumption.md`
- `shared/skills/planning/SKILL.md`
- `packages/opencode-adapter/workflow-guidance.opencode.json`
- `packages/core/src/plan.ts`
- `packages/core/src/memory.ts`
- `packages/core/src/embedding-worker.ts`

## Search Terms

- `workflow cost`
- `truthDispatch final_only`
- `required=false`
- `main_agent_confirms_reusable_truth`
- `adr-writer required=true`
- `plan refine-and-activate`
- `FTS-first`
- `Goal Mode bridge`
- `embedding worker reuse`
- `time to first effective work`
- `state writes`
- `A/B validation`
