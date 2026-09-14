# 全局概念词典

本词典只定义已导出规则涉及的概念。优先阅读规则文档，只有需要核对定义或别名时再查本页。

## 适配门禁报告 · `adapter-gate-report`

- 汇总 contractVersion、capabilities、公共检查、包级验证、真实 smoke 证据与 ready 结论的交付产物。

## 适配就绪状态 · `adapter-readiness`

- 只有 profile、五端口、公共 conformance、包级验证与真实宿主正反路径证据同时满足时才能成立的平台交付状态。

## Bootstrap 端口 · `bootstrap-port`

- 由适配器实现的可信启动与恢复端口，接收会话身份并返回项目、协议检查、启动恢复和可选 activeWorkflow 快照。

## Canonical 计划 · `canonical-plan`

- 别名：Canonical Plan
- 持久化 goal、requirements、tasks、status、rules、decisions 与 retrospective 的前台工作流真源。
- 标签（仅分类与搜索，不参与推理）：canonical-state、plan

## 能力条款 · `capability-clause`

- PAC v1 中具有稳定名称的单项 required/forbidden 语义，例如 workflow.recovery、projection.plan、goal.lifecycle、finalization.native-subagent 与 report.claim-time-capture。

## 命令结果 · `command-outcome`

- Command 端口的封闭结果分类；必须明确区分 committed、partial、rejected 与 unknown，不能压成模糊成功布尔值。

## Command 端口 · `command-port`

- 接收可信会话身份与工作流命令、调用共享协议/Core 语义并返回明确 CommandOutcome 的逻辑端口。

## 已提交结果 · `committed-outcome`

- canonical mutation 已成功提交的命令结果，返回 planPath、planStatus、可用的 mutationId、完整 workflowGuidance 与可选 effect/dispatch envelope。

## 适配一致性门禁 · `conformance-gate`

- 以 Core profile、公共协议 fixtures、效果/派发回执和真实宿主 smoke 为输入，判断一个平台 adapter 是否满足 PAC v1。

## 派发回执 · `dispatch-receipt`

- Finalizer 端口返回的 finalizeId、accepted/rejected 与可选 diagnostic；只证明 handoff 结果，不证明 knowledge writer 成功。

## Effect 端口 · `effect-port`

- 校验并按序执行 native effect intents 的适配器逻辑端口，返回逐项 receipt 或结构化 hostEffectFailures。

## 效果回执 · `effect-receipt`

- Effect 端口对单项或一批原生效果的结构化执行证据，保留 action identity、处理状态与诊断。

## 执行证据 · `execution-evidence`

- 别名：Execution Evidence
- 由明确任务结论、最终回合内容、计划 retrospective 与 key decisions 构成的可沉淀证据；任务状态本身不证明结果。
- 标签（仅分类与搜索，不参与推理）：evidence、input、knowledge

## Finalizer 端口 · `finalizer-port`

- 消费 immutable knowledgeDispatch、完成一次宿主原生 handoff 并返回接受/拒绝回执的逻辑端口；不等待 writer 完成。

## 宿主动作 · `host-action`

- 别名：Host Action
- 命令 envelope 中带幂等 action ID 的受限原生效果，目前包括 update_plan、create_goal 与 update_goal。
- 标签（仅分类与搜索，不参与推理）：effect、event、host

## 宿主适配器 · `host-adapter`

- 别名：Host Adapter
- 平台侧实现，锻造可信会话身份并实现 PAC v1 的 Bootstrap、Command、Effect、Finalizer 与 Conformance 端口；消费 Core/CLI 合同但不拥有 canonical workflow。
- 标签（仅分类与搜索，不参与推理）：adapter、host、participant

## 宿主目标与进度 · `host-goal-progress`

- 别名：Host Goal And Progress
- 宿主侧 Goal 与 Progress 的投影状态；它帮助执行但不替代 canonical plan。
- 标签（仅分类与搜索，不参与推理）：goal、host、progress

## 宿主集成档案 · `host-integration-profile`

- 别名：Host Integration Profile
- Core 拥有的封闭 v1 能力合同，把命名 capability clauses 映射为各宿主 required/forbidden 行为，覆盖 Goal 效果、工作流恢复、报告捕获与知识收尾。
- 标签（仅分类与搜索，不参与推理）：capability、decision、host

## 知识派发 · `knowledge-dispatch`

- 别名：Knowledge Dispatch
- 针对 subagent policy 生成的不可变派发合同，包含 finalizeId、模型配置与内部 delegate workflow prompt。
- 标签（仅分类与搜索，不参与推理）：dispatch、event、knowledge

## 知识收尾作业 · `knowledge-finalization-job`

- 别名：Knowledge Finalization Job
- 项目作用域计划正常完成时派生的可认领、可重试作业，冻结 plan/report 路径、writer 配置、host、capture 窗口与 finalizeId；end.leave 只取消关联作业。
- 标签（仅分类与搜索，不参与推理）：job、knowledge、state

## 知识写入器 · `knowledge-writer`

