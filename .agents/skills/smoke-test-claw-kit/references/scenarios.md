# 跨平台核心工作流冒烟

## 范围与入口发现

跨平台是同一套行为和断言可在不同平台执行。一次默认运行只记录并测试当前操作系统与当前真实 adapter，不遍历操作系统或宿主清单。由 using-claw-kit 按当前宿主标记和实际工具确定身份，不能根据模型、技能路径或先前会话猜宿主，也不能改 platform/host 参数模拟另一平台。

只有用户明确指定多个目标时才分别准备真实平台环境；目标环境缺条件时先修复，仍不可执行才记 blocked。未指定的其他平台属于范围外，无需检查其安装、凭证或加载条件。公开明确不支持的目标才记 not-applicable。

开始前，从锁定版本的公开 help、运行 skill 和工具 schema 建立“用户行为 → 实际入口 → 场景 ID → 默认覆盖/条件覆盖/不属冒烟及依据”清单，覆盖 plan、task、subplan 与绑定恢复/切换的公开基本操作。表内名称是行为，不是强制所有宿主提供同名命令；例如集合移除可能是独立命令，也可能通过公开 plan.edit mutation 表达。不得借用未发布源码中的参数或底层 CLI 绕过插件缺口。

只通过当前 adapter 执行下表。其他 adapter 共用语义与断言，但在各自宿主执行时才读取其入口说明。Codex 默认运行不得启动 DSH Web profile 或追加 standard CLI lane；Codex 失败就保留 Codex 失败，不换宿主补通过。

## 一次小型工作流覆盖核心操作

创建一个父计划，保留两个业务任务：一个用于 subplan，一个用于返回后继续执行；另加一个可删除的临时任务。使用唯一中文/空格 marker 与测试目录内的有效 reference 文件。尽量在同一计划中串行完成以下步骤，不为每个字段新建计划。

场景编号不是执行顺序：先完成 SMOKE-09 的独立取消及适用切换，再执行父计划场景。SMOKE-08 的父计划 `plan done` 放在最后；证据和报告草稿提前保存，成功后立即结束测试会话，不在同一会话追加检查或等待后台 finalizer。

| ID | 必测行为 | 最小核验 |
| --- | --- | --- |
| SMOKE-01 | 公开安装、加载、init/context | 来源门禁通过，实际入口可用，当前 project/session 正确；不污染用户真实项目 |
| SMOKE-02 | plan create/show | 讨论期计划存在且可读，title/goal 保真，canonical 路径和绑定一致；不提前进入执行 |
| SMOKE-03 | plan edit/remove | 修改 goal、requirements、summary；向公开支持的 question、acceptance、rule、key decision、reference+why 各写一项。再精确移除这些集合的临时项，保留正式要求/reference；重新读取核对增改删和其他字段未丢失。remove 是移除集合值，不是删除计划文件 |
| SMOKE-04 | plan start、task add/edit/remove/done | 按公开规划合同进入 active；增加临时任务、编辑 title/detail、移除它；对保留任务执行实际状态修改和完成。核对稳定 ID、顺序、状态与 nextTask；有规划任务时按 guidance 完成，不自行跳过 |
| SMOKE-05 | plan wait/resume 与状态编辑 | 活跃父计划 wait 后为 wait，resume 后回到 active 和正确 task；核验必要宿主效果。若公开接口另支持直接 status 编辑，选择一个合法非终态转换验证其持久化，再按合同恢复；不枚举所有 status 或强制修改终态 |
| SMOKE-06 | context 恢复、plan sync | 通过真实 adapter 的公开受控 context/恢复入口读取同一测试 session，核验原 plan/task 绑定；当恢复合同要求或支持 sync 时执行一次，确认没有重复任务或 canonical mutation，必要宿主投影正确。仅 plan show 不等于恢复；不为冒烟强制重启宿主，必要入口无法访问时列 blocked |
| SMOKE-07 | subplan create → 执行 → 完成 → 返回 | 在真实父 task 下创建一层子计划，父子关系和绑定正确；完成一个子任务及子计划后恢复父计划。按返回合同核验父 task 是否已自动 done，继续另一个未完成父 task；root 不能提前变为终态，子计划必要收口也须真实执行 |
| SMOKE-08 | 回顾编辑、plan done、立即结束会话、默认收口 | 写 retrospective，及公开支持的 what-worked/issue/follow-up 各一项；完成剩余任务，在 done 前核对字段并保存证据和报告草稿。最后提交父计划 plan done，按路由完成必要前台交接并立即结束本轮。终态 canonical、绑定及真实 writer/finalizer 回执由会话结束后的独立外层观察补核；无观察条件时记待观察，不在测试会话等待或 resume |
| SMOKE-09 | plan leave、绑定切换（适用时） | 用独立测试计划验证 leave，canonical 为 leave、绑定释放；公开支持任务切换时，以两个可合法接管的测试计划验证一次有效切换，核验目标绑定和继承 marker，再 leave。只操作本轮计划，不能靠伪造 session/手工绑定文件制造条件 |

