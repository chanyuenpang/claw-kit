# ADR: claw-kit 工作流耗时优化路线

## Status

Accepted

## Context

正式 claw workflow 的耗时审计确认，主要摩擦不是必要的计划、验证或可追溯性本身，而是围绕真实开发工作的固定管理动作：planning/meta-task 膨胀、CLI plan 与 host progress/Goal Mode 的重复状态同步、逐任务 truth 派发，以及每次 `claw search` 独立启动本地 embedding worker。实测热态 `plan show` 约 143ms，而两次 search 分别约 3.95s。

初始审计仅完成研究与决策准备。后续第一阶段现已在仓库源码中落地，但全局 CLI 与本地插件的 `0.1.63` runtime 仍是旧版本；这些新合同必须经过发布和本地运行时刷新后，才会出现在实际 SessionStart 与 plan 输出中。

`0.1.67` 的正式无代码闭环复测进一步确认：lifecycle 延迟基本持平，三次 `claw search` 均值约 4.35s，相对 `0.1.63` 旧三次均值慢约 3.6%，因此当前不能宣称 workflow 性能提升。`workflowGuidance`、Goal Mode 与 writer dispatch 的可审计闭环均正常，但 task-id 恢复、多次 plan mutation、同步 query embedding 和 closeout 链路仍是可观察摩擦。

## Decision

按以下顺序推进后续优化：

1. 第一阶段已在仓库源码中实现：新项目和缺省配置使用 `truthDispatch=final_only`，显式 `per_task` 继续作为 opt-in；planning 的正常预算是 2–4 个 downstream outcome tasks，阶段只作为覆盖检查；final-only 中间任务不再机械调用 `update_plan` 或写入 `in_progress`，进入执行与最终收尾同步仍然保留。
2. writer 派发采用单一 `dispatch` 合同，替代含义重叠的 `required=false` 与 `dispatchCondition` 组合：`truth-writer` 使用 `dispatch=when_reusable_truth_confirmed`，由 main agent 判断 completed work 是否存在 reusable truth，确认后才派发；`adr-writer` 使用 `dispatch=required`，继续作为 root plan closeout 的强制步骤。
3. writer deposition 必须采用 writer-owned routing：main agent 不负责选择 canonical 文件；writer 使用 `claw search` 召回候选，再只读取相关匹配，仅在 search 不可用、候选冲突或重复性仍无法判定时，才退回全量检查。truth writer 的输入是筛选后的必要事实与证据，ADR writer 的输入是补齐 retrospective 与 durable `keyDecisions` 的 completed `plan.json`。该路径不削弱 writer 对完整 reference 的读取、事实核验、目标路径 containment、编码正确性和有界重复检查。
4. `claw search` 第一阶段前台提速采用保守 lexical fast path 与有界 query embedding cache，不在同步 search API 上强行引入常驻 daemon。fast path 只接受 `strongTerms` 完整覆盖并且唯一文件名/路径或唯一精确短语命中的结果；任何不确定性继续回退既有 hybrid search。query cache 存放于项目 `memory.sqlite`，cache key 由版本、完整 embedding config fingerprint 与最终 worker query text 组成，最多保留 128 条，并在 embedding config vector reset 时清空。
5. local embedding 的跨 CLI 复用采用独立的 loopback TCP daemon：以随机 token 认证、原子 state discovery、startup locking、embedding configuration fingerprint、有界 session LRU 和 idle TTL 管理生命周期。local provider 优先尝试 persistent daemon；daemon 启动或 transport 失败时回退既有 one-shot worker，但 model inference error 保持权威，不通过第二次模型加载重试。remote provider 继续使用 one-shot 路径。
6. 最后处理 host/runtime 架构成本：由 adapter 自动桥接 CLI plan 事件到 host progress/Goal Mode。

复杂任务的计划、验证、完成期 truth/ADR 沉淀和可追溯性继续保留，不以削弱质量门禁换取表面提速。每项实现必须通过按真实任务复杂度分层的 A/B 验证，并共同观察首个有效工作时间、端到端总时长、工具调用数、状态写入次数、收尾时间和质量回归。

## Alternatives Considered

- 直接取消正式 planning、验证或 canonical deposition：拒绝，因为这会用治理质量换取时长，无法满足复杂任务的可追溯性要求。
- 先微调单次 `plan show` 性能：暂不优先，因为热态耗时相对较低，固定管理动作和 search runtime 启动成本的预期收益更高。
- 一次性同时重构 plan、search 与 host bridge：拒绝，因为难以归因收益与质量回归；应按优先级分阶段验证。

## Consequences

