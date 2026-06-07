# ADR: Investigation tasks use researcher specialist

## Status

Accepted

## Context

完成的 `investigation-subagent-workflow` plan 确认：调查型 task 往往需要读取 truth、ADR、历史计划和代码上下文。如果这些检索与分析都在主 agent 中完成，会消耗宿主 context，并让主线程偏离协调和决策职责。

`claw-kit` 已经有 delegated writer 模式和 `claw search` 作为 Codex-facing recall 入口。调查型 task 需要同样明确的 specialist contract，并且需要区分项目上下文 recall 与更深的代码调查。

## Decision

Codex 中的调查型 task 优先委派给 `researcher` specialist，以节省主 agent 的宿主 context。

默认派发合同为：

- `agent_type: "worker"`
- model `gpt-5.4-mini`
- dispatch bundle 显式包含 researcher skill item
- reuse-first，当前线程内已有匹配 `researcher` 时优先复用

`researcher` 的默认调查顺序是先运行 `claw search`，检索 truth、ADR 和项目上下文。若 `.claw/project.json` 中 `gitnexus.enabled = true`，`researcher` 应发现并使用 GitNexus 相关能力辅助代码调查。

## Consequences

- 主 agent 可以把上下文预算保留给任务协调、用户对齐和最终决策，而不是承担全部调查阅读。
- `researcher` 与 `truth-writer`、`adr-writer` 一样成为明确 specialist，但职责限定为调查与报告，不直接替代 writer 沉淀职责。
- `claw search` 成为 researcher 的默认 recall 起点，保持与 Codex-facing recall 决策一致。
- GitNexus 能力只在项目显式启用 `gitnexus.enabled = true` 时进入调查路径，避免对未启用项目产生额外依赖或噪音。

## Related Code

- `packages/codex-adapter/skills/researcher/SKILL.md`
- `packages/codex-adapter/references/codex-subagent-dispatch.md`
- `packages/codex-adapter/skills/master-workflow/SKILL.md`
- `packages/codex-adapter/skills/search-workflow/SKILL.md`
- `.claw/tasks/investigation-subagent-workflow/plan.json`

## Search Terms

- `researcher`
- `agent_type: "worker"`
- `gpt-5.4-mini`
- `reuse-first`
- `claw search`
- `gitnexus.enabled`
- `GitNexus`
- `truth`
- `ADR`
