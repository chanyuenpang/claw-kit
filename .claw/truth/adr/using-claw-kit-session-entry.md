# ADR: `using-claw-kit` 作为 Codex 单一可见入口

## Status

Accepted

现行决策范围覆盖 Codex 与 OpenCode；文件名与早期标题仅保留历史连续性。

## Context

随着 Codex 与 OpenCode 适配器把主流程收敛到 `using-claw-kit` + seeded `planning`，旧的 standalone workflow skills 已不再属于 active main-agent path。

`0.1.53` 曾使用复杂度分数决定是否进入正式 workflow；该版本化规则后来暴露出知识价值与任务规模不等价的问题，现已被“是否预期产生可复用项目知识”的入口判断取代。

入口 skill 还曾先检查当前 prompt / claw command 的 guidance，并同时说明 recovery、`claw context` 与 `claw search` 的正向或反向路由。即使这些句子试图禁止旧行为，它们仍会提高旧行为在默认入口中的注意力权重，并让 skill 重复拥有 hook、runtime 或具体任务已经拥有的职责。默认入口需要只表达当前可执行的正向合同。

## Decision

把 `using-claw-kit` 固定为 Codex 与 OpenCode 两侧唯一的默认可见 session-entry skill。

它应当：

- 在 Codex 的 `@claw-kit` 或 OpenCode 的 claw-kit plugin 被调用时首先判断请求是否预期产生可复用项目知识；否则第一句就跳过该 skill 并直接工作
- 对其余请求执行最小 `First Action`：默认运行 `claw plan create "<title>"`
- template-backed workflow skill 完整承载请求时，不先创建默认 plan，而是跟随该 skill 自己的 entry route；已加载 skill 负责解析自身目录并通过相邻 `TEMPLATE.json` 的 `--template-file` 入口提供精确来源。裸 `--template <id>` 只保留为兼容发现面，精确来源的通用决策由 `.claw/truth/adr/template-guidance-routing-and-config-override.md` 拥有
- `First Action` 在创建 plan 后把返回的 `workflowGuidance` 作为唯一 lifecycle contract，并要求用 stage 与 current task 判断当前工作；`commandHints` 只是 command lookup aids，不是 required next mutations。入口文本不解释 prompt guidance 来源竞争，也不复制完整下游 lifecycle
- 默认入口不展开 recovery、context、search 或完整 lifecycle 命令链；新 plan 从 `process.discussing` 开始，再由 seeded planning task 与返回的 `workflowGuidance` 继续主流程
- 不再按文件数、步骤数、复杂度分数或 session harness 价值决定默认入口，也不从入口 skill 推荐 `--scope session`
- 删除旧入口行为时，不在 skill 内增加对应的反向规则；hook/runtime recovery、recall 与具体任务路由由各自 owner 维护
- 正常线程回复隐藏 claw harness mechanics；只有用户询问，或解释 blocker / result 必需时才暴露

## Consequences

- 插件的默认入口收敛为三条明确结果：无需沉淀时直接工作；其余请求默认创建 project plan；完整 template owner 存在时直接创建 template plan
- 默认入口只陈述 agent 当下需要执行的正向合同，不再用 recovery、`claw context` 或 `claw search` 的反向提示强化已删除路径
- 最小 `First Action` 让 agent 读完入口即可开始，同时把“当前工作语义”与“未来命令提示”分开，避免命令列表制造立即推进 lifecycle 的压力，也避免入口重新拥有恢复或 recall 职责
- project-plan admission 的所有权固定在 `using-claw-kit` 入口层；`planning` 只负责 plan 创建后的需求澄清、任务拆分和质量门
- 显式 session scope 仍是 CLI/template 能力，但不再属于 `using-claw-kit` 的默认入口合同
- SessionStart/hook 恢复、project recall 和 template-owned entry 保持各自的独立 owner；默认入口不复制这些合同
- harness 隐藏边界让正常协作回复聚焦任务结果，而不会把内部 lifecycle mechanics 提升成用户可见产品概念

## Related Code

- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/codex-adapter/skills/planning/SKILL.md`
- `packages/opencode-adapter/skills/using-claw-kit/SKILL.md`
- `packages/opencode-adapter/plugin/index.ts`
- `packages/cli/src/cli.ts`
- `packages/codex-adapter/.codex-plugin/plugin.json`

## Search Terms

- `using-claw-kit`
- `First Action`
- `default plan create`
- `template plan create`
- `no prompt guidance check`
- `hide claw harness mechanics`
- `positive-only entry contract`
- `reverse guidance`
- `reusable project knowledge`
- `project plan versus direct work`
- `explicit session scope`
- `skip claw workflow`
- `planning`
- `startupRecovery`
- `session entry`
- `legacy plan skills`
