# ADR: claw-kit 工作流耗时优化路线

## Status

Accepted

## Context

正式 claw workflow 的耗时审计确认，主要摩擦不是必要的计划、验证或可追溯性本身，而是围绕真实开发工作的固定管理动作：planning/meta-task 膨胀、CLI plan 与 host progress/Goal Mode 的重复状态同步、逐任务 truth 派发，以及每次 `claw search` 独立启动本地 embedding worker。实测热态 `plan show` 约 143ms，而两次 search 分别约 3.95s。

初始审计仅完成研究与决策准备。后续第一阶段现已在仓库源码中落地，但全局 CLI 与本地插件的 `0.1.63` runtime 仍是旧版本；这些新合同必须经过发布和本地运行时刷新后，才会出现在实际 SessionStart 与 plan 输出中。

`0.1.67` 的正式无代码闭环复测进一步确认：lifecycle 延迟基本持平，三次 `claw search` 均值约 4.35s，相对 `0.1.63` 旧三次均值慢约 3.6%，因此当前不能宣称 workflow 性能提升。`workflowGuidance`、Goal Mode 与 writer dispatch 的可审计闭环均正常，但 task-id 恢复、多次 plan mutation、同步 query embedding 和 closeout 链路仍是可观察摩擦。

`0.1.68` 的同机正式闭环复测确认，search 优化已经产生可归因收益，但 plan lifecycle 没有提速：精确 lexical fast path、persistent daemon warm miss 与 query cache hit 均显著快于 `0.1.67` 语义 search 基线，而 `plan show` 基本持平，planning mutations 部分更慢。因此 search 局部提速不能外推为 formal workflow 整体提速。

后续真实端到端冒烟还确认，版本号一致不足以证明线程已进入最新优化路径：线程绑定的 plugin skill snapshot、全局 CLI 实际暴露的命令能力与仓库源码可能分别漂移。若线程仍受旧 snapshot 或旧 CLI contract 约束，即使源码已经包含原子 `claw plan start`，实跑仍可能落入多次 mutation 的 legacy lifecycle。

`0.1.69` 的真实端到端复测确认 registry、全局 CLI、仓库源码、项目配置与线程 plugin snapshot 处于同一版本线。热态 `plan show` 约 143–149ms，lexical search 墙钟约 173–186ms，persistent-daemon 语义 search 约 402–405ms，query cache hit 约 205ms；core 126/126、CLI 72/72 与完整 check 均通过。相较 `0.1.67` 约 4.35s 的语义 search 基线，search 已数量级提速，但长计划的主要剩余摩擦转为 CLI plan 与 host progress 双写、逐任务 truth 判断，以及 writer/completion refresh 异步状态协调。

`0.1.70` 的同机正式验收进一步确认版本线、关键 capability 与质量门禁一致，atomic workflow 可用，测试 `198/198` 与完整 check 均通过。热态 plan/search 已处于亚秒级，首次 daemon 冷启动约 3.2s；复杂任务 formal workflow 的整体性能已经足够高，但结论仍须按 plan lifecycle、lexical、daemon cold/warm、query cache hit、writer 与 completion refresh 分层。验收同时发现 equal-version 分支把 `projectVersionAligned` 返回为 `false` 的诊断合同缺陷；这不代表实际版本漂移，也不应阻断已由多层版本与 capability 证据证明的工作流验收。

`0.1.75` 的正式验收确认流程体验相较旧路径明显更连贯，热态性能相对 `0.1.70` 持平到小幅提升。可归因的主要改善是 atomic `plan start` 与 Codex `hostActions` 自动桥接减少了交互和状态搬运，并非新的数量级 CLI 提速；`198/198` 与完整 check 均通过。仍需分别观察 cold search、错误命令的 exit-code 语义，以及 `workflowGuidance` writer model 与宿主模型能力清单的对齐。

## Decision

按以下顺序推进后续优化：

