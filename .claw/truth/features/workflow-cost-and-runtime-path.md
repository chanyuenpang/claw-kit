# Claw workflow 成本与真实执行路径审计

<!-- state: current -->
## 结论

- 正式 claw workflow 的主要成本不只来自业务执行，还来自合同版本漂移、plan lifecycle mutation、hook-owned writer execution、query embedding、completion refresh 与 GitNexus 分析。
- lifecycle 元状态与业务进度必须分开理解：当前单一 planning bridge 用于完成讨论并切换执行状态，不计入 downstream 业务 task 数，也不应独立触发 truth deposition；旧版独立 `Enter process.active` 只属于版本化 benchmark 与历史 plan evidence。
- `truthDispatch = "final_only" | "per_task"` 与按 task 派发 writer 是 `0.1.65` 及更早性能样本的版本化输入，不是当前 project schema 或 lifecycle owner。
- 当前项目配置可使用 `knowledgeWriter.externalSkills` 的有序列表；列表缺失或为空时，正式 workflow 协调 `.claw` plan state、Codex Goal/progress actions，以及完成后的一次 built-in `knowledge-writer` job。retention 的字段语义由 `truth-and-adr-corpus-semantics.md` 唯一拥有。
- 优化时应先修复合同一致性与条件语义，再降低 plan mutation 和后台 refresh 成本；入口 admission 的当前所有权与规则见 `using-claw-kit-session-entry.md`。

## 已验证的执行事实

### 版本与合同漂移

- 2026-07-16 审计时，仓库 source、`.claw/project.json` 与全局 CLI 均为 `0.1.63`；但长线程可以继续绑定旧的 plugin skill snapshot，例如 `0.1.12+codex.*`。
- 旧 snapshot 的入口合同是 `plan write` 且在 planning 前执行 `claw search`；当前 source 合同按是否预期产生可复用项目知识选择 project plan 或 direct work，需要正式流程时执行 `plan create`，再在相应阶段按需 search。线程绑定旧 snapshot 时，可能继续推荐已移除或已变更的命令与入口规则。
- 主要合同锚点是 `packages/codex-adapter/skills/using-claw-kit/SKILL.md` 与 `shared/skills/planning/SKILL.md`；判断运行时行为时必须同时核对当前 CLI 版本和线程实际绑定的 skill snapshot，不能只看仓库 source。

### Plan lifecycle mutation 成本

- 默认 `claw plan create` 当前只种入一个 planning bridge；它在 substantive execution 前完成讨论、计划细化与 activation readiness，并由原子 `claw plan start` 完成后进入 `process.active`。当前 lifecycle 合同的详细 owner 是 `cli-guided-workflow.md`。
- 旧 planning + `Enter process.active` 双 meta-task skeleton 只作为历史 plan shape；current `plan start` 不再按标题、语言或 task 数识别它，不能继续把它描述为默认创建行为或隐式兼容路径。
- 当前 `claw plan edit` 不允许在一次 edit 中同时提交 `patch.tasks` 与 `taskId` / `taskStatus`；对应校验与序列化路径在 `packages/core/src/plan.ts`。
- 因此 formal flow 在首个业务动作前需要分别完成 plan hydration、planning task 状态更新和 activation；对于 `N` 个业务 task，执行期还至少需要 `N` 次 done 状态更新。首个业务动作前的 plan mutation 数和业务 task 数应分别统计。
- 2026-07-16 在当前仓库、当前机器上的 `claw plan show` 实测为 cold `265ms`，随后 warm `143ms` / `143ms`。这些数字用于区分 plan-state CLI 固定开销与 search/model 初始化开销，不是跨机器常量。

### Truth delegation 条件语义

- Historical `0.1.65` workflow delegate output used `dispatch` for separate writer semantics. Current finalization has no foreground writer delegate output; the Stop/session-idle job runs one combined `knowledge-writer` pass.
- `0.1.65` 的 main-agent truth value gate、required ADR dispatch 与 phase-specific references 仅保留为历史成本证据。当前 combined `knowledge-writer` 在 trusted evidence freshness check 后固定先评估 Truth、再评估 ADR；各阶段可以 evidence-backed no-edit，但没有 Truth/ADR/both/noop route task。
- 判断 live 行为时必须区分历史 benchmark 的 installed CLI/skill snapshot 与当前 `0.1.80` combined writer contract。

### Writer target routing 与性能

- Combined `knowledge-writer` 启动后完整读取 skill-local workflow references，并对候选 owner 做 focused 与 exhaustive search；这部分 stewardship 成本不能通过恢复两个窄 phase 来规避。
- canonical target routing 属于 writer 自身职责，不应要求 main agent 先理解 truth/ADR 文件布局或选择目标。writer 使用 `claw search` 召回候选 canonical 文档，再只读取相关候选；只有 search 不可用、候选冲突或 canonical routing 仍无法确定时，才回退到 full-corpus inspection。
- 历史 release closeout 实测中，宽泛 ADR 任务两次分别约 `40-90s` 与 `90s`，且都没有落盘；把输入收敛为唯一 `targetPath` 与两条追加事实后，约 `10s` 完成。该对比说明主要优化点是 target certainty，而不是删除 router/reference 合同。
- 本轮 fresh-agent 前向验证中，明确 `targetPath` 的 ADR 约 `70s` 落盘，truth 约 `85s` 落盘；两者均正确走定向写入且没有修改索引，但端到端时延没有稳定优于历史样本。当前改动能确认消除了不必要的 corpus 扫描，不能据此宣称 subagent 总耗时已经下降；剩余时延主要位于 writer 启动、模型处理和完整 deposition 合同执行。
- 当前 finalizer invocation 提供 source `plan.json`、相邻 trusted report 与 finalization id；这些是具体 runtime materials，不定义 combined writer 的语义输入 schema。writer 的通用材料解释与阶段合同由 `codex-knowledge-capture-boundary.md` 拥有，自动 lifecycle 与 job orchestration 由 `../adr/hook-owned-two-phase-knowledge-finalization.md` 拥有；本审计不再重复声明其 current evidence contract。
- writer-owned routing 不得删除完整 reference 阅读、事实核对、目标路径 containment、UTF-8 BOM / encoding 校验，以及新建或路由不确定时必要的去重。