- 别名：Knowledge Writer
- 由宿主原生运行时执行的最终化参与者，认领作业、按固定 assignment 顺序审查证据并确认一次终态结果。
- 标签（仅分类与搜索，不参与推理）：knowledge、participant、writer

## 原生效果失败 · `native-effect-failure`

- 已知 handler 缺失、调用异常或已验证 native effect 未成功的失败回执；canonical mutation 仍保持 committed。

## 原生效果意图 · `native-effect-intent`

- Core/CLI 在 canonical commit 后产生、由 adapter 原生执行的版本化效果意图总类，包括 host actions 与 completion refresh 等 post-commit effects。

## 真实宿主冒烟证据 · `native-smoke-evidence`

- 在真实宿主环境执行正常路径和关键失败路径后留下的可追溯证据，证明 native transport、effect 与 finalizer 确实可运行。

## 部分提交结果 · `partial-outcome`

- mutation chain 的前缀已提交、后续在首个语义错误处停止的结果，携带 completedOperations、failedOperation、remainingOperations 与最新 canonical 摘要。

## 计划完成事件 · `plan-completion`

- 别名：Plan Completion
- 计划从非终态进入 end.completed 的一次性事件；项目计划必须先保存 retrospective，并可携带 key decisions。
- 标签（仅分类与搜索，不参与推理）：completion、event、plan

## 计划离开事件 · `plan-leave`

- 别名：Plan Leave
- 计划进入 end.leave 的取消或脱离事件；它解除当前绑定并撤销相关知识旁路，不代表成功完成。
- 标签（仅分类与搜索，不参与推理）：cancellation、event、plan

## 计划变更 · `plan-mutation`

- 别名：Plan Mutation
- 由 plan/task 命令产生、经过语法与状态迁移校验并写入 canonical plan 的变更事件。
- 标签（仅分类与搜索，不参与推理）：event、mutation、plan

## 计划任务 · `plan-task`

- 别名：Plan Task
- 计划内可独立推进和验证的有序检查点，拥有 pending、in_progress、subagent_running 或 done 等进度状态。
- 标签（仅分类与搜索，不参与推理）：checkpoint、plan、task

## 平台适配合同 v1 · `platform-adapter-contract`

- 平台无关的聚合合同，规定 canonical owner、逻辑端口、输入输出、结果分类、失败语义、幂等责任与准入门禁，但不规定语言、进程、包目录、UI 或发布方式。

## 提交后效果 · `post-commit-effect`

- canonical commit 后触发的非业务真源效果，例如 completion refresh；失败必须可见但不得回滚或重放原 mutation。

## 项目知识 · `project-knowledge`

- 别名：Project Knowledge
- 经治理后保存在项目 Truth、ADR 或受管外部文档中的稳定事实、决策、约束与演化记录。
- 标签（仅分类与搜索，不参与推理）：knowledge、output、truth

## 恢复对账 · `recovery-reconciliation`

- 在 unknown、partial 或需要投影修复时，以同一可信会话身份重新 Bootstrap、读取 canonical 事实并决定下一步的恢复判定。

## 恢复快照 · `recovery-snapshot`

- Bootstrap 端口返回的只读事实，包含 project、protocolCheck、startupRecovery 与可选 activeWorkflow；它不创建第二套持久化状态。

## 拒绝结果 · `rejected-outcome`

- Core 在 canonical mutation 前明确拒绝的结果，携带稳定 code、message、details，且只有显式 retryable 前置失败允许原请求重试。

## 可复用项目知识意图 · `reusable-project-knowledge-intent`

- 一次请求是否预期产生可复用事实、决策、约束、模式或项目上下文的输入判定；它只决定是否进入正式 claw workflow。

## 会话计划绑定 · `session-binding`

- 别名：Session Plan Binding
- 把 session key 显式映射到 .claw 相对 planPath 的 canonical lookup 状态；只保存零或一个当前计划，不扫描任务目录猜测。
- 标签（仅分类与搜索，不参与推理）：binding、session

## 会话身份 · `session-identity`

- 别名：Session Identity
- 由当前宿主适配器从可信运行上下文锻造的 hostId、sessionId、canonical workdir 与 contractVersion；模型或普通命令参数不得覆盖，用于隔离会话运行时、计划绑定和知识作业归属。
- 标签（仅分类与搜索，不参与推理）：session、state

## 未知结果 · `unknown-outcome`

- 请求已发出但响应丢失或超时、无法证明是否提交的 transport 结果；它不是可重试失败，必须先恢复并对账 canonical 状态。

## 工作流准入判定 · `workflow-admission`

- 在创建 claw workflow 前执行的边界判定；可复用知识请求进入 Bootstrap，普通即时任务完全绕过正式计划生命周期。

## 工作流命令 · `workflow-command`

- 带 operation、input 与 requestId 的受控输入；其语义由 Core 解释，transport 和 adapter 不自行改写生命周期。

## 工作流指引 · `workflow-guidance`

- 别名：Workflow Guidance
- 依据计划状态、前一状态、任务进度、模板和 host profile 派生的结构化下一步合同。
- 标签（仅分类与搜索，不参与推理）：decision、output、workflow
