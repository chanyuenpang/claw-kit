# Codex subagent reuse

- Codex adapter 可以在同一线程复用同类型 specialist，避免为每次沉淀重新创建短命子代理。
- `truth-writer` 与 `adr-writer` 在 dispatch 后应保持打开，供同线程后续复用，而不是立刻关闭。
- 调查、分析、证据收集类 task 应优先委派给 `researcher` specialist，以节省主 agent context。
- `researcher` 默认 dispatch 合同是 `worker` + `gpt-5.4-mini` + 显式附加 `claw-kit:researcher` skill item。
- 同线程已有合适 `researcher` 时应优先复用；没有合适 worker 或角色已经漂移时才新建。
- `researcher` 应先用 `claw search` 做 `.claw` context、truth、ADR 检索，再进行更窄的代码调查。
- 如果 `.claw/project.json` 中 `gitnexus.enabled = true`，且问题涉及代码关系或当前实现行为，`researcher` 应先发现并使用 GitNexus 相关能力；不要假设 GitNexus tool 已经可见。
- `plan-review` 不再是单独的 workflow gate；如存在 review specialist，也不应再把它建模成 planning 外的一道必经关卡。
- 复用不会放宽 bundle contract：`truth-writer` 接收 completed subtask report，`adr-writer` 接收 completed `plan.json`，`researcher` 接收窄调查 brief 与具体目标。
