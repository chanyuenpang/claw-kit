# claw-kit DSH 冒烟测试报告

- 日期：2026-10-02
- 结论：**failed（核心工作流未通过）**
- 目标：Windows / 当前真实 DSH adapter（claw_run）
- 来源：公开渠道默认目标；本轮未下载或安装包。CLI 可执行版本 0.2.42；PowerShell 7.6.6。全局 npm ls -g @veewo/dsh-claw-kit --depth=0 未列出包，且无法从当前 adapter 回执单独确认插件版本。未将其标记为版本门禁通过。
- 隔离：用户明确授权在本仓库执行。测试 workflow 计划位于 .claw/tasks/2026-10-02/claw-kit-冒烟测试/plan.json。未修改源码/安装文件。

## 场景证据

| 场景 | 真实入口 / 输入 | 结果与核验 | 判定 |
|---|---|---|---|
| SMOKE-01 安装/加载/context | claw_run(context)；Windows | context 返回 project claw-kit、真实 DSH host、绑定 workflow。CLI 0.2.42；插件版本未独立确认，公开来源包未下载/安装。 | blocked（版本/公开来源门禁未完全核实） |
| SMOKE-02 create/show | plan.create 创建“claw-kit 冒烟测试”；随后 plan.show | create 返回 process.discussing 与 planPath；show 确认摘要与路径。 | passed（路由行为） |
| SMOKE-03 edit/remove | plan.edit 更新 goal/summary；临时 question、acceptance、rule、key decision、reference 添加后用 remove_* 精确删除 | edit 回执成功；canonical 读取确认临时 reference 移除后 references: []，临时集合未残留。 | passed（集合编辑子项） |
| SMOKE-04 task add/edit/remove/done | task.add → task.edit(id=5,title/detail) → task.done(id=5)；尝试 plan.edit(remove_tasks=[5]) 与 task.remove(id=5) | add/edit/done 成功；移除报 Unsupported plan.edit argument(s): remove_tasks、Operation is outside the model command contract: task.remove。临时 task 仍保留为 done。 | FAILED（DSH 路由未暴露 task removal） |
| SMOKE-05 wait/resume | plan.wait({}) → plan.resume({}) | wait 回执 process.wait，resume 返回执行态/Goal sync。 | passed |
| SMOKE-06 context 恢复 | claw_run(context) | 恢复同一 bound plan/task 状态；未发现重复任务。 | passed（绑定恢复） |
| SMOKE-07 subplan | subplan.create({task_id:3,title,goal}) 被拒绝额外字段；之后 subplan.create({task_id:3}) | 原始错误：CLAW_OUTCOME_UNKNOWN: Invalid task name empty. The operation may already have committed; do not retry it. context 仍绑定父计划；只读 glob 未见新增本轮子计划。未重放。 | blocked（参数合同不足且结果不可重试） |
| SMOKE-09 leave/switch | 当前 claw_run catalog 未提供 plan.leave / switch-task | 未用裸 CLI或其他宿主替代。 | not-applicable（当前 route 未公开入口） |
| SMOKE-08 closeout | 报告先于 root plan.done 写入；按当前 DSH closeout 返回处理 | 本回合结束前尚无终态/后台收口回执。 | 待观察；不得宣称成功 |

## 失败/限制

1. 核心 task removal 无 DSH operation/argument surface；真实调用明确拒绝，SMOKE-04 不通过。
2. Subplan 调用后 outcome unknown；绑定仍在父计划，独立只读目录观察未见子计划。按错误要求未重放。
3. 当前 adapter catalog 没有 leave/switch-task，不以直接 CLI 补测。
4. 插件版本与公开来源安装准备未核实；本报告只代表当前已加载 DSH route 的行为探测，不代表指定公开版本通过。
5. 未覆盖其他平台；不属于本轮范围，不推断通过。

## 原始回执要点

plan.edit goal/summary、集合添加及移除、task.add、task.edit、task.done、plan.wait、plan.resume 均返回 ok。
移除拒绝：Unsupported plan.edit argument(s): remove_tasks；Operation is outside the model command contract: task.remove。
Subplan：CLAW_OUTCOME_UNKNOWN: Invalid task name empty. The operation may already have committed; do not retry it.
Canonical 状态仅通过只读文件读取核查，未直接编辑。
