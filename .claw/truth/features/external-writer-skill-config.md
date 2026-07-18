# External Writer Skill Config

## 状态

这是 `claw-kit` 当前工作流的稳定事实。

## 核心事实

- `.claw/project.json` 以 `knowledgeWriter` 对象保存 combined writer 配置：`externalSkill`、`model` 与 `reasoningEffort`。`externalSkill = null` 选择内置 `claw-kit:knowledge-writer`。
- Stop/session-idle 创建 job 时把 effective config 快照到 `KnowledgeFinalizationJob.writer`；后续重试使用该快照，不从变更后的项目配置重新推导 capability。
- host-aware finalizer 只运行一次 combined prompt。main agent 与 `workflowGuidance` 不拥有 writer dispatch，也不根据 `keyDecisions` 拆分 Truth/ADR phase。
- `externalTruthSkill` 与 `externalAdrSkill` 只作为 legacy repair input；它们不是当前 schema owner，不能恢复独立 phase policy。
- CLI 初始化入口使用 `--external-writer-skill <skill>`，与 `knowledgeWriter.externalSkill` 的单 pass 合同一致。

## 影响

- 项目替换内建 writer 时，通过 `.claw/project.json` 的 `knowledgeWriter.externalSkill` 完成，不在适配器里硬编码 host 分支。
- 外部 writer 必须承担同一个 Truth/ADR stewardship 与 one-owner consistency 合同；覆盖 skill 不能退回 main-agent delegation 或两个独立 phase。

## 证据

- [packages/core/src/types.ts](D:/Users/chany/Documents/claw-kit/packages/core/src/types.ts)
- [packages/core/src/init.ts](D:/Users/chany/Documents/claw-kit/packages/core/src/init.ts)
- [packages/core/src/context.ts](D:/Users/chany/Documents/claw-kit/packages/core/src/context.ts)
- [packages/core/src/project-check.ts](D:/Users/chany/Documents/claw-kit/packages/core/src/project-check.ts)
- [packages/core/src/plan.ts](D:/Users/chany/Documents/claw-kit/packages/core/src/plan.ts)
- [packages/cli/src/cli.ts](D:/Users/chany/Documents/claw-kit/packages/cli/src/cli.ts)
- [packages/core/src/knowledge-sidecar.ts](D:/Users/chany/Documents/claw-kit/packages/core/src/knowledge-sidecar.ts)
- [shared/skills/knowledge-writer/](D:/Users/chany/Documents/claw-kit/shared/skills/knowledge-writer)
