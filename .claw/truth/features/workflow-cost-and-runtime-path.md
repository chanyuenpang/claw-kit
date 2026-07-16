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

### 0.1.67 正式流程性能复测（2026-07-16）

- 本轮运行时边界为全局 CLI `0.1.67`，当前线程绑定的 plugin skill snapshot 也为 `0.1.67`。版本判断必须同时记录 CLI 与线程 snapshot，避免把旧 snapshot 行为混入新版本样本。
- 无 `--task` 参数执行 `claw plan show`，约 `400ms` 后才返回 `Missing required flag --task`。这说明参数缺失的失败路径仍会支付可见的 CLI 固定成本，不能把失败前耗时误算为有效 plan 读取性能。
- 指定 `--task` 后，`claw plan show` 三次分别为 `161ms`、`145ms`、`148ms`，均值约 `151ms`。与 `0.1.63` 的 cold `265ms`、warm `143ms` / `143ms` 相比，`0.1.67` 的有效 show 路径基本持平，未出现量级变化。
- 首次中文 recall search 为 `4528ms`。同一英文 query 连续三次分别为 `4315ms`、`4635ms`、`4097ms`，每次均成功返回 `10` 条结果；三次均值约 `4349ms`。
- `0.1.63` 的同口径 search 三次基线为 `4075ms`、`4199ms`、`4316ms`，均值约 `4197ms`；另有追加样本 `3954ms`、`3963ms`。`0.1.67` 英文同 query 三次均值相对旧三次均值慢约 `3.6%`，在当前样本下只能判断为未改善，不能宣称 search 提速。
- 正式 lifecycle mutation 实测为：`claw plan create` `403ms`；planning patch `408ms`；planning append `217ms`；planning done `199ms`；activate `415ms`。即使单次 show 较快，正式流程仍包含多个独立 mutation，且 search 仍支付同步 query embedding 的约四秒固定成本。
- 性能比较必须至少固定 CLI 版本、线程 skill snapshot、机器、query、结果成功性与 cold/warm 条件；同时分别统计失败路径、只读 show、lifecycle mutation 与 search，不能用其中一项替代完整 workflow 成本。

### Search latency 第一阶段优化与验证（2026-07-16）

- `packages/core/src/memory.ts` 已加入保守 lexical fast path。只有同时满足以下条件时才跳过 query embedding：`strongTerms` 非空、没有 weak terms、没有短中文 substring fallback、唯一候选文档完整覆盖全部 strong terms，并且该文档还是文件名/路径的唯一命中或精确短语的唯一命中。任何条件不满足时，都完整回退到既有 hybrid search，不削弱语义召回路径。
- SQLite 新增 `query_embeddings` 表用于复用 query embedding。cache key 由版本 `v1`、embedding config 的 SHA-256 fingerprint 与最终传给 worker 的 query text 共同确定；不同原始 query 如果归一到同一最终 worker query text，可以共享同一缓存项。
- cache hit 只读、不回写；cache miss 才插入，并按 `created_at`、`rowid` 将表裁剪到最多 `128` 条。embedding config 变化触发 vector reset 时会同时清空 `query_embeddings`，避免跨配置复用不兼容向量。
- 第一阶段明确没有实现 persistent embedding worker；当时确认同步 search API 下必须额外解决 daemon 生命周期、并发、故障恢复与退出治理。后续实现已在下方单列，并通过 thin client 保持外层同步 API。
- core 为这两条优化路径新增的 `4` 个回归测试均通过：唯一文件名 lexical fast path 在 worker timeout 设为 `1ms` 且没有 mock 时仍成功；两个不同会话 query 映射到同一 `embeddingText` 时只产生 `1` 条 cache；写入第 `129` 条后保持 `128` 条并淘汰最旧记录；embedding config 变化后旧 cache 被清空，且新 fingerprint 与旧值不同。最终 core 测试总数为 `118/118`。
- 性能结论应区分快速路径命中率与 hybrid fallback 延迟：lexical fast path 能消除满足严格唯一性条件的 embedding 固定成本，query cache 能消除重复最终 worker query 的推理成本，但不代表所有 search 都会避开同步 embedding。

#### 源码 CLI benchmark

- 精确路径 query `workflow-cost-and-runtime-path.md` 连续三次为 `345ms`、`157ms`、`160ms`；每次 top result 都是 `.claw/truth/features/workflow-cost-and-runtime-path.md`，且均返回 `10` 条结果。后两次 warm 均值约 `159ms`，相对优化前约 `4.35s` 的 search 基线降低约 `96%`。
- 全新语义 query `semantic cache benchmark persistent worker fallback july optimization` 首次 cache miss 为 `5064ms`，第二次 cache hit 为 `188ms`；两次 top result 都是 `.claw/truth/adr/local-embedding-shared-model-cache.md`，且均返回 `10` 条结果。cache hit 相对旧约 `4.35s` 基线同样降低约 `96%`。
- 这组 benchmark 分别验证了两条优化路径：精确路径可走严格 lexical fast path；首次未缓存语义 query 仍支付完整 hybrid embedding 成本，而相同最终 worker query 的后续调用可命中 persistent SQLite query cache。
- 百分比只描述当前机器、当前源码 CLI 和这两类 query 的观测结果，不应外推为所有 search 的统一加速比；尤其首次全新语义 query 的 `5064ms` 仍说明 hybrid miss 路径没有消除 embedding 固定成本。
- 第一阶段最终验证为 core `118/118`、CLI `63/63`，并且 `npm test` 与 `npm run check` 均通过。

#### Persistent local embedding worker（2026-07-16）

