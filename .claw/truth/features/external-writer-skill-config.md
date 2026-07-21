# External Writer Skill Config

<!-- state: current -->
## 状态

这是 `claw-kit` 当前工作流的稳定事实。

## 核心事实

- `.claw/project.json` 以 `knowledgeWriter` 对象保存 writer 配置：`externalSkills`、`model`、`reasoningEffort` 与 `datedSectionsToKeep`。`externalSkills` 的非空有序列表选择外部 skill；列表缺失或为空时选择内置 `claw-kit:knowledge-writer`。`datedSectionsToKeep` 的治理语义由 `truth-and-adr-corpus-semantics.md` 唯一拥有。
- Stop/session-idle 创建 job 时把 effective config 快照到 `KnowledgeFinalizationJob.writer`；后续重试使用该快照，不从变更后的项目配置重新推导 capability。
- host-aware finalizer 按配置顺序为每个 skill 运行独立的 prompt/session；任一运行失败会阻止后续 skill。main agent 与 `workflowGuidance` 不拥有 writer dispatch，也不根据 `keyDecisions` 拆分 Truth/ADR phase。
- worker prompt 动态使用当前 `knowledgeWriter.externalSkills` 成员。内置和外部 writer 都收到同一无人值守的文档治理 prompt：按指定 skill 的治理规则处理 supplied materials、不请求人工审核或确认、以证据作出决定并跳过歧义或不安全写入；prompt 不再要求严格执行 skill。job 保留最后一个 `sdkThreadId`，并在可用时记录全部 `sdkThreadIds`。
- 外部 skill 自己拥有输出语义与文档治理。finalizer 不为外部 writer 建立 canonical Markdown 写前快照，也不执行 `datedSectionsToKeep` 裁剪；通用的编码归一化、recall refresh、report result 与 job lifecycle 仍继续运行。
- writer 返回后，只有内置 `claw-kit:knowledge-writer` 必须在 host session 中完成一个 `end.completed`、任务非空且全部 `done` 的 session workflow；外部治理 skill 不受该 claw workflow 完成断言约束。
- `externalTruthSkill` 与 `externalAdrSkill` 只作为 legacy repair input；它们不是当前 schema owner，不能恢复独立 phase policy。
- CLI 初始化入口 `--external-writer-skill <skill>` 写入单项 `knowledgeWriter.externalSkills` 配置。

## 影响

- 项目替换内建 writer 时，通过 `.claw/project.json` 的 `knowledgeWriter.externalSkills` 配置有序 skill 链，不在适配器里硬编码 host 分支。
- 外部 writer 作为独立的治理 skill 按自身规则完成，不必创建 claw session workflow；内置 `claw-kit:knowledge-writer` 仍保留其 workflow 完成合同。

<!-- state: history -->
## Evolution history

<!-- dated: 2026-07-21 -->
### 外部 writer 从严格 skill 执行改为无人值守治理适配

此前外部 writer 只接收最小输入边界且也必须完成 claw session workflow。该约束无法同时适配外部 skill 的人工门与 finalizer 的无人值守执行；当前 runner 统一传递治理 prompt，并仅对内置 writer 保留 session workflow 完成断言。

## 证据

- `packages/core/src/types.ts`
- `packages/core/src/init.ts`
- `packages/core/src/context.ts`
- `packages/core/src/project-check.ts`
- `packages/core/src/plan.ts`
- `packages/cli/src/cli.ts`
- `packages/core/src/knowledge-sidecar.ts`
- `shared/skills/knowledge-writer/`