### 第一阶段优化的已实现行为

- `packages/core/src/init.ts`、`packages/core/src/context.ts` 与 `packages/core/src/project-check.ts` 已将新建、初始化和省略的 `truthDispatch` 统一规范化为 `final_only`；显式 `per_task` 保持兼容，CLI 的 per-task contract 测试也必须显式 opt-in。
- `process.hasCompletedTasks.finalOnlyTruth` 不再强制 Codex `update_plan`，也不再建议为马上完成的工作写一次独立 `in_progress`；进入 `process.active` 与 `process.allTasksDone` 的 host synchronization 合同保持不变。
- 该阶段的 shared / Codex / OpenCode planning skills 曾把 downstream plan 约束为通常 `1-3` 个 outcome-oriented tasks，并要求 coherent deliverable 的支持性工作尽量留在同一 task；这是当时减少管理膨胀的版本化证据，不再描述当前 task shape。当前 planning 拆分规则由 `.claw/truth/features/shared-planning-skill-source.md` 唯一拥有。
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

### 0.1.68 名义版本与运行时能力错配（2026-07-17）

- 本轮线程绑定的 plugin skill snapshot 是 `C:\Users\chany\.codex\plugins\cache\claw-kit\claw-kit\0.1.67+codex.20260716054831`；该目录的 `.codex-plugin/plugin.json` 也声明 `version = 0.1.67+codex.20260716054831`。线程实际执行的 skill contract 因而仍属于这个 snapshot，不能用仓库当前 source 或全局包版本替代。
- 同一时点，`claw --version` 与全局 `@veewo/claw` package 都报告 `0.1.68`，但 `claw help plan start` 返回 `Unknown plan subcommand: start`。对全局安装包检索 `plan.start` / `plan start requires` 等实现锚点也没有发现 `plan.start` command implementation，说明该已安装 runtime 的命令能力与名义版本不能仅凭版本号判定。
- 当前仓库 source 已在 `packages/cli/src/cli.ts` 与 `packages/core/src/plan.ts` 实现 atomic `plan.start`，对应回归覆盖位于 `packages/cli/test/cli.test.ts` 与 `packages/core/test/core.test.ts`。检查时工作树存在用户持有的未提交变更，因此这些 source 能力不能被直接等同为全局已安装 package 的内容。
- 这次错配使正式 workflow 性能测试实际走了 legacy `create` / `patch` / `planning-done` / `activate` mutations，而没有走 atomic `plan.start`。该样本只能代表当时真实加载的 CLI package content、capability 与线程 plugin snapshot，不能代表仓库 source 中的 atomic path。
- 因此，名义版本相等不构成 runtime/source 内容一致性的证据。后续 workflow 性能测试除记录版本字符串外，必须同时记录 CLI package 的实际安装来源与关键 command capability，并记录当前线程绑定的 plugin skill snapshot；涉及新 command 时至少执行一次真实 help 或 smoke probe，确认运行时确实暴露该能力。

### Search latency 第一阶段优化与验证（2026-07-16）

- `packages/core/src/memory.ts` 已加入保守 lexical fast path。只有同时满足以下条件时才跳过 query embedding：`strongTerms` 非空、没有 weak terms、没有短中文 substring fallback、唯一候选文档完整覆盖全部 strong terms，并且该文档还是文件名/路径的唯一命中或精确短语的唯一命中。任何条件不满足时，都完整回退到既有 hybrid search，不削弱语义召回路径。
- SQLite 新增 `query_embeddings` 表用于复用 query embedding。cache key 由版本 `v1`、embedding config 的 SHA-256 fingerprint 与最终传给 worker 的 query text 共同确定。`0.1.86` 排序决策把该 worker text 改为原始语义查询，因此只有相同原始 query 才共享缓存；该语义决策由 `project-search-candidate-recall.md` 与其 ADR owner 维护。
- cache hit 只读、不回写；cache miss 才插入，并按 `created_at`、`rowid` 将表裁剪到最多 `128` 条。embedding config 变化触发 vector reset 时会同时清空 `query_embeddings`，避免跨配置复用不兼容向量。
- 第一阶段明确没有实现 persistent embedding worker；当时确认同步 search API 下必须额外解决 daemon 生命周期、并发、故障恢复与退出治理。后续实现已在下方单列，并通过 thin client 保持外层同步 API。
- 在 `2026-07-16` 的旧 worker-text 语义下，core 为这两条优化路径新增的 `4` 个回归测试均通过，其中两个不同会话 query 当时会归一到同一 `embeddingText` 并只产生 `1` 条 cache；这是被 `0.1.86` 原始语义查询决策取代的版本化证据。`128` 条上限、淘汰和 embedding config reset 清理仍是当前 cache 合同。
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
- persistent daemon request timeout 也属于 terminal `PersistentEmbeddingModelError`，因为 daemon 超时后模型下载或推理可能仍在继续；客户端不得并发回退 one-shot 去争用同一份未完成缓存。默认 daemon request timeout 与外层 embedding worker timeout 现均为两小时，仍可分别通过 `CLAW_EMBEDDING_DAEMON_REQUEST_TIMEOUT_MS` 与 `CLAW_EMBEDDING_WORKER_TIMEOUT_MS` 显式覆盖。
- runtime endpoint 按 user、install、Node runtime 与 protocol version 隔离，并有显式 runtime directory 的测试覆盖；这防止不同安装、Node 或协议实例误连同一 daemon。
- daemon 生命周期与并发边界包括 startup lock、state 原子写入、`120s` idle TTL，以及默认容量为 `1` 的 session LRU。session fingerprint 包含 `projectCwd`、Transformers module path、model、cache directory、dimension、device、dtype 与 tokenizer policy；任一会影响加载或输出的条件变化时，都不会误复用旧 session。
- remote embedding provider 继续走 one-shot worker，不进入 local daemon。`packages/core/src/embedding-local.ts` 新增可复用 session surface；原有 wrapper 仍保持 create-run-dispose，兼容需要一次性生命周期的调用方。
- 真实源码 CLI benchmark 使用两个不同且未缓存的语义 query：首次为 `3078ms`，第二次为 `452ms`；两次由同一 daemon PID 处理，daemon 内保持 `1` 个 session，并在 `120s` idle TTL 后正常退出。该样本证明收益来自模型 session 复用，而不是 query cache 命中。
- 当前验证为 core `121/121`、CLI `64/64`，且完整 `npm run check` 通过。