- local embedding 新增 daemon + thin client。`packages/core/src/memory.ts` 的同步 search 调用仍通过 `spawnSync` 启动 `embedding-worker`，但 local worker 不再必然自行加载模型，而是连接绑定在 `127.0.0.1`、使用 token authentication 的 daemon；因此外层同步 API 无需 async 化，也能跨查询复用模型 session。
- daemon transport 或 startup 失败时，thin client 回退到既有 one-shot local embedding；daemon 已返回的模型/推理错误不再重复执行 one-shot，避免同一模型错误被双重支付或掩盖。`CLAW_EMBEDDING_PERSISTENT_WORKER=0` 是显式 kill switch，可强制恢复 one-shot 行为。
- runtime endpoint 按 user、install、Node runtime 与 protocol version 隔离，并有显式 runtime directory 的测试覆盖；这防止不同安装、Node 或协议实例误连同一 daemon。
- daemon 生命周期与并发边界包括 startup lock、state 原子写入、`120s` idle TTL，以及默认容量为 `1` 的 session LRU。session fingerprint 包含 `projectCwd`、Transformers module path、model、cache directory、dimension、device、dtype 与 tokenizer policy；任一会影响加载或输出的条件变化时，都不会误复用旧 session。
- remote embedding provider 继续走 one-shot worker，不进入 local daemon。`packages/core/src/embedding-local.ts` 新增可复用 session surface；原有 wrapper 仍保持 create-run-dispose，兼容需要一次性生命周期的调用方。
- 真实源码 CLI benchmark 使用两个不同且未缓存的语义 query：首次为 `3078ms`，第二次为 `452ms`；两次由同一 daemon PID 处理，daemon 内保持 `1` 个 session，并在 `120s` idle TTL 后正常退出。该样本证明收益来自模型 session 复用，而不是 query cache 命中。
- 当前验证为 core `121/121`、CLI `64/64`，且完整 `npm run check` 通过。

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

- 已实现严格唯一性门禁下的 lexical fast path、配置感知的 query embedding cache，以及保持外层同步 API 的 persistent local embedding daemon；remote provider 与禁用/故障回退路径继续使用 one-shot worker。
- 后续应以 fast-path 命中率、cache 命中率、daemon session reuse 命中率和 hybrid fallback P95 分别评估收益，并持续验证 endpoint 隔离、idle TTL 与 one-shot fallback 的可靠性。

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

`workflow cost`、`contract drift`、`skill snapshot`、`plan mutation`、`meta task`、`per_task`、`truth-writer`、`query embedding`、`query_embeddings`、`lexical fast path`、`strongTerms`、`persistent embedding worker`、`CLAW_EMBEDDING_PERSISTENT_WORKER`、`session LRU`、`idle TTL`、`completion refresh`、`single-flight`、`SQLite transaction`、`GitNexus analyze`、`complexity gate`

### 0.1.68 新版流程性能复测（2026-07-17）

- 本轮运行时边界为同一台机器上的全局 CLI `0.1.68`，当前线程绑定的 plugin skill snapshot 也为 `0.1.68`；对照组是同机 `0.1.67` canonical benchmark，版本判断继续同时记录 CLI 与线程 snapshot。
- lifecycle mutation 实测为：`claw plan create` `587ms`、planning patch `524ms`、planning append tasks `437ms`、planning task done `397ms`、activate `406ms`。对照 `0.1.67` 的 `403ms` / `408ms` / `217ms` / `199ms` / `415ms`，整体没有提速，planning mutation 中 create、patch、append 与 done 反而更慢；activate 基本持平。
- `claw plan show` 为 cold `392ms`，warm `154ms` / `152ms`。warm 均值 `153ms`，与 `0.1.67` 的 `161ms` / `145ms` / `148ms`（均值约 `151ms`）基本持平；不能据此宣称 plan lifecycle 提速。
- 精确路径 query `workflow-cost-and-runtime-path.md` 为 cold `295ms`，warm `172ms` / `175ms`；三次均 exit `0`、返回 `10` 条结果，top result 均为 `.claw/truth/features/workflow-cost-and-runtime-path.md`。相对 `0.1.67` 约 `4.35s` 的语义 search 均值，这条 strict lexical fast path 约改善 `96%`。
- 显式设置 `CLAW_EMBEDDING_PERSISTENT_WORKER=0` 后，全新语义 one-shot cache miss 为 `4161ms`；它仍接近 `0.1.67` 的约 `4349ms` 均值，说明禁用 daemon 后首次语义 miss 仍支付约四秒的模型初始化与推理成本。
- 使用隔离 runtime directory 的真正 daemon cold miss 为 `2958ms`，相对同轮 one-shot `4161ms` 快约 `29%`；已有 daemon 的另一条全新语义 cache miss 为 `536ms`，相对 `0.1.67` 语义 search 均值约改善 `87.1%`；同 query 的 query-cache hit 为 `401ms`。
- 上述三条语义 search 均 exit `0`、返回 `10` 条结果，top result 均为 `.claw/truth/features/workflow-cost-and-runtime-path.md`。因此本轮收益可以归因到 persistent daemon 的模型 session 复用与 query cache，而不是失败、空结果或 top-result 漂移。
- 0.1.68 的 durable 判断是：plan lifecycle 未提速，planning mutations 部分更慢；search 路径已有实质提升，但必须区分 exact lexical fast path、禁用 daemon 的 one-shot miss、daemon cold miss、已有 daemon 的 warm miss 与同-query cache hit，不能把任一单点结果外推为统一 search 延迟。
- 本轮 benchmark 证据归属于 `.claw/tasks/测试-claw-0.1.68-新版流程流畅度与性能/plan.json`；该路径是任务证据，不是运行时实现锚点。
