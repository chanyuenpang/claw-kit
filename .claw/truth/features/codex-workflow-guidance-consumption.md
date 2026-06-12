# Codex workflowGuidance consumption

- Codex adapter 应把 `workflowGuidance` 视为主合同，但 planning 自身现在负责计划质量，不再把 standalone `plan-review` 当成进入下一阶段的必经门。
- 当 `claw` 计划命令返回结果时，adapter 应优先消费 compact 字段：`planStatus`、`workflowGuidance`、`planSummary`，以及需要时的 `completionRefresh`。
- `planSummary` 是聊天协作中可展示的紧凑计划状态；adapter 不应期待 render blocks、widget envelope、`claw plan app` 或 `claw plan render`。
- investigation-first 是 Codex workflow 的主流程规则：当 task 主要是调查、分析或证据收集，而不是直接实现时，应优先派发 `researcher` specialist。
- `researcher` 可由 task shape 触发，不必等待 `workflowGuidance.delegateSubagents` 明确列出；派发时使用 `worker` + `gpt-5.4-mini` + 显式 `claw-kit:researcher` skill item，并优先复用同线程已有 researcher。
- `researcher` 的调查顺序应先 `claw search --query "<topic>"` 检索 `.claw` context、truth 和 ADR；当 `gitnexus.enabled = true` 时，再发现并使用 GitNexus 相关能力做代码调查。
- 当 guidance 指向 `truth-writer` 时，应在 plan closure 前沉淀 truth；当 completed-plan guidance 指向 `adr-writer` 时，completed `plan.json` 才是 ADR deposition bundle。
- `claw plan done` 之后，root-plan 仍有一个显式 closeout phase；adapter 不能在没有核验 `workflowGuidance.delegateSubagents` 要求的 `truth-writer` / `adr-writer` 实际已发生时就宣告 round complete。
- `@claw-kit` 的正常使用已经把 delegated specialist 机制纳入 workflow contract；如果当前 surface 没有现成的 agent-management 工具，主 agent 应先用 `tool_search` 找到它们，再按 `workflowGuidance.delegateSubagents[*].skill` 直接派发，而不需要每次都 inline 读取 writer skill 文件。
- reusable truth 的判断权在主 agent：只有当 completed task 真的产出可复用知识时，主 agent 才先整理 truth 再 dispatch `truth-writer`；`truth-writer` 仍然是按需触发，但 `adr-writer` 在 root-plan closeout 里是必经步骤。
- 如果任务走了 git commit flow，closeout 还必须回头检查仓库里同一轮产出的文档残留，把 canonical truth / ADR 更新和其他同轮 shipped docs 一起收口，而不是把它们留在工作区尾巴上。
- `prepare.requirements` 阶段如果 `goal.text` 缺失，adapter 应先补 goal，再补其余 plan 字段；如果需求已经完整，补完后应立即把 `plan.status` 切到 `process.active`，而不是继续停留在 requirements。
- adapter 不应在 `plan write` 时启动 thread goal；只有 plan 首次进入 `process.active`，并且 `workflowGuidance.goalMode` 明确返回时，才应按 `setWhen = on_enter_process_active` 消费它。
- adapter 必须把“没有 `goal.text` 就不能进入 `process.active`”视为 harness hard gate，而不是可由 prompt 规避的建议。
- `planning` 现在是唯一可见 plan skill，并吸收了原本拆在 standalone workflow skills 中的 lifecycle 与 `workflowGuidance` 消费规则。
- `packages/codex-adapter/skills/planning/SKILL.md`、`packages/codex-adapter/skills/using-claw-kit/SKILL.md` 与相关 references 都应遵循同一 CLI-driven compact guidance 合同。