### Completion refresh 历史路径与基线（`2b397ca` 之前）

- `claw plan done` 会启动后台 completion refresh，并串行刷新 project memory、task memory 与 GitNexus；状态证据位于 `.claw/logs/completion-refresh/`。
- 对历史 `61` 个成功日志的统计是 median `6.62s`、P90 `54.8s`、max `354.86s`。该分布适合作为回归基线，不能替代新版本/新机器复测。
- 在 `2b397ca` 之前，`packages/core/src/memory.ts` 曾在 SQLite write transaction 内执行 memory embedding，慢 embedding 会长时间持有写锁；当时 refresh 也尚无 single-flight / coalescing，重叠请求可能重复工作并提高 busy/locked 风险。
- 同一历史基线下，GitNexus-enabled 的首次或漂移环境会在 `plan done` 前同步执行 install/setup/enable embeddings，后台 refresh 随后再次 analyze；当时缺少 dirty-state 与分析结果去重，因此存在双重分析风险。CLI 路由锚点是 `packages/cli/src/cli.ts`。

## 审计判断与优化顺序

### P0：合同一致性

- 先解决 source / CLI / thread-bound skill snapshot 的版本可见性与合同一致性，避免旧命令和旧顺序继续驱动当前 runtime。
- 统一 `per_task` 的条件语义：每个业务 task 完成后评估 truth value，仅在有 reusable truth 时派发 writer；lifecycle meta task 不参与该判断。

### P1：Plan mutation 与 completion refresh

- 研究原子的 plan-refine-and-activate 能力，或等价地减少默认 meta task 和首个业务动作前的 lifecycle mutation。
- 支持 batch task-status 更新，并让当前 planning bridge（以及 legacy plan 中的独立 activation task）不计入业务进度指标。
- 当时的计划结构曾收敛为通常 `1-3` 个 outcome-oriented tasks，并优先用一个 task 包含 coherent deliverable 的比例化实现、文档、验证与 review；该数字预算已被后续 checkpoint-based 规则取代。当前 task shape 见 `.claw/truth/features/shared-planning-skill-source.md`；本节只保留历史性能路线证据。
- final-only truth 路径已经移除逐 task 的机械 `update_plan` 要求；在自动桥接完成前，其他阶段仍只应在 host 可见进度确实需要更新时写入。
- 研究把 CLI lifecycle progress 自动桥接到 host state，减少 `.claw` plan、Codex `update_plan` 与 Goal Mode 之间的重复手动协调。
- 该候选已由 `2b397ca` 实现：completion refresh 增加 single-flight / coalescing 与 dirty hash，embedding 移出 SQLite 长 write transaction，plan-done 前后的 GitNexus analyze 也完成去重；当前合同由下方“Completion refresh single-flight 与短事务已实现合同”小节拥有。

### P2：Search latency

- 已实现严格唯一性门禁下的 lexical fast path、配置感知的 query embedding cache，以及保持外层同步 API 的 persistent local embedding daemon；remote provider 与禁用/故障回退路径继续使用 one-shot worker。
- 后续应以 fast-path 命中率、cache 命中率、daemon session reuse 命中率和 hybrid fallback P95 分别评估收益，并持续验证 endpoint 隔离、idle TTL 与 one-shot fallback 的可靠性。

### Historical P3：复杂度门禁与无决策收口

以下内容是旧 complexity-score 路径的优化候选与版本化性能背景，不再定义当前入口 admission；当前规则由 `using-claw-kit-session-entry.md` 拥有。

- verification 和 closure 阶段由 main agent 根据具体任务决定，不应机械固定为必经阶段。
- 默认 truth dispatch 已从 `per_task` 收敛为 `final_only`；显式 `per_task` 继续支持，且当前项目的 opt-in `per_task` 配置事实不变。
- 当前 complexity 四维加总中，files、dependencies 与 workflow shape 可能对同一复杂性重复计权；长期应以风险触发器或真实 task outcome 校准替代纯提示词总分。
- ADR 在 report 与 plan 明确结论都没有 durable decision 时应允许 no-edit，避免为“无决策”生成形式化沉淀。
- 这些历史优化候选不应被提升为当前入口规则；当前 project-plan 流程仍须保留任务所需的 verification、作为唯一 next-step contract 的 `workflowGuidance`，以及可审计的 ADR 语义。

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

### 固定 Windows benchmark corpus 与原子 refine-and-activate 合同

- `0.1.68 + search guidance` predecessor 的 Windows workflow benchmark 使用固定 low / medium / high corpus，分别包含 `1` / `3` / `5` 个 business tasks；planning 与 activation 等 lifecycle meta work 不计入 business task 数。
- legacy formal planning path 在首个业务动作前固定执行 `create`、`patch`、`append`、`planning-done`、`activate` 共 `5` 次管理命令。该固定 corpus 在本机 Windows baseline 的首个业务动作前管理耗时为 P50 `935.04ms`、P95 `961.71ms`；这些数值是指定 predecessor、机器与 corpus 的回归基线，不是跨环境常量。
- 原子 `refine-and-activate` 的验收合同要求：一次序列化写入完成 refine 与 activate；任何验证失败都必须零写入；CLI plan state 始终是 canonical source of truth；host adapter 只单向、幂等地消费 versioned events，不反向拥有或重写 canonical plan state。
- 主要证据是 `benchmarks/workflow/0.1.68-windows-baseline.json` 与 `docs/workflow-performance-contract.md`，对应提交为 `b1374f8`。
- 以上只固定 predecessor benchmark 与未来实现必须满足的原子合同；不表示 `refine-and-activate` 已实现，也不据此宣称后续 workflow 已获得性能提升。

### 原子 `claw plan start` 已实现合同与 Windows A/B

