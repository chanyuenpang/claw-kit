# ADR: Codex 与 DSH 手动知识补录以文档为完成边界

## Context

用户需要把当前对话中遗漏的内容变更、事实和决策，以自动 finalizer 相同的格式写入 Truth/ADR。旧手动技能引入 prepare/complete、精确 CLI runtime、assignment、配置指纹及刷新；标题格式等治理失败还要求用户重新确认。它限制为非 claw 工作，与补充 finalizer 遗漏的用途冲突。

## Decision

将 `knowledge-capture` 收窄为用户明确请求、同 Agent 直接编辑的文档补录。支持 claw 与非 claw 工作已经建立的结论，包括 finalizer 遗漏，但不接管或重放自动归档生命周期。

技能附录在装配时从 finalizer 同一个格式规范源复制，避免两套格式漂移。已有文档 owner 优先；仅对受影响内容做证据、格式与一致性复核。机械格式修正在原授权内完成。证据不足只影响对应结论，不阻断其他有证据的补录。

移除技能 runner、runtime pin 和 prepare/complete 依赖；不执行外部 writer assignment、登记、索引刷新或自动 finalizer 恢复。正确写入并复核文档即完成，不额外证明另一套生命周期成功。实际目标不明、缺失证据或写入失败仍须如实说明。

## Alternatives

- 保留两阶段登记，仅增加自动重试：不采用。改善重试仍保留与文档补录无关的运行时与完成门槛。
- 独立维护技能格式副本：不采用。附录复用 finalizer 格式规范源，在打包时复制。
- 用手动技能恢复或完成原 finalizer job：不采用。补录内容与自动任务状态是两个目标，不能用文档编辑伪造归档回执。

## Consequences

- 已知内容不会因 CLI 缺失、配置 assignment 不兼容、登记或刷新失败而无法补录；安装产物可独立携带格式附录。
- 保留明确用户授权、已有事实证据、已有 owner、无递归代理和无自动任务重放的必要边界。
- 文档完成不代表即时索引更新。任何登记、刷新或自动 closeout 状态都不能由本技能推断。
- 自动 finalizer 运行时及现有 CLI prepare/complete 接口不在本次修改范围。

<!-- state: history -->
## Decision evolution

<!-- dated: 2026-10-21 -->
### 替代精确 runtime 的两阶段手动采集

此前要求技能只处理非 claw 工作，并经随包固定版本 runner 执行 prepare → assignment → complete，以 binding 和配置指纹防止跨版本完成。它原本用于隔离自动 finalization，但也把手动补录变成第二套归档流程。当前保留生命周期隔离，不再保留与文档目标无关的完成门槛。
