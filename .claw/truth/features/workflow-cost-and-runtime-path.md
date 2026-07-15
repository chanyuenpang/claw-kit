# Claw workflow 成本与真实执行路径审计

## 结论

- 正式 claw workflow 的主要成本不只来自业务执行，还来自合同版本漂移、plan lifecycle mutation、writer 派发、query embedding、completion refresh 与 GitNexus 分析。
- lifecycle 元状态与业务进度必须分开理解：planning 与 `Enter process.active` 用于建立/切换执行状态，不应计入业务 task 数，也不应独立触发 truth deposition。
- `truthDispatch = "per_task"` 应解释为“每个已完成业务 task 都评估是否产生 reusable truth”，而不是“每个 task 无条件派发 writer”。
- 新项目与省略配置的默认值已经是 `truthDispatch = "final_only"`；`per_task` 仍是显式 opt-in，适合长计划或高学习密度计划。
- 当前项目配置为 `goalMode = true`、`truthDispatch = "per_task"`；正式 workflow 因而同时协调 `.claw` plan state、Codex `update_plan`、线程 Goal Mode 与按业务 task 评估后的 writer 派发。这些 surface 都属于真实生命周期成本。
- 优化时应先修复合同一致性与条件语义，再降低 plan mutation 和后台 refresh 成本；complexity gate 应在最后用真实 task outcome 校准。

## 已验证的执行事实

### 版本与合同漂移

- 2026-07-16 审计时，仓库 source、`.claw/project.json` 与全局 CLI 均为 `0.1.63`；但长线程可以继续绑定旧的 plugin skill snapshot，例如 `0.1.12+codex.*`。
- 旧 snapshot 的入口合同是 `plan write` 且在 planning 前执行 `claw search`；当前 source 合同是先经过 complexity gate，需要正式流程时执行 `plan create`，再在相应阶段执行 search。线程绑定旧 snapshot 时，会出现已移除/变更命令继续被推荐，或低复杂度请求误入 formal flow。
- 主要合同锚点是 `packages/codex-adapter/skills/using-claw-kit/SKILL.md` 与 `shared/skills/planning/SKILL.md`；判断运行时行为时必须同时核对当前 CLI 版本和线程实际绑定的 skill snapshot，不能只看仓库 source。

### Plan lifecycle mutation 成本

- 默认 `claw plan create` 会固定种入 planning task 与 `Enter process.active` bridge task，模板锚点是 `packages/core/src/templates/plans/default.ts`。
- 这两个默认 meta task 会在 substantive execution 前形成可见 lifecycle work；它们用于计划细化和进入 `process.active`，不应被误计为业务进度。
- 当前 `claw plan edit` 不允许在一次 edit 中同时提交 `patch.tasks` 与 `taskId` / `taskStatus`；对应校验与序列化路径在 `packages/core/src/plan.ts`。
- 因此 formal flow 在首个业务动作前需要分别完成 plan hydration、planning task 状态更新和 activation；对于 `N` 个业务 task，执行期还至少需要 `N` 次 done 状态更新。首个业务动作前的 plan mutation 数和业务 task 数应分别统计。
- 2026-07-16 在当前仓库、当前机器上的 `claw plan show` 实测为 cold `265ms`，随后 warm `143ms` / `143ms`。这些数字用于区分 plan-state CLI 固定开销与 search/model 初始化开销，不是跨机器常量。

### Truth delegation 条件语义

- workflow delegate output 现在通过 `dispatch` 直接表达 writer 派发语义：`truth-writer` 使用 `dispatch: "when_reusable_truth_confirmed"`，`adr-writer` 使用 `dispatch: "required"`；旧的 `required: false` 与 `dispatchCondition` 字段已经移除。类型与配置锚点分别是 `packages/core/src/types.ts` 和 `packages/core/src/workflow-guidance.config.json`。
- main agent 只有在确认 completed work 含 reusable truth 后才派发 truth writer；没有可复用 truth 时不得仅因 contract 存在而 spawn。ADR writer 仍属于 required dispatch，其具体执行边界由 ADR writer contract 约束。
- Codex truth / ADR writer references 已统一这条 dispatch 解释；对应锚点是 `packages/codex-adapter/references/TRUTH-AGENT-SPEC.md` 与 `packages/codex-adapter/references/ADR-AGENT-SPEC.md`，避免 `per_task` 把“每 task 判断一次”误读为“每 task 无条件派发”。
- 以上是当前未发布的 source contract；已安装的全局 `0.1.64` 仍会返回该版本发布时的旧 guidance。判断 live 行为时必须区分工作树 source 与当前 CLI/runtime 版本。

### Writer target routing 与性能

