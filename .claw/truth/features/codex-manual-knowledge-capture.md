# Codex 显式手动知识采集

<!-- state: current -->
## 当前行为

- Codex 插件公开 `knowledge-capture` skill，但它只响应用户对非 claw 工作中既有结论的明确手动沉淀请求；Agent 不得因任务完成、代码变更或推断出的知识价值自动调用或推荐它。
- 该入口与 claw workflow、自动 closeout、report、transcript、finalization job 和 delegated agent 隔离。它不创建 plan、task、subplan、report、job、background worker、thread 或 collaboration subagent，并且只使用本 Agent 在启动前已持有的结论性材料；证据不足时不编辑。
- 同一 Agent 先通过 skill 自带的 `run-knowledge-capture.mjs` 运行 `prepare`，再按返回的 assignment 和资源路径治理 Truth/ADR，并以 prepare 返回的 `captureRuntime.binding` 与配置 fingerprint 对每个实际改动的 canonical Markdown 路径运行一次 `complete`。runner 只使用 `runtime.json` 钉定的精确 CLI：全局 `claw` 版本和能力匹配时复用它，否则仅为本次调用使用固定 npm runtime；它不会更新用户安装，也不会回退到不兼容 CLI。`prepare` 只读地投影当前有效配置；`complete` 在调用 CLI 前拒绝 runtime binding 漂移，随后仍检测配置漂移、治理声明的 canonical 路径、归一化编码并排队既有 completion refresh，且不创建 report 或 knowledge job。
- 手动入口不改变自动 knowledge finalization 的隐藏 writer 边界：`delegate-writer` 和 `knowledge-writer` 仍是 Core 内部资源，不属于插件可发现的 skill surface。

## 实现与验证锚点

- `packages/codex-adapter/skills/knowledge-capture/SKILL.md`：显式用户调用、同 Agent prepare → 写入 → complete 合同和禁止项。
- `packages/codex-adapter/skills/knowledge-capture/runtime.json` 与 `scripts/run-knowledge-capture.mjs`：精确 CLI runtime spec、能力探测、临时 pinned runtime 选择及两阶段 runtime binding 校验。
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
- `captureRuntime.binding`
- `KNOWLEDGE_CAPTURE_RUNTIME_CHANGED`

<!-- state: history -->
## 演进历史

<!-- dated: 2026-08-21 -->
### 从 PATH 上的全局 CLI 改为版本绑定 runtime

早期 skill 直接调用 PATH 上的 `claw knowledge prepare` / `complete`。Codex 插件与全局 CLI 可独立安装和发布，因此旧全局 CLI 会缺少已公开的子命令。当前 runner 将本次 capture 绑定到插件声明的精确 CLI 版本，保留既有 prepare → complete 治理边界，同时使运行时不匹配显式可见。