- `claw plan start --requirements <text> --acceptance <criterion> --add-task <title> --detail <text>` 已成为正式原子入口：它默认读取 session binding，在一次序列化 mutation 内提交 plan refine 结果、追加业务 tasks，并应用 current template task 的 `guidance.onPlanStart`；default template 的声明会完成当前单一 planning bridge 并切换到 `process.active`，旧双 lifecycle-task plan 不再走 shape heuristic。
- 原子结果事件使用 `schemaVersion = 1`；一次 mutation 共享单一 `mutationId`，每个事件拥有唯一 `eventId`，并记录 `commandSource`。CLI 同时输出幂等 `hostActions`，供 host adapter 单向同步 `update_plan` 与 Goal Mode；adapter 消费事件，不反向拥有 canonical CLI plan state。
- 原有 `claw plan create`、`claw plan edit` 与 `claw plan done` 保持兼容；`plan start` 是减少 refine/activate 固定管理往返的新增入口，不是破坏旧 lifecycle surface 的替换。
- 固定 Windows low / medium / high A/B 中，legacy path P50 为 `902.79ms`，atomic path P50 为 `385.06ms`，改善 `57.35%`；把 create-time recall 计入管理动作后，首个业务动作前的管理命令数从 `6` 降到 `3`。这是同一固定 A/B corpus 的配对结果，不覆盖上一节独立 predecessor baseline 的 `935.04ms` 观测值。
- 本阶段证据是 `benchmarks/workflow/0.1.68-atomic-windows.json`、`docs/workflow-performance-contract.md` 与提交 `3dca2c8`。

### Completion refresh single-flight 与短事务已实现合同

- 提交 `2b397ca` 之后，`.claw/logs/completion-refresh/inflight.lock` 是项目级 completion refresh leader / single-flight 锁。重叠请求不再各自重复刷新，而是合并关联的 status files、operations 与 dirty hash 到当前 leader。
- 这个 single-flight 不只是性能优化，也是 GitNexus 索引完整性边界：2026-07-06 的历史日志把至少 `14` 次重叠 completion refresh 与同一 `.gitnexus/lbug` 上的 shadow/WAL identity mismatch、锁失败、allocation failure 和最终 `0xC0000005` 串成一条高置信度破坏链；guard 在 2026-07-17 才加入，所以不能把事故发生时的旧路径误写成已经受保护。
- leader 在执行期间若观察到 dirty hash 变化，会补跑 refresh cycle，但最多执行 `3` 个 cycles，避免持续变更导致后台任务无限延长。每个状态记录持久化 `dirtyHash`、`refreshCycles` 与 `coalescedCount`，用于区分输入版本、实际循环次数和被合并请求数。
- project embedding generation 已移出 SQLite `BEGIN` / `COMMIT` 长写事务；耗时的 embedding 先在事务外生成，只有最终 vector insert 使用短事务，从而缩短写锁持有时间。
- `claw plan done` 的 GitNexus embeddings 预检如果已经执行 analyze，后台 completion refresh 会复用该结果并跳过重复 analyze。GitNexus 返回 busy / locked 时，执行路径按 `100ms`、`250ms` 退避重试，处理瞬时锁竞争。
- Windows `.cmd` 调用显式使用 `cmd.exe`，不再依赖 `shell: true`；对应回归验证不再产生 Node `DEP0190`。
- CLI 回归为 `72/72` 通过，其中覆盖 overlapping direct closeout 只执行一次 GitNexus analyze、transient lock retry，以及 preflight analyze dedupe。
- 本节取代上方旧 baseline 中“当前仍无 single-flight / embedding 位于长写事务 / preflight 与后台可能重复 analyze”的现状描述；那些条目只表示 `2b397ca` 之前的风险基线。P1 中对应候选至此已实现，不应继续当作未完成建议。
### Search telemetry、P95 与复杂度门控校准

- search 结果现在稳定暴露 `route`、`queryEmbedding`、`embeddingRuntime` 与 `durationMs` telemetry，使 lexical fast path、persistent daemon、cache 与 one-shot fallback 可按真实 route 分组测量，不能再只用总 wall time 猜测执行路径。
- 当前固定测量中，精确词法查询 P95 为 `315.35ms`，persistent daemon 语义查询 P95 为 `602.93ms`；one-shot fallback 为 `4392.01ms` 且成功返回。基于这组成功性和分路延迟，本阶段没有启用 plan-create embedding 预热，避免为每次 formal planning 无条件增加后台或前台初始化成本。
- complexity gate 已用 `12` 个 low / medium / high 语料校准：legacy low false-positive rate 从 `0.5` 降为 `0`，formal recall 为 `1`，accuracy 为 `1`。dependency 维度只计算独立风险，不再与 files 或 workflow shape 对同一复杂性重复计权。
- 本阶段证据提交为 `14cdbdb`；后续性能判断应继续按新增 telemetry route 和 runtime 分类，而不是把 lexical、daemon 与 one-shot 样本混成单一 search 均值。

### 0.1.69 运行时边界与原子命令实证（2026-07-17）

- npm registry 的 `version` / `latest`、全局安装的 `@veewo/claw`、`claw --version`、仓库 `packages/cli/package.json` 与 `packages/core/package.json`、`.claw/project.json` 均为 `0.1.69`；全局命令实际解析到 `C:\Users\chany\AppData\Roaming\npm\claw.ps1`。
- `packages/codex-adapter/.codex-plugin/plugin.json` 与本轮线程实际绑定的 plugin cache snapshot 均为 `0.1.69+codex.20260717011110`；核验时仓库 HEAD 为 `6c37ea4ede15b3ebf7e3565097574a2ffa2b2e6d`。
- 真实 `claw plan start --help` 已暴露原子命令，本轮 smoke 也实际成功执行。结合 registry、全局 CLI、仓库 source、project protocol 与线程 snapshot 的一致性，本轮性能样本可以归入同一条 `0.1.69` 版本线；该归类来自多层内容与关键 capability 的实证，不是仅凭版本字符串推断。
- `claw check` 返回 `ok`、`changed = false`、`issueCountBefore = 0`；`claw context` 返回 `protocolCheck = ok`、`updateAvailable = false`。这两项共同证明项目协议健康且当时没有待升级版本，但不能替代关键命令的 help / smoke probe。
- 后续 benchmark 的版本边界仍应同时记录 registry / installed CLI、命令 shim、仓库 source 与 HEAD、`.claw/project.json`、线程绑定 plugin snapshot，并对被测新增命令执行真实 help 或 smoke。只有这些层和 capability 一致，才能把样本归属于同一发布路径。