1. 第一阶段对 planning 预算和状态同步的优化继续有效；当时的 `truthDispatch=final_only` / `per_task` 配置与 main-agent writer dispatch 仅作为版本化性能证据保留，不再是 current project schema 或 lifecycle owner。
2. 当前 writer orchestration 由 `hook-owned-two-phase-knowledge-finalization.md` 拥有：Stop/session-idle 创建 job，finalizer 固定按 Truth 后 ADR 的顺序运行；main agent 不执行 reusable-truth gate 或 required ADR dispatch。
3. Writer deposition 保持 writer-owned routing：main agent 不负责选择 canonical 文件；focused writer 使用 `claw search` 和完整候选 disposition 选择 owner，并在必要时做受控全量 fallback。输入统一来自 completed plan 与相邻可信 report；该路径不削弱完整候选阅读、事实核验、路径 containment、编码正确性和 one-owner consistency。
4. `claw search` 第一阶段前台提速采用保守 lexical fast path 与有界 query embedding cache，不在同步 search API 上强行引入常驻 daemon。fast path 只接受 `strongTerms` 完整覆盖并且唯一文件名/路径或唯一精确短语命中的结果；任何不确定性继续回退既有 hybrid search。query cache 存放于项目 `memory.sqlite`，cache key 由版本、完整 embedding config fingerprint 与最终 worker query text 组成，最多保留 128 条，并在 embedding config vector reset 时清空。
5. local embedding 的跨 CLI 复用采用独立的 loopback TCP daemon：以随机 token 认证、原子 state discovery、startup locking、embedding configuration fingerprint、有界 session LRU 和 idle TTL 管理生命周期。local provider 优先尝试 persistent daemon；daemon 启动或 transport 失败时回退既有 one-shot worker，但 model inference error 保持权威，不通过第二次模型加载重试。remote provider 继续使用 one-shot 路径。
6. host/runtime 架构成本通过原子 `claw plan start` 与 versioned plan events 收敛：CLI plan state 保持 canonical，adapter 仅消费幂等 `hostActions`，单向同步 host progress 与 Goal Mode。
7. 性能回归必须把 search 路径与 plan lifecycle 分开报告。search 至少分别记录 exact lexical、semantic one-shot、daemon cold、daemon warm 与 query cache hit；workflow 还需单列 plan mutation 与 closeout。在 plan mutation 成本下降前，不以 search 单点收益宣称 formal workflow 整体提速。
8. search 性能判断以 `route`、`queryEmbedding`、`embeddingRuntime` 与 `durationMs` telemetry 为准。词法路径无需模型、当前 persistent daemon warm 已低于一秒，因此不在 plan create 时无条件预热 embedding。
9. complexity gate 的 dependency 维度只计算独立风险，不与 files、steps 或 workflow shape 重复计分。completed plan 没有 durable `keyDecisions` 时，ADR writer 立即 no-op，不先扫描 ADR corpus。
10. workflow 性能复测必须同时记录线程绑定的 plugin skill snapshot、全局 CLI 的实际命令能力与仓库源码状态。版本号只能作为线索；只有三层合同一致且目标命令在真实 CLI surface 可用，才可把样本归入最新优化路径。
11. complexity gate 继续作为 formal workflow 的入口边界：低复杂度请求直接绕过 formal flow；复杂任务保留 planning、Goal Mode、truth/ADR deposition 与验证门禁，不用删减质量合同换取表面流畅度。
12. 下一阶段优先让 Codex 自动消费幂等 `hostActions`、减少 CLI plan state 与 host progress 的重复写入，并增强 writer 与 completion refresh 的状态可观察性；CLI plan state 仍是 canonical source，不引入 host 侧反向所有权。
13. `projectVersionAligned` 的诊断不变量是：项目版本与运行时版本相等时必须返回 `true`。equal-version 分支返回 `false` 应作为独立诊断合同缺陷修复，不能被解释为真实版本漂移，也不能覆盖 registry、CLI capability、source、project protocol 与 thread snapshot 的一致性证据。
14. 后续验收和性能结论继续按 plan lifecycle、lexical search、daemon cold/warm、query cache、writer 与质量门禁分层；不得以任一 search 样本替代整体 workflow 结论。下一轮优化优先降低 cold search 延迟，修正错误命令的 exit-code 合同，并使 `workflowGuidance` writer model 与宿主模型能力清单一致。

复杂任务的计划、验证、完成期 truth/ADR 沉淀和可追溯性继续保留，不以削弱质量门禁换取表面提速。每项实现必须通过按真实任务复杂度分层的 A/B 验证，并共同观察首个有效工作时间、端到端总时长、工具调用数、状态写入次数、收尾时间和质量回归。

## Alternatives Considered

- 直接取消正式 planning、验证或 canonical deposition：拒绝，因为这会用治理质量换取时长，无法满足复杂任务的可追溯性要求。
- 先微调单次 `plan show` 性能：暂不优先，因为热态耗时相对较低，固定管理动作和 search runtime 启动成本的预期收益更高。
- 一次性同时重构 plan、search 与 host bridge：拒绝，因为难以归因收益与质量回归；应按优先级分阶段验证。

