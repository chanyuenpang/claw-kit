# Codex 异步知识采集边界

<!-- state: current -->
## 结论

计划和 session binding 是 `claw-kit` 的前台 canonical lifecycle，必须独立于 Codex hooks。hook、report 或 SDK 的失败一律 fail-open：不能改变 `claw plan write`、`claw plan edit`、`claw plan done`、subplan 完成后的 parent 恢复，或 session binding 的语义。

知识采集使用与前台 lifecycle 分离的 per-session registry / outbox。创建 root plan 或 subplan 时，系统从确定性的计划路径派生相邻 report 路径：`<name>.json` 对应 `<name>.report`。计划从非 `end.*` 进入任一 `end.*` 时记录 pending turn owner；canonical lifecycle 同时按终态语义恢复 parent binding 或清除 root binding，不等待 report、hook 或异步 writer。

## 长期行为 / 规则

- 每次 Codex `Stop` 最多写一份 report。若当前 turn 有 pending ended plan，则该终态计划拥有最终 report；否则写入当前 active plan。终态切换的 transition turn 不得同时写入两份 report。
- Knowledge finalization worker 只异步消费进入 `end.*` 的 source `plan.json`、其相邻 report、finalize id 与 job host。它动态运行 job 配置的 writer skill；未配置 `externalSkill` 时才选择 consistency-aware `claw-kit:knowledge-writer`，由该内置 pass 共同维护 Truth 和 ADR、收敛每条 material current claim 的唯一 owner。外部 skill 的 prompt 与治理边界由 `external-writer-skill-config.md` 唯一拥有；writer 完成后才请求 recall indexing。
- Codex 与 OpenCode 的 `using-claw-kit` 入口都明确告知 agent：eligible closeout 会自动把可复用知识沉淀进 canonical Truth。由该流程产生的 Truth 文件修改属于正常 workflow output，包括其他任务并行运行期间；仅观察到这类修改本身不构成写集冲突或异常沉淀的证据。
- 内置 `knowledge-writer` 通过 top-level `scope: "session"` template 进入六任务 claw workflow，依次完成材料结论提取、证据新鲜度判断、canonical owner 搜索、Truth 维护、ADR 维护和跨文档一致性审查。writer 按内容解释所有提供的材料，不把 plan、report、closeout 命名或任何固定字段、记录形状、序列化格式当作输入 schema；source `plan.json`、相邻 report 与 finalize id 只是当前 finalizer 提供的具体 runtime inputs。task status 只解释 completed、pending 与 blocked scope，task 标题、描述、requirements 与 intentions 不能被提升为执行结果。writer 固定先维护 Truth、再维护 ADR，不设置 `truth` / `adr` / `both` / `noop` route task。direct entry 不依赖项目 `.claw`，session plan 写入用户级 runtime，不触发项目 Truth/ADR capture，因此不会为外层 finalization 再排队递归 job。
- 内置 `knowledge-writer` 是 explicit-invocation-only skill：其共享与 Codex/OpenCode 物化入口都要求调用方明确提供 materials，不能因为普通任务看似可能产生知识而隐式触发。host-aware finalizer 通过专用 worker prompt 明确调用该 skill；foreground `using-claw-kit` 只说明自动沉淀边界，不加载或派发 writer。当前 entry 的薄路由、template-owned execution 与不暴露 storage scope 是 `create-claw-skill-entry-contract.md` 所定义通用转换合同在该 package 上的应用；共享源和物化分发 ownership 由 `shared-planning-skill-source.md` 持有。
- 内置 SDK writer 成功返回后，detached worker 先治理该 pass 改动的 canonical Markdown，再递归检查 `.claw/truth/**/*.md` 并幂等补齐 UTF-8 BOM；dated-section trimming 是仅用于内置 writer 的确定性后处理。外部 skill 不建立治理快照或执行 dated trimming，但仍经过通用编码归一化与后续 finalization lifecycle。
- finalization 成功路径的顺序是 writer 完成、changed-document evolution governance、Truth/ADR 编码归一化、启动 completion recall refresh、向相邻 report 写入 `knowledge_finalization` 结果，再持久化 `succeeded` job。writer、governance、编码归一化、refresh 或结果持久化失败会进入原有重试路径。
- report result writer 只接受 `.claw/tasks` 内的路径，并在文件锁下按 `finalizeId` 幂等写入。成功记录包含 result、recorded time、attempts、host、可用时的 writer thread，以及 Truth encoding 统计；重试命中已有同 id 结果时不得重复追加。
- finalizer 不主动删除 report。report 随整个 task directory 归档，并只在 task retention 裁剪对应 archived task 时删除；这一 retention 生命周期及默认值由 `task-layout-and-session-bindings.md` 记录，决策理由由 `../adr/hook-owned-two-phase-knowledge-finalization.md` 拥有。
- 主 agent 不再判断或派发 knowledge writer；combined writer 的返回文本不控制 fixed Truth→ADR deposition sequence，异步知识采集也不能反向接管 plan lifecycle 或 session binding。
- 前台 plan mutation 成功后，hook、report 或 SDK 的错误只能作为可观察的附加失败，不能回滚、阻塞或重写 canonical plan state。
- Codex host 的 SessionStart hook 显式调用 `claw context --host codex`。该 context 路径只检查 `%USERPROFILE%\.claw-kit\codex-runtime\<version>` 下用户级、版本化 SDK runtime 是否可用，不安装、不修复、不自动重试；非 Codex host 不承担这项检测。
- `@claw-kit/codex-adapter` 拥有 Codex SDK 依赖，通用 `@veewo/claw` CLI 不静态依赖 SDK。knowledge worker 从 context 已准备的 runtime 动态加载 SDK。
- runtime 健康时，公开 context 不输出 runtime 路径或版本；runtime 缺失或无效时，返回英文结构化 `CODEX_SDK_RUNTIME_MISSING` error，其 `requiresUserConsent` 为 `true`，且不提供固定 `repairCommand`。
- SessionStart 将该 error 的 agent prompt 前置到默认和已恢复 workflow 的 `additionalContext`；agent 必须先告知用户并取得同意，再根据当前环境诊断和选择安全修复方案，修复后重新运行 `claw context --host codex` 验证，不得盲目重复失败动作。

