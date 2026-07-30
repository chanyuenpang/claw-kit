# External Writer Skill Config

<!-- state: current -->
## 状态

这是 `claw-kit` 当前工作流的稳定事实。

## 核心事实

- `.claw/project.json` 以 `knowledgeWriter` 对象保存 writer 配置：`executionPolicy`、`externalSkills`、`model`、`reasoningEffort` 与 `datedSectionsToKeep`。`executionPolicy` 接受 `background | subagent` 且默认 `background`；`subagent` 仅受 Codex host 支持。它只选择 executor launcher，不改变 assignment 语义，也不允许失败时跨策略 fallback。
- `externalSkills` 的非空有序列表选择真实外部 skill assignments；列表缺失或为空时选择 Core 内部 built-in governance assignment。该内置 contract 不以 `claw-kit:knowledge-writer` 用户 skill 发布。`datedSectionsToKeep` 的治理语义由 `truth-and-adr-corpus-semantics.md` 唯一拥有。
- Stop/session-idle 创建 job 时把 effective config 快照到 `KnowledgeFinalizationJob.writer`；后续重试使用该快照，不从变更后的项目配置重新推导 capability。
- claim 把冻结配置解析为一个 session-scoped 动态 assignment subplan；同一个 delegate executor 按配置顺序执行全部 assignments，任一失败会阻止后续 assignment 并以 claim token 写入失败终态。main agent 不根据 `keyDecisions` 拆分 Truth/ADR phase。
- 内置与外部 assignment 使用不同 prompt builder。内置 prompt 直接展开隐藏治理 contract；外部 prompt 明确调用配置的 skill、要求无人值守且禁止询问、确认或等待交互。两者都要求使用 task status 区分已完成 scope 与 pending / blocked intent，禁止把 requirements 或 intentions 写成结果，也禁止在 governed docs 中引用会被销毁的 supplied materials。
- 外部 skill 自己拥有输出语义与文档治理。finalizer 不为外部 writer 建立 canonical Markdown 写前快照，也不执行 `datedSectionsToKeep` 裁剪；通用的编码归一化、recall refresh、report result 与 job lifecycle 仍继续运行。
- 动态 assignment subplan 必须进入 `end.completed` 且 tasks 非空、全部 `done`；内置 assignment 自身包含六任务治理 workflow，外部治理 skill 由各 assignment task 的完成状态纳入同一终态判断。
- `externalTruthSkill` 与 `externalAdrSkill` 只作为 legacy repair input；它们不是当前 schema owner，不能恢复独立 phase policy。
- CLI 初始化入口 `--external-writer-skill <skill>` 写入单项 `knowledgeWriter.externalSkills` 配置。

## 影响

- 项目替换内建治理时，通过 `.claw/project.json` 的 `knowledgeWriter.externalSkills` 配置有序 skill 链，不在适配器里硬编码治理分支。
- `executionPolicy` 只改变 Codex subagent 与 background host-agent 的启动方式；两者进入同一内部 delegate template、claim bundle、assignment subplan 与 done protocol。

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
- `packages/core/src/knowledge-assignments.ts`
- `packages/core/resources/delegate-writer/TEMPLATE.json`
- `packages/core/resources/knowledge-writer/`
