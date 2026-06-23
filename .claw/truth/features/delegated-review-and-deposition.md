# Delegated review and deposition

- Codex adapter 的 canonical deposition specialists 是 `truth-writer` 与 `adr-writer`；主代理应把可复用知识或 completed `plan.json` 以紧凑 bundle 交给它们，而不是在主上下文里展开成泛化文档。
- `researcher` 是 investigation-first specialist：调查、分析、证据收集类 task 优先交给它，以避免主 agent 为前置调查消耗过多 context。
- `researcher` 默认使用 `worker` + `gpt-5.4-mini` + 显式 `claw-kit:researcher` skill item；同线程已有合适 researcher 时优先复用。
- `researcher` 应先用 `claw search` 检索 `.claw` context、truth、ADR；若 `.claw/project.json` 中 canonical `gitnexus = true`，应发现并使用 GitNexus 相关能力辅助代码调查。
- planning 直接负责计划质量，因此 review 不再作为独立 workflow gate 插在计划推进前。
- canonical completion artifacts 仍落在 `.claw/truth/` 与 `.claw/truth/adr/`。
- specialist dispatch 默认支持同线程复用；`truth-writer`、`adr-writer` 与 `researcher` 不应在仍可能复用时立即关闭。
- 非用户明确要求时，不要产出独立的 generic docs、总结笔记或 PR 风格说明文档。
