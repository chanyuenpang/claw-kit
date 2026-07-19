# Codex 异步知识采集边界

## 结论

计划和 session binding 是 `claw-kit` 的前台 canonical lifecycle，必须独立于 Codex hooks。hook、report 或 SDK 的失败一律 fail-open：不能改变 `claw plan write`、`claw plan edit`、`claw plan done`、subplan 完成后的 parent 恢复，或 session binding 的语义。

知识采集使用与前台 lifecycle 分离的 per-session registry / outbox。创建 root plan 或 subplan 时，系统从确定性的计划路径派生相邻 report 路径：`<name>.json` 对应 `<name>.report`。计划从非 `end.*` 进入任一 `end.*` 时记录 pending turn owner；canonical lifecycle 同时按终态语义恢复 parent binding 或清除 root binding，不等待 report、hook 或异步 writer。

## 长期行为 / 规则

- 每次 Codex `Stop` 最多写一份 report。若当前 turn 有 pending ended plan，则该终态计划拥有最终 report；否则写入当前 active plan。终态切换的 transition turn 不得同时写入两份 report。
- Knowledge finalization worker 只异步消费进入 `end.*` 的 source `plan.json`、其相邻 report、finalize id 与 job host。它运行一次 consistency-aware `knowledge-writer`，在同一 pass 中共同维护 Truth 和 ADR、收敛每条 material current claim 的唯一 owner；该 pass 完成后才请求 recall indexing。
- Codex 与 OpenCode 的 `using-claw-kit` 入口都明确告知 agent：eligible closeout 会自动把可复用知识沉淀进 canonical Truth。由该流程产生的 Truth 文件修改属于正常 workflow output，包括其他任务并行运行期间；仅观察到这类修改本身不构成写集冲突或异常沉淀的证据。
- 内置 `knowledge-writer` 通过 top-level `scope: "session"` template 进入四任务 claw workflow。它把 report 结论以及 plan 的 retrospective、`keyDecisions` 和其他明确结论字段作为沉淀证据；task status 只解释 completed、pending 与 blocked scope，task 标题、描述、requirements 与 intentions 不能被提升为执行结果。writer 固定先维护 Truth、再维护 ADR，不设置 `truth` / `adr` / `both` / `noop` route task。direct entry 不依赖项目 `.claw`，session plan 写入用户级 runtime，不触发项目 Truth/ADR capture，因此不会为外层 finalization 再排队递归 job。
- SDK writer 成功返回后，detached worker 递归检查 `.claw/truth/**/*.md`，并幂等补齐 UTF-8 BOM；这是确定性 worker 后处理，不得交给 LLM writer prompt。
- finalization 成功路径的顺序是 writer 完成、Truth/ADR 编码归一化、启动 completion recall refresh、向相邻 report 写入 `knowledge_finalization` 结果，再持久化 `succeeded` job。writer、编码归一化、refresh 或结果持久化失败会进入原有重试路径。
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
- `packages/core/src/knowledge-sidecar.ts`：Truth/ADR Markdown 编码归一化、report 路径 containment 与幂等 finalization-result 写入。
- `packages/cli/src/cli.ts`：Codex-facing CLI lifecycle 与 hook entry。
- `packages/codex-adapter/hooks/hooks.json`：SessionStart / Stop hook surface。
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md` 与 `packages/opencode-adapter/skills/using-claw-kit/SKILL.md`：自动沉淀及正常 Truth workflow output 的入口提示。
- `shared/skills/knowledge-writer/`：combined stewardship workflow、session template 与 fallback 的规范 skill 源。
- `packages/codex-adapter/skills/knowledge-writer/`：Codex Git marketplace 中物化的完整 writer skill package。

## 已知陷阱

- 不能根据目录扫描或 hook event 推断 active plan；无 session binding 时必须保持无恢复状态。
- report 写入时不可把 pending ended plan 和已经恢复的 parent plan 都当成同一 turn 的 owner，否则会产生双写和不确定的 closeout 证据。
- 异步 writer 的完成状态与前台 `claw plan done` 成功是两件事；不得把后者表述为已完成 truth / ADR 沉淀。

## 验证标准

- 人为让 hook、report 或 SDK 路径失败后，plan create/edit/done、subplan parent resume 和 binding 仍按 canonical lifecycle 完成。
- 创建 root plan 和 subplan 时，各自只有由 `.json` 派生的相邻 `.report` 路径。
- 终态 transition 的 Stop 只产生一份、且属于 pending ended plan 的 report；普通 Stop 只属于 active plan。
- worker 输入只接受进入 `end.*` 的 source `plan.json`、相邻 report、finalize id 与 job host；必须完成一次 consistency-aware `knowledge-writer` pass，再请求 indexing。
- real-worker 验收必须确认已安装 skill locator、自动 `scope: session`、四任务固定顺序 completion、Truth/ADR 协同审查、项目 canonical 输出边界，以及没有递归 finalization。
- knowledge finalization 回归应覆盖无 BOM Markdown 的自动修复、重复运行幂等、编码归一化先于 refresh、result 先于 `succeeded` job 持久化，以及 report 保留。
- report result 回归应确认 `.claw/tasks` 内的 write、同 `finalizeId` 去重和原始 turn entry 保留；越界路径必须被拒绝，result 写回失败必须进入重试且不得伪造成功 job。
- runtime 回归需要同时覆盖健康 context 静默、缺失时的英文 consent-required error、无固定 repair command、SessionStart 授权 prompt 前置、adapter 依赖归属和 hook 的 Codex host 标记。
- sidecar 重试应能让先前因 runtime 发现失败的 finalization job 成功；使用同一 context runtime 再次执行时不得重复沉淀已有 truth / ADR。

## 0.1.83 后置 writer 历史边界与当前收敛

- `0.1.83` 的真实 lifecycle 评测曾让父 plan 仍为 `process.active` 时运行的 `knowledge-writer` subplan 选择 `noop`；这是旧 completed-plan gate 与 route task 的版本化证据，不再描述当前沉淀资格。
- 当前 writer 以 report 与 plan 明确结论为证据边界；task status 仅解释结论 scope，task 列表本身不证明执行结果。没有 durable conclusion、存在 freshness 冲突或没有新增 durable knowledge 时形成 evidence-backed no-edit。
- 同一轮主 agent 只能审查进入该轮之前已有的 canonical diff，不能把尚未生成的 post-turn `plan.report` 或后置 writer 产物算作已审查证据。对“本计划自身的最终沉淀质量”的验收仍由 report 已落盘后的 finalizer 完成。
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
