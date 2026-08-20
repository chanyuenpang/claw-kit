# Codex 显式手动知识采集

<!-- state: current -->
## 当前行为

- Codex 插件公开 `knowledge-capture` skill，但它只响应用户对非 claw 工作中既有结论的明确手动沉淀请求；Agent 不得因任务完成、代码变更或推断出的知识价值自动调用或推荐它。
- 该入口与 claw workflow、自动 closeout、report、transcript、finalization job 和 delegated agent 隔离。它不创建 plan、task、subplan、report、job、background worker、thread 或 collaboration subagent，并且只使用本 Agent 在启动前已持有的结论性材料；证据不足时不编辑。
- 同一 Agent 依次运行 `claw knowledge prepare --source agent-memory --project-root "<project-root>"`、按返回的 assignment 和 resource 路径治理 Truth/ADR、再以 prepare 返回的 fingerprint 对每个实际改动的 canonical Markdown 路径运行一次 `claw knowledge complete`。`prepare` 只读地投影当前有效配置；`complete` 检测配置漂移、治理声明的 canonical 路径、归一化编码并排队既有 completion refresh，且不创建 report 或 knowledge job。
- 手动入口不改变自动 knowledge finalization 的隐藏 writer 边界：`delegate-writer` 和 `knowledge-writer` 仍是 Core 内部资源，不属于插件可发现的 skill surface。

## 实现与验证锚点

- `packages/codex-adapter/skills/knowledge-capture/SKILL.md`：显式用户调用、同 Agent prepare → 写入 → complete 合同和禁止项。
- `packages/cli/src/cli.ts`：`knowledge prepare` / `knowledge complete` 的 CLI contract、active workflow 拒绝和 `agent-memory` source 限制。
- `packages/core/src/knowledge-assignments.ts`：手动 capture 的内置治理 assignment。
- `packages/cli/test/cli-surface.test.ts` 与 `scripts/codex-plugin-bundle.test.mjs`：CLI 约束及 Codex bundle 公开 surface 的 focused coverage。

## 关联文档

- `codex-knowledge-capture-boundary.md` 拥有自动、异步 finalization 的 lifecycle；本文只拥有显式手动入口。
- `codex-plugin-workflow-mechanics.md` 拥有插件公开 surface 与内部 writer 分层的一般规则。
- `../adr/codex-manual-knowledge-capture-boundary.md` 拥有采用显式同 Agent 入口的决策与取舍。

## 关键检索词

- `knowledge-capture`
- `knowledge prepare`
- `knowledge complete`
- `agent-memory`
- `configFingerprint`
- `same-agent manual capture`