## Consequences

- 第一阶段减少 planning 膨胀和逐任务状态同步的结果继续有效；当时的 `per_task` 与 main-agent writer dispatch 结论已经被 hook-owned finalization 取代。
- Knowledge value extraction 与 deposition 由两个 focused phases 完成；main agent 不拥有 truth dispatch gate 或 ADR required-dispatch contract。
- writer-owned routing 成为强制边界：main agent 无需理解 canonical 文件布局；writer 依赖 `claw search` 做候选召回、完整读取和明确 disposition，同时保留必要时的受控全量 fallback。
- 路由提速不得绕过 deposition 的完整 reference 读取、事实验证、路径 containment、编码检查和有界重复检查。
- writer-owned routing 已消除可控的 ADR corpus 扫描，但 fresh-agent 定向样本未证明端到端耗时下降，因此不能宣称 writer 整体已经加速；后续性能工作应聚焦 writer 启动与模型处理延迟。
- `0.1.67` 的端到端复测仍未证明 workflow 提速；其 writer-dispatch 观测只作为历史基线，current 审计对象是 hook queue、两个 writer phases 与 completion refresh。
- `0.1.68` 复测中，精确路径 search 为 cold `295ms`、warm `172ms` / `175ms`；semantic one-shot miss 为 `4161ms`，daemon cold miss 为 `2958ms`，daemon warm miss 为 `536ms`，同 query cache hit 为 `401ms`。这些成功样本均返回稳定 top result，证明 fast path、daemon session 复用与 query cache 的局部收益，但不代表统一 search 延迟。
- 同轮 `plan show` warm 均值约 `153ms`，与 `0.1.67` 约 `151ms` 基本持平；create、planning patch、append 与 done mutations 分别为 `587ms`、`524ms`、`437ms`、`397ms`，未证明 plan lifecycle 提速。后续 formal workflow 性能声明必须同时包含 plan mutation 与 closeout 证据。
- 保守 lexical fast path 与配置感知的 SQLite query embedding cache 已落地：源码 CLI 实测精确路径 cold 345ms、warm 157/160ms；全新语义查询首次 5064ms、第二次 cache hit 188ms，且 top result 保持一致。core 118/118、CLI 63/63、完整 `npm test` 与 `npm run check` 均通过。
- 严格唯一性门槛把 lexical 提速限制在可证明安全的查询上；模糊查询继续承担首次 embedding 成本并保留现有 semantic hybrid recall。cache 的完整配置指纹、版本和 128 条上限避免跨配置误用与无界增长。
- persistent local-embedding worker 已在现有同步调用边界内落地；真实两个不同、未命中 query cache 的语义查询复用同一 daemon session，从 3078ms cold 降至 452ms warm。core 121/121、CLI 64/64、plugin contract 19/19 与 `npm run check` 均通过。
- daemon 是可选性能层而不是可用性单点：random-token loopback endpoint、配置指纹、启动锁、LRU 与 idle TTL 约束复用边界；startup/transport failure 安全回退 one-shot worker，而 inference failure 不重复加载模型，避免掩盖真实模型错误。
- 原子 refine-and-activate 与自动状态桥接已经落地；固定 Windows A/B 把首个业务动作前的管理命令从 `6` 降至 `3`，atomic path P50 相对 legacy path 改善 `57.35%`。
- search telemetry 已能区分 lexical fast path、persistent daemon、cache 与 one-shot fallback；固定样本的 lexical P95 为 `315.35ms`、daemon semantic P95 为 `602.93ms`，而成功的 one-shot fallback 为 `4392.01ms`，因此保持按 route 报告并拒绝无条件 plan-create 预热。
- complexity gate 在 `12` 个 low / medium / high 语料上把 legacy low false-positive rate 从 `0.5` 降为 `0`，formal recall 与 overall accuracy 均为 `1`；该结果支持 dependency 独立风险计分，而不是删减 formal workflow 的质量门禁。
- 无 durable `keyDecisions` 的 ADR phase no-op 缩短无决策 finalization；有决策时的 writer-owned routing、canonical deposition 与验证合同保持不变。
- 第二阶段完成后，端到端性能声明仍必须同时覆盖 plan mutation、search、writer 与 completion refresh，不能用任一单条 search benchmark 代表整体 workflow。
- 复测报告需要显式标注 skill snapshot、CLI capability 与 source revision；任一层漂移时，结果只能描述该组合下的真实路径，不能据源码存在或版本号相同宣称已验证最新合同。
- `0.1.65` 的单一 `dispatch` 是历史性能基线；其中 writer-owned routing 被保留，而 main-agent dispatch 已由 hook-owned two-phase finalization 取代。
- `0.1.69` 同版本线复测进一步证明 route 分层仍是性能结论的必要前提：lexical、persistent daemon 与 cache hit 均处于亚秒级，但它们不能替代 plan lifecycle、writer 和 completion refresh 的端到端证据。
- `0.1.70` 验收在 atomic workflow、`198/198` 测试与完整 check 全部成功的前提下，确认复杂任务 formal workflow 的性能已足够高；首次 daemon 冷启动约 3.2s 仍应与热态和 cache hit 分开报告，不能用单点 search 提速外推整体性能。
- `0.1.75` 复测证明当前流程的主要体验收益来自 atomic `plan start` 与 Codex `hostActions` 自动桥接，热态表现相对 `0.1.70` 持平到小幅提升；这不能表述为新的数量级 CLI 提速。
- cold search、错误命令 exit-code 语义与 writer model capability 对齐是独立的后续质量和效率工作项，不能由热态成功样本掩盖。
- `projectVersionAligned` 的 equal-version 误报被隔离为诊断合同缺陷；修复该字段时必须保持 CLI plan canonical state、单向 host synchronization 与现有多层版本/capability 验证边界。
- complex workflow 的质量门禁继续保留，low-complexity 请求则由 complexity gate 避免无效管理成本；后续效率收益应来自 Codex host action 自动桥接、减少双写和提高异步 closeout 可观察性。
- 性能结论不能只看单条命令基准；必须同时覆盖交互成本、状态写入、首个有效工作时间和质量回归。
- 分阶段 A/B 让每项收益可归因，并允许在质量指标回退时停止推进对应路线。