SMOKE-04 的保留任务完成分布在子计划返回及 root 完成阶段，不能在创建 subplan 前全部 done。各阶段以公开 guidance 决定合法顺序；操作数量随模板必要步骤调整，不追求固定调用次数。字段不存在或公开明确不支持时逐项注明依据，不把整行无声跳过。

对标量编辑检查新值，对集合检查新增与精确移除，对 task 检查 ID/状态/顺序，对生命周期检查 canonical/当前绑定/必要宿主效果。ID 和 plan 路径从真实回执/读取取得，不能固定数字或按标题猜路径。父计划 done 前的每组 mutation 通过公开读取入口核验；父计划 done 后立即结束会话，独立外层观察再核验终态，不恢复测试会话。可以只读 canonical 文件作独立佐证，但绝不能直接写文件代替操作。成功终态与取消终态用不同计划验证。

表内字段是代表性基本内容，不要求枚举所有参数；以当版 schema 校准已有字段，不复制全命令手册。直接 status 编辑、sync、switch-task 按 adapter 的公开入口条件覆盖：CLI 有命令不等于该 adapter 暴露同名操作。例如 Codex 固定 driver 未开放 switch-task 时，不能裸 CLI 绕过，应在操作映射记录其公开入口边界；有公开入口而当前缺少访问条件则 blocked，入口宣称可用但行为错误则 failed。

## 平台入口与必要效果

| adapter | 真实入口及边界 |
| --- | --- |
| Codex | 官方 loaded skill 固定 code-mode driver；恢复也走该入口。只核验平台实际支持的 Goal 等效果，无 update_plan 时不要求原生 Progress/clear_progress，但 Claw plan/task/subplan 仍须成功 |
| DSH | 官方加载的插件 claw_run/client 链路，真实 daemon 与它声明的必要 Goal/Progress/收口效果 |
| Cindy | 官方插件真实项目 session 的公开 bridge；使用当前支持的一条 route，不遍历所有 bridge 变体 |
| OpenCode | 官方插件真实命令/工具入口及公开 lifecycle |
| OpenClaw | 官方 adapter 实际注册的工具/skill 入口及公开 lifecycle |
| standard | 公开 hostless CLI 和 agent-owned 收口；不依赖 Codex 原生工具 |

核验效果是验证 claw-kit 集成，不评价宿主工具算法、UI、模型表现或其他宿主功能。恢复所用 session 必须真实存在，不把另一个用户的活跃会话当 fixture。

## 失败、停止与结论

- 安装来源、加载条件不合格：先按 environment.md 修复并重验，再进入功能操作。不能以本地包修复验收结果。
- 来源合格后 claw-kit 操作报错、partial chain、hostEffectFailures、状态/绑定/收口不一致：保存输入、原始返回及实际已提交范围，记 failed。未提交操作不能计通过；停止依赖错误状态的后续步骤，继续当前目标中的独立步骤；仅显式多平台任务才继续其他目标。
- 依赖 Stop 的异步收口必须先结束测试会话。不得在该会话等待、轮询或 resume 来推动 finalizer；会话尚未结束时没有回执不能判失败。结束后如有独立外层观察，可按公开期限或事先记录的有限窗口核验；没有该条件就明确记待观察，不能宣称完整通过。
- 提交后宿主失败：先读取 canonical 和当前绑定，不重复创建、不回滚、不吞错误；清理时只 best-effort leave 本轮计划，清理成功不改变原失败。
- 外部条件仍缺失：列出修复尝试和所需条件，记 blocked。插件入口失败不能用 CLI/SDK 成功覆盖。

不默认增加全参数组合、所有模板、配置策略、多层子计划、压力/TTL、检索质量、升级和故障注入。额外发现的缺陷保留记录，需要深入验证时单独说明范围。

报告逐平台、逐步骤列：公开版本/实际 session 与 plan 标识、用户行为和真实 operation/输入、预期、原始回执、独立状态核对、passed/failed/blocked/not-applicable 与证据路径。场景内子项有失败或阻塞时整项不能 passed；平台有产品失败即 failed，必要环境仍缺失且无产品失败则 blocked，所有适用必测项通过才可称该平台核心工作流可用。所有声明目标平台通过才能称本轮范围通过。范围内受阻、未选范围与公开不支持的组合分别列出；未执行的平台不推断通过。
