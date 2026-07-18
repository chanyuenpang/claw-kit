# Codex 异步知识采集边界

## 结论

计划和 session binding 是 `claw-kit` 的前台 canonical lifecycle，必须独立于 Codex hooks。hook、report 或 SDK 的失败一律 fail-open：不能改变 `claw plan write`、`claw plan edit`、`claw plan done`、subplan 完成后的 parent 恢复，或 session binding 的语义。

知识采集使用与前台 lifecycle 分离的 per-session registry / outbox。创建 root plan 或 subplan 时，系统从确定性的计划路径派生相邻 report 路径：`<name>.json` 对应 `<name>.report`。计划完成时记录 pending turn owner，但 canonical lifecycle 立即切回 parent binding，或在 root 完成时清除 binding；它不会等待 report、hook 或异步 writer。

## 长期行为 / 规则

- 每次 Codex `Stop` 最多写一份 report。若当前 turn 有 pending completed plan，则该已完成计划拥有最终 report；否则写入当前 active plan。完成切换的 transition turn 不得同时写入两份 report。
- Knowledge finalization worker 只异步消费完成的 `plan.json`、其相邻 report、finalize id 与 job host。它先运行 focused `truth-writer`，再在同一项目状态上运行 focused `adr-writer`；两阶段都完成后才请求 recall indexing。
- SDK writer 成功返回后，detached worker 递归检查 `.claw/truth/**/*.md`，并幂等补齐 UTF-8 BOM；这是确定性 worker 后处理，不得交给 LLM writer prompt。
- finalization 成功路径的顺序是 writer 完成、Truth/ADR 编码归一化、启动 completion recall refresh、持久化 `succeeded` job，最后尝试清理本 job 的临时 report。writer、编码归一化或 refresh 启动失败会进入原有重试路径并保留 report。
- report 清理只接受 `.claw/tasks` 内的路径，并在文件锁下执行。它发生在 `succeeded` 状态持久化之后，是仅尝试一次的 best-effort cleanup；删除失败不改写 job、不重试，也不重新运行 writer。
- 主 agent 不再判断或派发 knowledge writer；两个 focused writer 的返回文本不参与控制流，异步知识采集也不能反向接管 plan lifecycle 或 session binding。
- 前台 plan mutation 成功后，hook、report 或 SDK 的错误只能作为可观察的附加失败，不能回滚、阻塞或重写 canonical plan state。
- Codex host 的 SessionStart hook 显式调用 `claw context --host codex`。该 context 路径只检查 `%USERPROFILE%\.claw-kit\codex-runtime\<version>` 下用户级、版本化 SDK runtime 是否可用，不安装、不修复、不自动重试；非 Codex host 不承担这项检测。
- `@claw-kit/codex-adapter` 拥有 Codex SDK 依赖，通用 `@veewo/claw` CLI 不静态依赖 SDK。knowledge worker 从 context 已准备的 runtime 动态加载 SDK。
- runtime 健康时，公开 context 不输出 runtime 路径或版本；runtime 缺失或无效时，返回英文结构化 `CODEX_SDK_RUNTIME_MISSING` error，其 `requiresUserConsent` 为 `true`，且不提供固定 `repairCommand`。
- SessionStart 将该 error 的 agent prompt 前置到默认和已恢复 workflow 的 `additionalContext`；agent 必须先告知用户并取得同意，再根据当前环境诊断和选择安全修复方案，修复后重新运行 `claw context --host codex` 验证，不得盲目重复失败动作。

## 关联代码

- `packages/core/src/plan.ts`：canonical plan create/edit/done 与 root/subplan lifecycle。
- `packages/core/src/session-bindings.ts`：`sessionKey -> planPath` 的显式绑定及 parent 恢复。
- `packages/core/src/context.ts`：只通过 session binding 恢复当前 workflow。
- `packages/core/src/knowledge-sidecar.ts`：Truth/ADR Markdown 编码归一化、report 路径 containment 与 best-effort cleanup。
- `packages/cli/src/cli.ts`：Codex-facing CLI lifecycle 与 hook entry。
- `packages/codex-adapter/hooks/hooks.json`：SessionStart / Stop hook surface。
- `shared/skills/truth-writer/` 与 `shared/skills/adr-writer/`：两阶段异步沉淀的规范 skill 源。
- `packages/codex-adapter/skills/truth-writer/` 与 `packages/codex-adapter/skills/adr-writer/`：Codex plugin 中物化的 focused writer 入口。

## 已知陷阱

- 不能根据目录扫描或 hook event 推断 active plan；无 session binding 时必须保持无恢复状态。
- report 写入时不可把 pending completed plan 和已经恢复的 parent plan 都当成同一 turn 的 owner，否则会产生双写和不确定的 closeout 证据。
- 异步 writer 的完成状态与前台 `claw plan done` 成功是两件事；不得把后者表述为已完成 truth / ADR 沉淀。

## 验证标准

- 人为让 hook、report 或 SDK 路径失败后，plan create/edit/done、subplan parent resume 和 binding 仍按 canonical lifecycle 完成。
- 创建 root plan 和 subplan 时，各自只有由 `.json` 派生的相邻 `.report` 路径。
- 完成 transition 的 Stop 只产生一份、且属于 pending completed plan 的 report；普通 Stop 只属于 active plan。
- worker 输入只接受 completed `plan.json`、相邻 report、finalize id 与 job host；必须按 Truth 后 ADR 的顺序完成两阶段，再请求 indexing。
- knowledge finalization 回归应覆盖无 BOM Markdown 的自动修复、重复运行幂等、编码归一化先于 refresh，以及成功 job 持久化后的 report 清理。
- report cleanup 回归应确认 `.claw/tasks` 内的 report 可删除，越界路径被拒绝且原文件保留；cleanup 失败不得触发 finalization 重试。
- runtime 回归需要同时覆盖健康 context 静默、缺失时的英文 consent-required error、无固定 repair command、SessionStart 授权 prompt 前置、adapter 依赖归属和 hook 的 Codex host 标记。
- sidecar 重试应能让先前因 runtime 发现失败的 finalization job 成功；使用同一 context runtime 再次执行时不得重复沉淀已有 truth / ADR。

## 关键检索词

- `fail-open hooks`
- `session binding`
- `pending turn owner`
- `plan report`
- `finalize id`
- `truth-writer`
- `adr-writer`
- `two-phase knowledge finalization`
- `asynchronous truth ADR indexing`
- `CODEX_SDK_RUNTIME_MISSING`
- `requiresUserConsent`
