# External Writer Skill Config

<!-- state: current -->
## 状态

这是 `claw-kit` 当前工作流的稳定事实。

## 核心事实

- `.claw/project.json` 以 `knowledgeWriter` 对象保存 writer 配置：`externalSkills`、`model`、`reasoningEffort` 与 `datedSectionsToKeep`。`externalSkills` 的非空有序列表选择外部 skill；列表缺失或为空时选择内置 `claw-kit:knowledge-writer`。`datedSectionsToKeep` 的治理语义由 `truth-and-adr-corpus-semantics.md` 唯一拥有。
- Stop/session-idle 创建 job 时把 effective config 快照到 `KnowledgeFinalizationJob.writer`；后续重试使用该快照，不从变更后的项目配置重新推导 capability。
- host-aware finalizer 按配置顺序为每个 skill 运行独立的 prompt/session；任一运行失败会阻止后续 skill。main agent 与 `workflowGuidance` 不拥有 writer dispatch，也不根据 `keyDecisions` 拆分 Truth/ADR phase。
- worker prompt 动态使用当前 `knowledgeWriter.externalSkills` 成员；外部 skill 只接收 skill invocation、source plan、相邻 report、finalization id 和通用输入解释边界，不注入内置 writer 的 one-owner、Truth → ADR、retention 或其他语义治理规则。job 保留最后一个 `sdkThreadId`，并在可用时记录全部 `sdkThreadIds`。
- 外部 skill 自己拥有输出语义与文档治理。finalizer 不为外部 writer 建立 canonical Markdown 写前快照，也不执行 `datedSectionsToKeep` 裁剪；通用的编码归一化、recall refresh、report result 与 job lifecycle 仍继续运行。
- writer 返回后，finalizer 只要求该 host session 中至少一个 session workflow 达到 `end.completed`、包含至少一个 task 且全部 task 为 `done`；完成检查不要求 `templateId === "knowledge-writer"`，所以外部 skill 可以使用自己的 template。
- `externalTruthSkill` 与 `externalAdrSkill` 只作为 legacy repair input；它们不是当前 schema owner，不能恢复独立 phase policy。
- CLI 初始化入口 `--external-writer-skill <skill>` 写入单项 `knowledgeWriter.externalSkills` 配置。

## 影响

- 项目替换内建 writer 时，通过 `.claw/project.json` 的 `knowledgeWriter.externalSkills` 配置有序 skill 链，不在适配器里硬编码 host 分支。
- 外部 writer 必须完成一个 session-scoped workflow，但其 skill 自己决定是否以及如何维护 Truth、ADR、owner 和 retention；内置 `claw-kit:knowledge-writer` 的治理合同不得由 finalizer 强加给它。

## 证据

- `packages/core/src/types.ts`
- `packages/core/src/init.ts`
- `packages/core/src/context.ts`
- `packages/core/src/project-check.ts`
- `packages/core/src/plan.ts`
- `packages/cli/src/cli.ts`
- `packages/core/src/knowledge-sidecar.ts`
- `shared/skills/knowledge-writer/`
