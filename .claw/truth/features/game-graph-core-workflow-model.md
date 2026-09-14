# Game-Graph 核心工作流模型

<!-- state: current -->
## 当前行为

- `.game-graph` 工作区包含稳定 ID 为 `claw-kit-core` 的机制容器，名称为“Claw Kit 核心工作流”，范围限定为会话、计划任务、宿主调度与知识收尾。
- Canonical definitions 当前包含 42 个概念；其中 `claw-kit-core` 机制引用 17 个概念并包含 27 条有向规则。该机制覆盖 session identity/binding、canonical plan/task/mutation、workflow guidance、host profile/adapter/action/Goal 与 Progress、完成和 leave 事件、执行证据、knowledge job/dispatch/writer 与最终项目知识；PAC v1 的新增适配概念由独立机制拥有。
- 规则以触发条件、参与者、状态变化、条件或例外和实现证据描述核心闭环。关键边界包括：canonical plan 是工作流真源，宿主 Goal/Progress 是可失败且不得回滚 canonical mutation 的投影；`end.leave` 解除 session binding 并取消关联知识收尾，而不代表正常完成；模型中的 project-scope `end.completed` 路径物化知识作业，subagent policy 在返回不可变 dispatch 前持久化 ready job。完整的当前终态覆盖仍由 knowledge-finalization Truth/ADR owner 与实现拥有。
- 模型通过 `.game-graph/tools/workspace-tool.mjs` 的 JSON 草稿流程维护；本轮 definitions 与 mechanic 草稿均已通过校验、原子保存，并通过 scopes、search、node 与 impact 查询从 canonical 状态读回。后续修改不得绕过草稿校验或直接编辑 canonical JSON。
- 模型中的行为证据锚定 `packages/core/src/plan.ts`、`packages/core/src/workflow-guidance.ts`、`packages/core/src/session-bindings.ts`、`packages/core/src/integration-contract.ts`、`packages/core/src/knowledge-sidecar.ts`、`packages/core/src/knowledge-assignments.ts`、`packages/cli/src/command-service.ts`、`packages/cli/src/codex-host-actions.ts` 及相应 Truth/ADR owner。实现与模型冲突时，应先以当前实现和 canonical Truth/ADR 完成 freshness qualification，再更新模型。

## 关联模型

- `.game-graph/definitions.graph.json`
- `.game-graph/mechanics/claw-kit-core.mechanic.json`
- `.game-graph/workspace.json`

## 关键检索词

`Game-Graph`、`claw-kit-core`、`核心工作流模型`、`17 concepts`、`27 rules`、`canonical plan projection`、`plan leave`、`knowledge dispatch`