#### 0.1.69 同机 workflow 与 search benchmark

- `claw plan create` 墙钟为 `407ms`；原子 `claw plan start` 为 `473ms`，且在这一次 mutation 内完成 plan patch、追加 `4` 个业务任务、完成两个 lifecycle bridge tasks，并进入 `process.active`。两者承担的工作范围不同，不能仅用 `407ms` 与 `473ms` 的单点差值判断原子路径是否退化。
- `claw plan show` 五次墙钟为 `366ms`、`143ms`、`146ms`、`149ms`、`147ms`，表现为首冷后热；四次热态均值约 `146ms`。这与 `0.1.67` 的热态均值约 `151ms` 基本持平，不能宣称 show 路径有量级提升。
- 精确文件名 query `workflow-cost-and-runtime-path.md` 三次墙钟为 `173ms`、`175ms`、`186ms`，telemetry `durationMs` 分别为 `30.47ms`、`30.18ms`、`30.27ms`；三次均为 `route = lexical_fast_path`、`queryEmbedding = skipped`，且 top result 正确。
- 两条全新语义 query 墙钟为 `405ms`、`402ms`，telemetry `durationMs` 为 `253.29ms`、`244.61ms`；两次均为 `route = hybrid`、`queryEmbedding = generated`、`embeddingRuntime = persistent_daemon`，且 top result 正确。相较本文记录的 `0.1.67` 语义 search 约 `4.35s` 同机基线，`0.1.69` daemon 语义墙钟约 `0.40s`，属于数量级改善。
- 重复第二条语义 query 的墙钟为 `205ms`，telemetry `durationMs = 46.92ms`、`queryEmbedding = cache_hit`，top result 仍正确。该样本应与 persistent-daemon 全新 query 分开统计，不能把 cache hit 当作 daemon miss 延迟。
- 同一运行时边界下，`npm test` 约 `62747ms`，core `126/126` 与 CLI `72/72` 全部通过；`npm run check` 约 `7904ms` 并完整通过。以上成功性证据与正确 top result 共同约束性能结论，避免把失败或召回漂移误记为提速。

- 综合本轮复杂任务样本，`0.1.69` 的正式流程性能已足够高且主观流畅度明显改善，但仍非无摩擦。剩余主要成本是每个业务 task 的 CLI plan 状态写入（本轮约 `448ms`、`453ms`、`453ms`、`592ms`）与 host `update_plan` 双写、逐任务 truth 价值判断，以及异步 writer / completion-refresh 的可观察性。该版本的 complexity-gate 结论只保留为历史性能证据；当前是否进入 formal flow 由 `using-claw-kit-session-entry.md` 的 reusable-project-knowledge 判断拥有。后续优化应针对这些固定协调成本，不能以削弱计划、验证或质量门禁换取速度。

### 0.1.70 workflow、search 分路复测与 context 诊断陷阱（2026-07-17）

- 在同一 `0.1.70` 运行时边界下，`claw plan start` wall time 为 `480.5ms`；`claw plan show` 为 cold `357.8ms`，随后 warm `152.4ms` / `156.1ms` / `152.2ms` / `152.2ms`。plan 读写性能必须继续区分 cold / warm，不能把首轮初始化成本混入 warm 均值。
- 精确文件名 lexical search 三次 wall time 为 `186.2ms` / `320.9ms` / `176.2ms`，engine `durationMs` 为 `33.93ms` / `33.43ms` / `32.64ms`；三次均为 `route = lexical_fast_path`、`queryEmbedding = skipped`，top result 正确。
- 一条全新语义 search 为 wall `405.7ms`、engine `255.55ms`，telemetry 为 `route = hybrid`、`queryEmbedding = generated`、`embeddingRuntime = persistent_daemon`，top result 正确。同一语义 query 重复执行为 wall `196.6ms`、engine `39.05ms`、`queryEmbedding = cache_hit`，top result 仍正确。
- 初始宽泛中文语义 query 为 wall `3.205s`、engine `2.829s`，telemetry 仍为 `persistent_daemon`；结合随后 fresh semantic warm query 降到 wall `405.7ms`，该首轮样本很可能包含 daemon cold-start 成本。这是基于相邻 telemetry 的推断，不应升级为没有进程级证据的确定结论。
- 性能报告必须按 `lexical_fast_path`、semantic daemon cold / warm miss、query cache hit 分组，并分别报告 wall 与 engine `durationMs`；不得把不同 route、cold / warm 或 cache 状态混成单一 search 均值。

#### `projectVersionAligned` 诊断语义 bug

- `claw context` 在 project version 与 CLI version 都为 `0.1.70` 时仍返回 `projectVersionAligned: false`。这不是实际 runtime drift，而是 diagnostic / contract semantic bug。
- primary code anchor 是 `packages/cli/src/cli.ts` 的 `syncProjectVersionWithCli`：version comparison `=== 0` 的相等分支硬编码返回 `projectVersionAligned: false`。调查时应先核对双侧真实版本，再解释该字段，不能把这个 false 单独当成漂移证据。
- 本轮只沉淀诊断事实，没有获得 source fix 授权；因此该 bug 仍是已知陷阱，不应写成已修复行为。

#### 验证锚点与检索词

- `packages/cli/src/cli.ts`
- `syncProjectVersionWithCli comparison === 0 projectVersionAligned false`
- `0.1.70 lexical_fast_path 33.93ms`
- `persistent_daemon 255.55ms cache_hit 39.05ms`
- `cold warm cache route separated`

### 0.1.75 真实 host-action、性能分路与 CLI 退出码陷阱（2026-07-17）

