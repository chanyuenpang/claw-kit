# Codex 与 DSH 显式手动知识补录

<!-- state: current -->
## Current behavior

- `knowledge-capture` 只响应用户明确的补录请求，将当前对话中已经建立的事实、内容变更和决策写入项目 Truth/ADR；既支持非 claw 工作，也支持自动 finalizer 漏掉的知识。不得因任务完成或推断知识价值而自动调用。
- 补录由同一 Agent 直接编辑文档，不创建 plan、task、report、job 或辅助代理。可以读取受影响文档寻找已有 owner、避免重复和冲突，但不能从旧 report 或重新调查中补造执行证据。证据不足只跳过受影响的结论，不阻挡独立且有证据的内容。
- 格式附录在产物装配时从 `.agents/skills/claw-kit-doc/references/knowledge-format.md` 复制到技能的 `references/knowledge-format.md`，与 Core finalizer 使用同一个规范源；不是第二份手工维护的格式。
- 文档根目录优先使用已有项目上下文；必要时读取项目配置解析自定义路径，默认 `.claw/truth/`，ADR 位于其 `adr/` 下。先更新已有 owner，再按需新增主题；保持 Truth 和 ADR 一致，保留有价值的历史。
- 技能不依赖 CLI、runtime pin、prepare/complete、配置指纹、外部 writer assignment、登记或索引刷新。机械格式问题在原授权内直接修正，不额外询问。写入并复核文档即完成；不得据此宣称登记、索引刷新或自动 finalizer 成功。
- 手动补录不 claim、重放、接管或完成自动 finalization job，也不改变自动 finalizer 的配置、执行或 closeout 合同。旧 CLI prepare/complete 接口不属于本技能的依赖，此次未删除其实现。

## Implementation anchors

- `shared/skills/knowledge-capture/SKILL.md`：规范入口与直接编辑合同。
- `scripts/skill-artifacts.mjs`：Codex/DSH 技能分发及共用格式附录装配，附录字节参与 source hash。
- `.agents/skills/claw-kit-doc/references/knowledge-format.md`：共用格式规范。
- `packages/core/scripts/copy-workflow-guidance-config.mjs`：finalizer 格式资源装配。
- `scripts/skill-artifacts.test.mjs` 与 `scripts/codex-plugin-bundle.test.mjs`：附录字节一致、独立分发与无 runner 的针对性验证。

<!-- state: history -->
## Evolution history

<!-- dated: 2026-10-21 -->
### 从登记流程收窄为文档补录

旧入口仅允许非 claw 内容，并通过精确 CLI runtime、prepare、assignment、binding 和 complete 登记与刷新。格式拒绝等失败会保留文档，但要求用户决定是否重新 prepare。该流程把补录目标绑定到额外生命周期，导致已知内容因无关摩擦不能完成。现改为直接编辑，保留明确授权、证据诚实及不接管自动任务的边界。