## Related Code

- `.claw/tasks/研究-claw-kit-插件开发耗时与流程优化空间/plan.json`
- `.claw/tasks/实施-claw-kit-第一阶段流程耗时优化/plan.json`
- `.claw/tasks/优化-truth-和-ADR-writer-的合同与执行速度/plan.json`
- `.claw/tasks/按正向指令原则-review-claw-kit-插件-skills/plan.json`
- `.claw/archive/tasks/验证-0.1.67-最新-claw-流程的效率与流畅度/plan.json`
- `.claw/tasks/测试-claw-0.1.68-新版流程流畅度与性能/plan.json`
- `.claw/tasks/测试当前-claw-插件性能与流程效率/plan.json`
- `.claw/tasks/评测-claw-kit-0.1.69-的性能、流程流畅度与执行效率/plan.json`
- `.claw/tasks/验收-claw-kit-0.1.70-的性能、流程流畅度与效率/plan.json`
- `.claw/tasks/验证-claw-kit-0.1.75-流程丝滑度与运行效率/plan.json`
- `.claw/tasks/提速-claw-search-冷启动并验证前台性能/plan.json`
- `.claw/tasks/实现-claw-search-persistent-embedding-worker/plan.json`
- `.claw/tasks/实施-claw-kit-第二阶段端到端性能与流程优化/plan.json`
- `packages/core/src/init.ts`
- `packages/core/src/context.ts`
- `packages/core/src/project-check.ts`
- `packages/core/src/types.ts`
- `packages/core/src/workflow-guidance.config.json`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/codex-adapter/skills/planning/SKILL.md`
- `packages/core/src/knowledge-sidecar.ts`
- `shared/skills/truth-writer/SKILL.md`
- `shared/skills/adr-writer/SKILL.md`
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
- `0.1.68 workflow benchmark`
- `plan lifecycle versus search performance`
- `semantic one-shot daemon cold daemon warm query cache hit`
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
- `search telemetry route queryEmbedding embeddingRuntime durationMs`
- `no plan-create embedding prewarm`
- `complexity dependency independent risk`
- `ADR no-op without durable keyDecisions`
- `end-to-end workflow performance claim`
- `plugin skill snapshot CLI capability source drift`
- `0.1.70 workflow acceptance`
- `0.1.75 workflow acceptance`
- `cold search exit code writer model capability alignment`
- `projectVersionAligned equal-version false`
- `equal-version diagnostic contract`