- Codex `truth-writer` / `adr-writer` router 启动后仍完整读取各自 reference；这部分固定读取成本不是当前主要瓶颈。
- canonical target routing 属于 writer 自身职责，不应要求 main agent 先理解 truth/ADR 文件布局或选择目标。writer 使用 `claw search` 召回候选 canonical 文档，再只读取相关候选；只有 search 不可用、候选冲突或 canonical routing 仍无法确定时，才回退到 full-corpus inspection。
- 历史 release closeout 实测中，宽泛 ADR 任务两次分别约 `40-90s` 与 `90s`，且都没有落盘；把输入收敛为唯一 `targetPath` 与两条追加事实后，约 `10s` 完成。该对比说明主要优化点是 target certainty，而不是删除 router/reference 合同。
- 本轮 fresh-agent 前向验证中，明确 `targetPath` 的 ADR 约 `70s` 落盘，truth 约 `85s` 落盘；两者均正确走定向写入且没有修改索引，但端到端时延没有稳定优于历史样本。当前改动能确认消除了不必要的 corpus 扫描，不能据此宣称 subagent 总耗时已经下降；剩余时延主要位于 writer 启动、模型处理和完整 deposition 合同执行。
- 两类 dispatch 输入必须保持不同：truth writer 接收 main agent 筛选后的必要事实与证据；ADR writer 只接收补齐 retrospective 与 durable `keyDecisions` 的 completed `plan.json`，由 writer 自己提取决策。两者都不要求 main agent 提供 `targetPath`。
- writer-owned routing 不得删除完整 reference 阅读、事实核对、目标路径 containment、UTF-8 BOM / encoding 校验，以及新建或路由不确定时必要的去重。

### 第一阶段优化的已实现行为

- `packages/core/src/init.ts`、`packages/core/src/context.ts` 与 `packages/core/src/project-check.ts` 已将新建、初始化和省略的 `truthDispatch` 统一规范化为 `final_only`；显式 `per_task` 保持兼容，CLI 的 per-task contract 测试也必须显式 opt-in。
- `process.hasCompletedTasks.finalOnlyTruth` 不再强制 Codex `update_plan`，也不再建议为马上完成的工作写一次独立 `in_progress`；进入 `process.active` 与 `process.allTasksDone` 的 host synchronization 合同保持不变。
- shared / Codex / OpenCode planning skills 已把 downstream plan 约束为通常 `2-4` 个 outcome-oriented tasks；planning stages 是 coverage checklist，不是必须逐项转成 task 的模板，planning / activation lifecycle meta tasks 不计入业务 outcomes。
- verification 和 closure 都不是默认阶段，由 main agent 根据具体任务自由判断是否需要。
- `docs/project-json-reference.md` 与 config guide 已把 `final_only` 记为默认值。当前实现验证通过 core `114/114`、CLI `63/63`、Codex plugin bundle `11/11`、OpenCode bundle `6/6`，以及包含全部 adapter checks 与 truth encoding audit 的 `npm run check`；mid-task truth CLI 测试显式设置 `per_task`，验证 opt-in 路径仍然成立。
- 上述 workflow 合同同步到 core、Codex 与 OpenCode surface 后，Codex bundle `11/11`、OpenCode bundle `6/6`，且完整 `npm run check` 通过。

### Search 同步路径与基线

- `claw search` 的 project query 路径会同步 spawn `packages/core/src/embedding-worker.ts` 生成 query embedding；入口与编排锚点是 `packages/cli/src/cli.ts`、`packages/core/src/memory.ts`。
- 根因位于 `packages/core/src/memory.ts`：每次 hybrid project search 都会在 FTS ranking 前调用 `runEmbeddingWorker`；该函数通过 `spawnSync` 启动独立的 `embedding-worker.js` 进程，所以每条 CLI query 都会重新支付进程与模型初始化成本。
- 当前仓库、当前机器上的三次实测耗时约为 `4.075s`、`4.199s`、`4.316s`；2026-07-16 对同一 ready index 的追加测量为 `3.954s`、`3.963s`。这些数字是 `0.1.63` 环境基线，不应当作跨机器固定常量。

### Completion refresh 路径与基线

- `claw plan done` 会启动后台 completion refresh，并串行刷新 project memory、task memory 与 GitNexus；状态证据位于 `.claw/logs/completion-refresh/`。
- 对历史 `61` 个成功日志的统计是 median `6.62s`、P90 `54.8s`、max `354.86s`。该分布适合作为回归基线，不能替代新版本/新机器复测。
- `packages/core/src/memory.ts` 当前在 SQLite write transaction 内执行 memory embedding，慢 embedding 可能长时间持有写锁；refresh 尚无 single-flight / coalescing，重叠请求可能重复工作并提高 busy/locked 风险。
- GitNexus-enabled 的首次或漂移环境会在 `plan done` 前同步执行 install/setup/enable embeddings，后台 refresh 随后再次 analyze；如果没有 dirty-state 或分析结果去重，会存在双重分析风险。CLI 路由锚点是 `packages/cli/src/cli.ts`。

