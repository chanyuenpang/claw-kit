# Codex workflowGuidance consumption

- Codex adapter 应把 `workflowGuidance` 视为主合同，但 planning 自身现在负责计划质量，不再把 standalone `plan-review` 当成进入下一阶段的必经门。
- 当 `claw` 计划命令返回结果时，adapter 应优先消费 compact 字段：`planStatus`、`workflowGuidance`、`planSummary`，以及需要时的 `completionRefresh`。
- `planSummary` 是聊天协作中可展示的紧凑计划状态；adapter 不应期待 render blocks、widget envelope、`claw plan app` 或 `claw plan render`。
- investigation-first 是 Codex workflow 的主流程规则：当 task 主要是调查、分析或证据收集，而不是直接实现时，应优先派发 `researcher` specialist。
- `researcher` 可由 task shape 触发，不必等待 `workflowGuidance.delegateSubagents` 明确列出；派发时使用 `worker` + `gpt-5.4-mini` + 显式 `claw-kit:researcher` skill item，并优先复用同线程已有 researcher。
- `researcher` 的调查顺序应先 `claw search --query "<topic>"` 检索 `.claw` context、truth 和 ADR；当 `gitnexus.enabled = true` 时，再发现并使用 GitNexus 相关能力做代码调查。
- 当 guidance 指向 `truth-writer` 时，应在 plan closure 前沉淀 truth；当 completed-plan guidance 指向 `adr-writer` 时，completed `plan.json` 才是 ADR deposition bundle。
- `packages/codex-adapter/skills/plan-workflow/SKILL.md`、`planning/SKILL.md`、`using-claw-kit/SKILL.md` 与相关 references 都应遵循同一 CLI-driven compact guidance 合同。