- 第一阶段已减少默认路径的 planning 膨胀、逐任务状态同步和无价值 truth 派发，同时保留显式 `per_task`、执行入口同步、验证与 ADR 收尾合同。
- truth deposition 的价值判断明确归 main agent 所有；`dispatch=when_reusable_truth_confirmed` 不等于必须派发，而 root-plan ADR deposition 的 `dispatch=required` 仍然必须执行。
- writer-owned routing 成为强制边界：main agent 无需理解 canonical 文件布局；writer 依赖 `claw search` 做文档召回，只读相关候选，同时保留必要时的受控全量 fallback。
- 路由提速不得绕过 deposition 的完整 reference 读取、事实验证、路径 containment、编码检查和有界重复检查。
- writer-owned routing 已消除可控的 ADR corpus 扫描，但 fresh-agent 定向样本未证明端到端耗时下降，因此不能宣称 writer 整体已经加速；后续性能工作应聚焦 writer 启动与模型处理延迟。
- `0.1.67` 的端到端复测仍未证明 workflow 提速；下一轮优化应继续优先降低 `claw search` 的同步 embedding 延迟与首个业务动作前的 lifecycle mutation，而不是移除 `workflowGuidance`、Goal Mode 或 writer dispatch 的审计合同。
- 保守 lexical fast path 与配置感知的 SQLite query embedding cache 已落地：源码 CLI 实测精确路径 cold 345ms、warm 157/160ms；全新语义查询首次 5064ms、第二次 cache hit 188ms，且 top result 保持一致。core 118/118、CLI 63/63、完整 `npm test` 与 `npm run check` 均通过。
- 严格唯一性门槛把 lexical 提速限制在可证明安全的查询上；模糊查询继续承担首次 embedding 成本并保留现有 semantic hybrid recall。cache 的完整配置指纹、版本和 128 条上限避免跨配置误用与无界增长。
- persistent local-embedding worker 已在现有同步调用边界内落地；真实两个不同、未命中 query cache 的语义查询复用同一 daemon session，从 3078ms cold 降至 452ms warm。core 121/121、CLI 64/64、plugin contract 19/19 与 `npm run check` 均通过。
- daemon 是可选性能层而不是可用性单点：random-token loopback endpoint、配置指纹、启动锁、LRU 与 idle TTL 约束复用边界；startup/transport failure 安全回退 one-shot worker，而 inference failure 不重复加载模型，避免掩盖真实模型错误。
- 原子 refine-and-activate 与自动状态桥接仍是后续方向。
- `0.1.65` 是单一 `dispatch` 与 writer-owned routing 合同的首个已发布版本；npm、全局 CLI 和 Codex plugin cache 均已刷新到该版本线。
- 性能结论不能只看单条命令基准；必须同时覆盖交互成本、状态写入、首个有效工作时间和质量回归。
- 分阶段 A/B 让每项收益可归因，并允许在质量指标回退时停止推进对应路线。

## Related Code

- `.claw/tasks/研究-claw-kit-插件开发耗时与流程优化空间/plan.json`
- `.claw/tasks/实施-claw-kit-第一阶段流程耗时优化/plan.json`
- `.claw/tasks/优化-truth-和-ADR-writer-的合同与执行速度/plan.json`
- `.claw/tasks/按正向指令原则-review-claw-kit-插件-skills/plan.json`
- `.claw/archive/tasks/验证-0.1.67-最新-claw-流程的效率与流畅度/plan.json`
- `.claw/tasks/提速-claw-search-冷启动并验证前台性能/plan.json`
- `.claw/tasks/实现-claw-search-persistent-embedding-worker/plan.json`
- `packages/core/src/init.ts`
- `packages/core/src/context.ts`
- `packages/core/src/project-check.ts`
- `packages/core/src/types.ts`
- `packages/core/src/workflow-guidance.config.json`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/codex-adapter/skills/planning/SKILL.md`
- `packages/codex-adapter/references/ADR-AGENT-SPEC.md`
- `packages/codex-adapter/references/workflow-guidance-consumption.md`
- `shared/skills/planning/SKILL.md`
- `packages/opencode-adapter/workflow-guidance.opencode.json`
- `packages/core/src/plan.ts`
- `packages/core/src/memory.ts`
- `packages/core/src/embedding-worker.ts`

## Search Terms

- `workflow cost`
- `truthDispatch final_only`
- `dispatch=when_reusable_truth_confirmed`
- `dispatch=required`
- `writer-owned routing`
- `claw search candidate routing`
- `bounded duplicate check`
- `writer startup latency`
- `model processing latency`
- `plan refine-and-activate`
- `FTS-first`
- `Goal Mode bridge`
- `embedding worker reuse`
- `time to first effective work`
- `state writes`
- `A/B validation`
- `0.1.65`
- `0.1.67 workflow benchmark`
- `synchronous query embedding latency`
- `lexical fast path`
- `query embedding cache`
- `embedding config fingerprint`
- `128 query vectors`
- `persistent embedding worker`
- `loopback TCP daemon`
- `random-token authentication`
- `atomic state discovery`
- `startup locking`
- `session LRU`
- `idle TTL`
- `one-shot worker fallback`