- 真实版本线已核对：全局 `claw` CLI 为 `0.1.75`，`packages/cli/package.json` 与 `packages/core/package.json` 均为 `0.1.75`；本线程绑定的 plugin snapshot `plugin.json` 为 `0.1.75+codex.20260717034602`。性能样本因此属于该已核验的 CLI/source/thread-snapshot 组合，而非仅按仓库版本字符串归类。
- 在真实 Codex host-action consumer 中，原子 `claw plan start` 墙钟约 `776ms`。单次调用完成 plan patch、追加 `3` 个 business tasks、完成 `2` 个 lifecycle bridge tasks、进入 `process.active`，并消费 `update_plan` 与 `create_goal`；首个 business action 前仍保持 `create`、`search`、`start` 三命令路径。该样本是完整 host-action 消费路径，不能与仅 CLI mutation 的较低耗时样本混作同一指标。
- `claw plan show` 五次墙钟为 `340ms`、`126ms`、`126ms`、`127ms`、`138ms`；热态范围为 `126–138ms`。报告 plan read 时必须分离首轮与热态，不应将 `340ms` 纳入热态结论。
- exact filename lexical search 墙钟 `174ms`，telemetry 为 `route = lexical_fast_path`、`queryEmbedding = skipped`、`durationMs = 29.15ms`。一条新的 semantic query 墙钟 `388ms`，为 `route = hybrid`、`queryEmbedding = generated`、`embeddingRuntime = persistent_daemon`、`durationMs = 246.3ms`；重复同一 query 的 cache hit 墙钟 `180ms`，`queryEmbedding = cache_hit`、`durationMs = 37.75ms`。三种样本必须分别统计，cache hit 不能充当 semantic miss 延迟。
- 本线程首个自然语言召回墙钟 `3187ms`，telemetry `durationMs = 2838.29ms` 且使用 `persistent_daemon`。它属于该线程的 cold layer，不能与后续 persistent-daemon warm semantic 样本合并为统一 search 均值。
- `claw plan list` 不是有效子命令，但会输出结构化 `PROJECT_CONFIG_INVALID`，同时进程 exit code 仍为 `0`。脚本化调用不能只依赖 exit code 判断 `plan` 子命令是否成功；必须同时检查命令合法性和结构化错误 payload。

#### 本轮验证锚点与检索词

- `.claw/truth/adr/workflow-cost-optimization-route.md`
- `0.1.75 host-action consumer plan start 776ms`
- `plan show warm 126ms 138ms`
- `lexical_fast_path skipped 29.15ms`
- `persistent_daemon generated 246.3ms cache_hit 37.75ms`
- `persistent daemon cold natural language 2838.29ms`
- `claw plan list PROJECT_CONFIG_INVALID exit 0`
### 0.1.75 质量门禁与 writer 模型合同校正（2026-07-17）

- 完整 `npm test` 成功，墙钟 `60175ms`：core `126/126`、CLI `72/72`，合计 `198/198`。`npm run check` 成功，墙钟 `7270ms`，覆盖全部 adapter TypeScript / manifest 检查与 truth encoding audit。
- 该组质量门禁未发现 atomic `claw plan start`、idempotent `hostActions`、persistent daemon、query cache、Goal Mode 或 writer contract 回归。性能结论只能与这组通过的质量门禁一起解释，不能将低延迟样本与未验证功能路径混同。
- `truth-writer` / `adr-writer` 的 Luna dispatch 只属于历史性能样本，不是当前 routing 建议。当前 `knowledgeWriter.model = null` 使用 host default；显式 model 与 reasoning effort 在 job 创建时快照。
- 历史父线程接受 writer dispatch 只能证明当时的 model override surface。当前完成证据必须来自 host-aware combined runner 与 job state，不能用旧 dispatch acceptance 代替 writer completion。
- 当前验证应保留原始 host 能力错误，不自行将 Luna 替换为其他模型；若另一个父线程不接受该 model，应记录合同与宿主 surface 漂移，不能把 fallback 叙述回写成当前 workflow contract。

#### 本轮验证锚点与检索词

- `npm test core 126/126 CLI 72/72 198/198 60175ms`
- `npm run check 7270ms adapter TypeScript manifest truth encoding audit`
- `truth-writer model=gpt-5.6-luna`
- `adr-writer model=gpt-5.6-luna`
- `clean Luna parent thread writer dispatch accepted`
- `parent thread model override surface`

### 2026-07-19 当前 checkout 使用摩擦审计

- 当前 Codex driver 在 CLI mutation 已持久化、后续 native host action 失败时仍可能只向调用方抛出泛化错误。`packages/cli/src/codex-driver.ts` 会在 mutation 结果成功后逐个消费 `hostActions`，但公开失败面没有同时返回 mutation identity、canonical 持久化状态与已完成/未完成 action；因此恢复前必须先检查 plan / Goal 状态，不得盲目重放 mutation。
- Knowledge writer 以 report 结论和 plan 的 retrospective、`keyDecisions` 等明确结论为证据，task status 只解释 completed、pending 与 blocked scope；task 标题和描述不是执行证明。`packages/core/src/plan.ts` 已在从非终态进入任一 `end.*` 时登记一次 finalization，所有 `process.*` 只累计 report；`end.completed` 专属 completion hooks 继续独立拥有完成事件与 subplan resume。
- 本轮检查到 `34` 个 knowledge jobs，其中 `1` 个失败并达到 `3` 次重试；顶层 CLI 尚无 `claw knowledge status`、`retry` 或 `explain` 入口。这个计数是 2026-07-19 审计快照，不是长期常量；稳定的当前约束是失败 job 的 foreground 可观察性和恢复入口不足。
- 首次自然语言 `claw search` 约 `15–16s`、daemon 热身后同类查询约 `1s` 的同机样本只支持 cold/warm 分层，不构成跨机器 SLA。`claw context` 是 startup、resume、clear、compact 等 SessionStart hook 路径调用的计划恢复入口；执行期手动调用得到的长度和耗时样本不构成 compact-context 产品问题，也不应进入 agent 常规 guidance。
- 当前 context 恢复链路在项目解析后，对已启用且 vector index 可用的 local persistent provider 启动 detached、fail-open、非缓存内部文本预热；context 不等待子进程，失败不影响恢复。预热使用 persistent daemon，不回退到加载后立即丢弃的 one-shot session，也不写 query cache；daemon 的 startup lock、session fingerprint 复用与 `120s` idle TTL 继续约束并发和资源占用。
- 精确 `--template-file` 已提供 template identity，不再把同名缓存模板冲突列为当前优化项。Codex compact projection 过滤顶层长字段仍是独立现状；可执行信息继续进入结构化 `nextTask`、`completionChoices` 和唯一 command template。