## 关联代码

- `packages/core/src/plan.ts`：canonical plan create/edit/done 与 root/subplan lifecycle。
- `packages/core/src/session-bindings.ts`：`sessionKey -> planPath` 的显式绑定及 parent 恢复。
- `packages/core/src/context.ts`：只通过 session binding 恢复当前 workflow。
- `packages/core/src/knowledge-sidecar.ts`：writer config snapshot、Truth/ADR Markdown 编码归一化、report 路径 containment 与幂等 finalization-result 写入。
- `packages/core/src/knowledge-governance.ts`：本轮 changed canonical files 的 dated-section governance 与裁剪报告。
- `packages/cli/src/cli.ts`：Codex-facing CLI lifecycle 与 hook entry。
- `packages/codex-adapter/hooks/hooks.json`：SessionStart / Stop hook surface。
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md` 与 `packages/opencode-adapter/skills/using-claw-kit/SKILL.md`：自动沉淀及正常 Truth workflow output 的入口提示。
- `shared/skills/knowledge-writer/`：combined stewardship workflow、session template 与 fallback 的规范 skill 源。
- `packages/codex-adapter/skills/knowledge-writer/`：Codex Git marketplace 中物化的完整 writer skill package。
- `packages/opencode-adapter/skills/knowledge-writer/` 与 `packages/opencode-adapter/agents/claw-knowledge-writer.md`：OpenCode 物化 package 与显式 writer worker 入口。

## 已知陷阱

- 不能根据目录扫描或 hook event 推断 active plan；无 session binding 时必须保持无恢复状态。
- report 写入时不可把 pending ended plan 和已经恢复的 parent plan 都当成同一 turn 的 owner，否则会产生双写和不确定的 closeout 证据。
- 异步 writer 的完成状态与前台 `claw plan done` 成功是两件事；不得把后者表述为已完成 truth / ADR 沉淀。

## 验证标准

- 人为让 hook、report 或 SDK 路径失败后，plan create/edit/done、subplan parent resume 和 binding 仍按 canonical lifecycle 完成。
- 创建 root plan 和 subplan 时，各自只有由 `.json` 派生的相邻 `.report` 路径。
- 终态 transition 的 Stop 只产生一份、且属于 pending ended plan 的 report；普通 Stop 只属于 active plan。
- worker 输入只接受进入 `end.*` 的 source `plan.json`、相邻 report、finalize id 与 job host；必须完成一次 consistency-aware `knowledge-writer` pass，再请求 indexing。
- 内置 real-worker 验收必须确认已安装 skill locator、自动 `scope: session`、六任务 guidance-backed 固定顺序 completion、Truth/ADR 协同审查、项目 canonical 输出边界，以及没有递归 finalization。外部 writer 验收改为确认动态 skill prompt、无内置治理注入、无治理快照或 dated trimming，并接受任意达到 `end.completed` 且 tasks 非空并全部完成的 session workflow；不完整 workflow 仍失败。
- 分发面检查应确认共享 entry 与 Codex/OpenCode 物化 entry 都保留 explicit-invocation-only description，物化副本除生成标记外与共享源一致；OpenCode worker prompt 必须明确加载 `claw-kit:knowledge-writer` 并传入 supplied materials，而不是依赖隐式 skill discovery。
- knowledge finalization 回归应覆盖 changed-file governance、无 BOM Markdown 的自动修复、重复运行幂等、governance 与编码归一化先于 refresh、result 先于 `succeeded` job 持久化，以及 report 保留。
- report result 回归应确认 `.claw/tasks` 内的 write、同 `finalizeId` 去重和原始 turn entry 保留；越界路径必须被拒绝，result 写回失败必须进入重试且不得伪造成功 job。
- runtime 回归需要同时覆盖健康 context 静默、缺失时的英文 consent-required error、无固定 repair command、SessionStart 授权 prompt 前置、adapter 依赖归属和 hook 的 Codex host 标记。
- sidecar 重试应能让先前因 runtime 发现失败的 finalization job 成功；使用同一 context runtime 再次执行时不得重复沉淀已有 truth / ADR。

<!-- state: history -->
## 演化历史

<!-- dated: 2026-07-18 -->
### 0.1.83 后置 writer 路由

- `0.1.83` 的真实 lifecycle 评测曾让父 plan 仍为 `process.active` 时运行的 `knowledge-writer` subplan 选择 `noop`；这是旧 completed-plan gate 与 route task 的版本化证据，不再描述当前沉淀资格。

<!-- state: current -->
## 当前沉淀边界

- 当前 writer 以所有提供材料中的明确结论为证据边界；plan 与 report 只是当前 finalizer 的具体输入，不定义 writer schema。task status 仅解释结论 scope，task 列表本身不证明执行结果。没有 durable conclusion、存在 freshness 冲突或没有新增 durable knowledge 时形成 evidence-backed no-edit。
- 同一轮主 agent 只能审查进入该轮之前已有的 canonical diff，不能把尚未生成的 post-turn `plan.report` 或后置 writer 产物算作已审查证据。report 落盘后的 finalizer 只拥有本次沉淀的生成与合同内一致性自检；当前 job 没有 source turn 语义水位线或 stale-job cancellation，因此 writer 成功不证明更晚用户输入尚未纠正或取代 source conclusion，也不等同于独立 corpus 验收。
- 当前规范决策由 `.claw/truth/adr/hook-owned-two-phase-knowledge-finalization.md` 拥有。

## 关键检索词

- `fail-open hooks`
- `session binding`
- `pending turn owner`
- `plan report`
- `finalize id`
- `knowledge_finalization`
- `knowledge-writer`
- `consistency-aware knowledge finalization`
- `scope: session`
- `asynchronous truth ADR indexing`
- `CODEX_SDK_RUNTIME_MISSING`
- `requiresUserConsent`