## 审计判断与优化顺序

### P0：合同一致性

- 先解决 source / CLI / thread-bound skill snapshot 的版本可见性与合同一致性，避免旧命令和旧顺序继续驱动当前 runtime。
- 统一 `per_task` 的条件语义：每个业务 task 完成后评估 truth value，仅在有 reusable truth 时派发 writer；lifecycle meta task 不参与该判断。

### P1：Plan mutation 与 completion refresh

- 研究原子的 plan-refine-and-activate 能力，或等价地减少默认 meta task 和首个业务动作前的 lifecycle mutation。
- 支持 batch task-status 更新，并让 planning / activation meta task 不计入业务进度指标。
- 计划结构已经收敛为通常 `2-4` 个 outcome-oriented tasks，planning stages 作为 coverage checklist；final-only truth 路径也不再为马上完成的工作建议独立 `in_progress` write。
- final-only truth 路径已经移除逐 task 的机械 `update_plan` 要求；在自动桥接完成前，其他阶段仍只应在 host 可见进度确实需要更新时写入。
- 研究把 CLI lifecycle progress 自动桥接到 host state，减少 `.claw` plan、Codex `update_plan` 与 Goal Mode 之间的重复手动协调。
- completion refresh 增加 single-flight / coalescing 与 dirty hash；把 embedding 移出 SQLite 长 write transaction；对 plan-done 前后的 GitNexus analyze 做去重。

### P2：Search latency

- 在保持召回契约的前提下评估 adaptive FTS-first / lexical-first 快速路径，或使用常驻 embedding worker，重点降低 cold/warm query latency，而不是只优化单次模型推理。

### P3：复杂度门禁与无决策收口

- verification 和 closure 阶段由 main agent 根据具体任务决定，不应机械固定为必经阶段。
- 默认 truth dispatch 已从 `per_task` 收敛为 `final_only`；显式 `per_task` 继续支持，且当前项目的 opt-in `per_task` 配置事实不变。
- 当前 complexity 四维加总中，files、dependencies 与 workflow shape 可能对同一复杂性重复计权；长期应以风险触发器或真实 task outcome 校准替代纯提示词总分。
- ADR 在 completed plan 没有 `keyDecisions` 时应允许 no-op，避免为“无决策”生成形式化沉淀。
- 这些优化候选不应削弱 complexity gate、任务所需的 verification、作为唯一 next-step contract 的 `workflowGuidance`，或可审计的 ADR 语义。

## 衡量指标

- `time-to-first-work`
- `time-to-first-valid-work`
- total active wall time、blocking claw command time、closeout time
- CLI / tool-call 数、plan / status write 数、subagent dispatch 数
- 首个业务动作前的 plan mutation 数
- 每个业务 task 的 writer dispatch 数
- search cold/warm P50、P95
- completion refresh P50、P90、max
- SQLite busy/locked 次数
- verification pass rate、返工 / reopen 率、durable decision 遗漏率

这些指标应按 runtime 版本、skill snapshot、机器与 cold/warm 状态分组，否则无法区分合同漂移、模型冷启动与真实 workflow 设计成本。

研究验证应使用真实 low / medium / high-complexity task 的分层语料，对比 current 与 optimized workflow。候选目标是：substantive work 前管理动作不超过 `3` 次、formal-workflow P50 wall time 降低 `25%`、exact / strong-keyword fast path search P95 小于 `500ms`、semantic warm P95 小于 `1s`，同时 verification 与 traceability 不出现实质回退。这些是 benchmark proposal，不是已接受的产品承诺或 ADR。

## 关联代码与证据

主要锚点：

- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `shared/skills/planning/SKILL.md`
- `packages/core/src/templates/plans/default.ts`
- `packages/core/src/plan.ts`
- `packages/core/src/workflow-guidance.config.json`
- `packages/core/src/workflow-guidance.ts`
- `packages/core/src/types.ts`
- `packages/core/src/init.ts`
- `packages/core/src/context.ts`
- `packages/core/src/project-check.ts`
- `packages/core/src/memory.ts`
- `packages/cli/src/cli.ts`
- `packages/codex-adapter/references/workflow-guidance-consumption.md`
- `packages/codex-adapter/references/codex-subagent-dispatch.md`
- `packages/codex-adapter/references/TRUTH-AGENT-SPEC.md`
- `packages/codex-adapter/references/ADR-AGENT-SPEC.md`
- `packages/opencode-adapter/references/opencode-dispatch.md`

运行时证据：

- `.claw/project.json`
- `.claw/logs/completion-refresh/`
- 当前线程实际绑定的 plugin skill snapshot

## 关键检索词

`workflow cost`、`contract drift`、`skill snapshot`、`plan mutation`、`meta task`、`per_task`、`truth-writer`、`query embedding`、`completion refresh`、`single-flight`、`SQLite transaction`、`GitNexus analyze`、`complexity gate`