#### 审计锚点与检索词

- `packages/cli/src/codex-driver.ts`
- `packages/cli/src/cli.ts`
- `packages/core/src/plan.ts`
- `packages/core/src/plan-templates.ts`
- `mutation persisted host action failed recover`
- `all end states conclusion evidence finalization trigger`
- `knowledge status retry explain`
- `search cold 15 16 seconds warm 1 second`
- `SessionStart runContextCommand detached local embedding warmup`

### 0.1.84 CLI 与 0.1.83 plugin snapshot 混合态流程评估（2026-07-19）

- 本轮真实运行边界是全局 CLI 与仓库 source 均为 `0.1.84`，但当前 Codex 线程加载的 plugin snapshot 仍是 `0.1.83+codex.20260719013549`。因此结果只证明这组混合合同下的真实路径，不能表述为纯 `0.1.84` plugin 端到端验收；版本复测必须同时报告全局 CLI、仓库 source / project protocol 与线程实际加载的 plugin snapshot。该决策的 canonical owner 仍是 `.claw/truth/adr/workflow-cost-optimization-route.md`。
- 该混合态完整跑通 `process.discussing -> process.active -> end.completed`，`3/3` tasks 完成且 Goal 已清空。每次 `workflowGuidance` 都给出单一明确的下一任务和允许命令，计划计数、状态切换与 closeout 没有悬空；本轮体验快照评分为整体顺滑度 `8/10`、用户心智成本 `3/10`、主代理 / 维护者心智成本 `6/10`，这些评分是该版本组合与当次任务的历史观测，不是跨版本 SLA。
- root plan 完成后会按 `task-layout-and-session-bindings.md` 解除当前 session binding。本轮随后裸跑 `claw plan show` 观测到结构化 `PROJECT_CONFIG_INVALID`；这不表示 completed plan 丢失，delayed archive window 内仍可用显式 `--task-name` 读取原路径。诊断时应区分“完成态计划仍存在”与“当前 session 已无绑定”，避免把无 binding 的裸命令错误误判为 lifecycle completion 失败。
- 固定 code-mode driver 让 canonical mutation 与 host action 顺序保持程序化，但调用方仍需复制并遵守严格 bridge 样板；本轮将这部分评为主要维护侧心智成本。该样板的当前程序合同与单一 owner 是 `.claw/truth/adr/codex-plan-mutations-use-fixed-code-mode-consumer.md`，本节只保留混合版本运行体验，不另立并行决策。
- 本轮没有修改产品代码；评估开始前已有的 `6` 个未提交文件保持原有归属，不能作为本次流程验证产物。

#### 本轮证据与检索词

- `.claw/tasks/评估最新版-claw-kit-任务流程与心智成本/plan.json`
- `.claw/tasks/评估最新版-claw-kit-任务流程与心智成本/plan.report`
- `0.1.84 CLI 0.1.83 plugin snapshot mixed contract`
- `process.discussing process.active end.completed 3/3`
- `root completion unbind plan show PROJECT_CONFIG_INVALID explicit task-name`
- `workflowGuidance clear next task driver bridge mental cost`

### 0.1.85 同版本线日常使用体验评估（2026-07-19）

- 本轮真实运行边界为全局 CLI、仓库 CLI/core 与当前线程 installed plugin snapshot 同属 `0.1.85`；报告还确认 installed `using-claw-kit` 与仓库源规范化后内容一致，原始 hash 差异仅来自换行符。该边界避免了上一轮 `0.1.84 CLI + 0.1.83 plugin snapshot` 混合合同，结论可以归属于 `0.1.85` 同版本线，但评分和耗时仍只是同机、当次只读任务的历史观测，不是跨环境 SLA。
- `plan create -> planning -> process.active -> Goal -> task done -> retrospective -> end.completed` 完整链路顺利跑通，最终 Goal 自动关闭。报告据此把 `0.1.85` 评为“可以日常使用”：可用性 `9/10`、流畅性 `8/10`、实用性 `8.5/10`、心智压力 `4/10`（越低越好）。日常操作主要关注 driver 返回的 `stage`、`nextTask` 与 `recommendedCommands`，计划、任务、Goal 和回顾在该样本中保持同步。
- 普通状态转换约 `1-2s`，本轮 `claw search` 约 `0.65s`；host-action/driver 定向测试 `7/7`、CLI driver/wait-resume/Goal 路由测试 `5/5`。这些是 supplied closeout 在其 revision 上已经验证的版本化证据，不代表本次 knowledge pass 重新执行了测试。
- 主要剩余摩擦是必须复制较长的固定 code-mode bridge、PowerShell/`rg` 转义注意力，以及异步 Truth 写入来源与完成提示不够清晰。固定 bridge 的程序合同仍由 `../adr/codex-plan-mutations-use-fixed-code-mode-consumer.md` 唯一拥有；knowledge job 的 current lifecycle 与可观察性边界仍由 `codex-knowledge-capture-boundary.md` 和 `../adr/hook-owned-two-phase-knowledge-finalization.md` 拥有。本节只保留体验证据，不把报告中的优化建议提升为已采纳决策。
- 评估开始时工作树已有 `8` 个 Truth/ADR 修改，结束时显示 `9` 个；新增显示文件的时间早于本轮 `plan done`，无法可靠归因于本轮完成钩子，因此没有撤销。相比此前记录过的 Goal/host-action 同步风险，本轮没有复现；这只证明该样本成功，不能把历史风险写成已永久消除。

#### 本轮证据与检索词

- `0.1.85 CLI source installed plugin aligned`
- `plan create planning process.active Goal task done retrospective end.completed`
- `availability 9 flow 8 utility 8.5 mental pressure 4`
- `driver host-action 7/7 lifecycle 5/5`
- `fixed code-mode bridge PowerShell escaping async Truth attribution`

### Bridge 压缩与并行工作树风险校准（2026-07-19）

- 当前约 20 行、1083 字符的 bridge 样板主要承担首次 driver bootstrap、版本/schema 校验、缓存与 runner 调用；`hostActions` 白名单、input 校验、按 action id 去重消费和 stage-relevant 输出过滤已由 CLI driver 程序化承担。该结论描述的是本轮源码与 installed skill 的只读核对，不表示下面的 hot-path 压缩已经实现；当前消费行为的 owner 是 `codex-workflow-guidance-consumption.md`，设计取舍的 owner 是 `../adr/codex-plan-mutations-use-fixed-code-mode-consumer.md`。
- dirty worktree 或新增修改文件本身不是 claw 心智成本。只读调查只需记录一次初始基线；普通实现只持续关注当前任务写集，来源明确且路径不重叠的并行变化不需要反复提醒。
- 只有新变化与当前写集重叠、归属不明可能被覆盖、会改变当前验证结论，或任务进入 commit/push/release 的全量 clean-worktree gate 时，认知与协调成本才显著上升。release gate 的具体归属分类与清理规则继续由 `../adr/release-0-1-18-publish-and-install-protocol.md` 统一拥有，本文不重复定义。
- 本轮只读调查期间 modified file count 从 `9` 增至 `10`，但没有影响分析；该样本把常见非重叠并行开发下的 claw 额外心智压力校准为约 `2/10`，写集冲突或交付阶段为 `6–8/10`。这些评分是当次工作树的历史观测，不是跨仓库 SLA。

#### 本轮证据与检索词

- `bridge cold path hot path cache source`
- `parallel worktree write set overlap clean-worktree gate`
- `mental pressure 2/10 6-8/10`

### 0.1.86 发布安装同版本线与选择性 workflow 评估（2026-07-20）

- 本轮真实运行边界为全局 `@veewo/claw@0.1.86`、官方 enabled plugin `claw-kit@claw-kit`、marketplace revision `2f7481c915381ea9d34902bf8a7a39df66466cde` 与当前任务实际加载的 `0.1.86+codex.20260720013140` installed skill 同线；runtime locator 的版本化完成证据由 `published-npm-packages.md` 拥有。
- 三类真实流程分别确认：单句文本修正直接工作且未创建 `.claw` / plan / Goal / Truth；模糊的团队共享配置请求创建 plan 后稳定停在 `process.discussing`，没有过早执行；中等评估任务完整经历 `process.discussing -> process.active -> end.completed`，`6/6` tasks 完成，`9/9` canonical plan mutations 成功且没有重放或补偿 mutation。这是 `0.1.86` 当次流程证据，不把所有请求强制纳入 formal workflow；入口决策仍由 `../adr/using-claw-kit-session-entry.md` 唯一拥有。
- 同机样本中常见 `task done` 往返约 `3.7-5.2s`、`plan start` 约 `5.6s`、root `plan done` 约 `7.0s`；评分为运行正确性与稳定性 `8/10`、流畅度和响应成本 `6/10`、用户与 agent 心智压力 `6/10`、真实项目实用价值 `8/10`。这些耗时与评分是该任务、该宿主和该版本的历史观测，不是跨环境 SLA，也不能由单一 search 或 mutation 样本外推整体 workflow 性能。
- root closeout 复现了 terminal `nextsteps` 重复已经由 fixed driver 消费的 `update_goal(status="complete")`，手动照做后得到 `cannot update goal because this thread has no goal`；当前缺陷与实现锚点由 `cli-guided-workflow.md` 唯一拥有，本节只保留它对 `0.1.86` 体验评分的版本化影响。
- 本轮没有覆盖 Codex 重启恢复、`wait/resume`、subplan、并行计划、网络中断恢复或完整性能基准；这些未验证项不能从三类样本的成功结果推断。

#### 本轮证据与检索词

- `0.1.86 CLI official plugin loaded skill aligned`
- `direct work process.discussing process.active end.completed 6/6 9/9`
- `task done 3.7 5.2 seconds plan start 5.6 seconds plan done 7.0 seconds`
- `runtime correctness 8 flow 6 mental pressure 6 utility 8`
- `plan done duplicate update_goal no goal`

### 0.1.86 同版本线 wait/resume 体验补充（2026-07-20）

- 另一轮独立评估同样确认全局 CLI、checkout、official enabled plugin、marketplace revision、source/cache manifest 与 loaded skill locator 都属于 `0.1.86` / `0.1.86+codex.20260720013140` 同版本线；安装完成事实仍由 `published-npm-packages.md` 唯一拥有。
- 该样本的正式计划经历 `process.discussing -> process.active -> process.wait -> process.active -> end.completed`，`4/4` tasks 完成。create/start/task/wait 与 canonical closeout 均可用，但 resume 在 canonical 恢复后遇到 unfinished Goal，root completion 又暴露空 Goal 上的重复 close 指示；这是修复前的版本化体验记录，Goal-action 当前行为由 `codex-goal-mode-integration.md` 拥有，terminal compact-result 行为由 `cli-guided-workflow.md` 拥有。本文只记录它们对当次体验评分的影响。
- 同机耗时为 cold `plan create` 约 `9.8s`、`plan start` `3.5s`、`task edit/done` `2.3-4.5s`、`plan wait` `3.7s`、`plan resume` `2.2s`、`plan done` `4.5s`；评分为运行正确性/稳定性 `6/10`、流畅度 `6/10`、用户与 agent 心智压力 `5/10`、实际项目价值 `8/10`，综合约 `6.5/10`。这些是该 Host 与该轮任务的版本化观测，不与上一样本互相平均，也不是跨环境 SLA。
- 本轮没有独立验证简单请求 direct-work 路由、Codex 重启恢复、subplan、并行计划、网络中断恢复、npm registry/tarball 一致性或 post-turn finalizer 结果；它只支持“插件保持 enabled，formal plan 选择性用于可复用、跨轮恢复或多阶段任务”的既有入口决策，不把改进建议提升为已采纳行为。

#### 本轮证据与检索词

- `0.1.86 installed wait resume unfinished goal canonical mutation persisted`
- `process.discussing process.active process.wait process.active end.completed 4/4`
- `plan create 9.8 start 3.5 task 2.3 4.5 wait 3.7 resume 2.2 done 4.5 seconds`
- `runtime correctness 6 flow 6 mental pressure 5 utility 8 overall 6.5`
