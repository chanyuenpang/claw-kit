---
name: feature-architecture
description: 为高风险或跨系统功能产出最小充分的领域架构设计；有 claw task 时将报告保存在 task 内并引用到 plan。
---

# Feature Architecture

将功能请求视为对领域模型和架构边界的潜在变更。产出最小充分、可供实现者采用的设计：每个长期存在的概念应有清晰 owner、单一事实来源、必要的协作合同和可验证的失败语义。

默认目标是消除会改变实现决策的未知，而不是形成完整研究报告。不能改变决策、边界、实施顺序或验收方式的信息，应省略或压缩为一句结论。

最终设计固定为四个一级内容：**问题、边界与不变量**；**新增或改变的概念、唯一 owner 与数据流**；**推荐决策、关键理由与一个关键失败路径**；**最小实施切片、验证与关键引用**。条件内容只能嵌入最相关的一项，不得为模板完整性另起一级章节。

## 角色与主代理路由

- 已受派的 feature-architect 直接执行下方子代理工作流；不得再次委派、恢复或修改主代理的 plan。安装、同步或维护本技能时，不执行设计委派。
- 派发 subagent（包括向复用的子代理或 Worker 派送新任务）前，须用一句话向用户简单披露子代理的角色与任务；这是告知，不是额外请求授权。实际宿主授权与工具 schema 优先于本技能。
- 以当前宿主注入的 `[claw host]` platform 声明或原生 adapter 身份判定宿主，并校验实际工具；不以模型、技能文件位置、旧会话或远程工具的宿主替换当前会话身份。身份冲突或能力缺失时明确报告，不切换其他平台。原生 adapter 优先于 hostless 副本。主代理先按下表取得 context，只以返回的 `activeWorkflow` 判断绑定 task，不扫描或猜测其他 task。
- 有 `activeWorkflow` 时，`taskDir` 为返回的 `planPath` 的父目录；`reportDir` 为 `taskDir/feature-architecture/` 的绝对路径。DSH 由 adapter 通过语义委派入口派生并创建目录；其他宿主由主代理创建 reportDir，并把两个不同路径明确传入合同。无 activeWorkflow 时两者都为 null，不创建目录或文件，不添加 plan reference。
- 主代理按当前宿主派发窄上下文设计子代理并取得结果。源代码和项目资料只读；有 task 时唯一允许的写入是一份 reportDir 内的设计报告（含必要的该目录创建），不是整个项目的写权限。宿主无法提供委派时说明限制，不虚构子代理；由用户或 owning workflow 明确决定是否改为主代理直接设计。
- 成功返回报告后，DSH 由 adapter 验证 documentPath 并自动登记 reference，主代理只确认返回的登记证据；其他宿主由主代理确认 documentPath 位于 reportDir 内，再通过同一 adapter 的 plan.edit 添加 reference，why 为 "Feature architecture design for the active task."；只有 mutation 成功才称报告已纳入 plan。不手工编辑 plan 文件或操纵宿主 goal。

## Host routing

先阅读相邻的 [宿主执行路由](references/host-execution.md) 中匹配的一节，取得 context、search、plan.edit 与委派的完整映射。不要因原生入口失败而切换 hostless。

| 宿主 | claw 入口 | 委派 |
| --- | --- | --- |
| DSH | `claw_run` 的 `context` / `search` | `delegate.start` / `delegate.result`；adapter 选择后端、复用成员并登记报告 |
| Codex | context 与 mutation 用固定 code-mode driver；只读 search 用允许的 Codex shell tool | 当前原生 multi-agent 工具，窄上下文、同角色复用、取得结果后继续 |
| Cindy | 当前 Cindy 入口提供的恢复结果及受控 search / plan.edit；模型为 Codex 也仍是 Cindy | 当前工具明确支持的 Orca 文档作者 Worker；先核对角色与报告写权限 |
| OpenCode | 当前 adapter 注入的命令入口 | 当前原生 task/subagent 合同 |
| Standard hostless | 稳定 `CLAW_SESSION_ID` 下的 CLI，不加 host flag | 宿主可用的原生子代理 |

技能从哪个安装包或项目目录加载不限制当前宿主路由；同一项目中的 Cindy 和 Codex 使用者分别走自己的分支。Cindy 不从 researcher 的 Orca 授权推导架构 Worker 授权，必须以当前工具 schema 和本次设计任务的明确权限为准。未知宿主或缺失能力要明确报告，不猜工具、不切换其他平台。

## Delegation contract

这是语义合同，不是可直接传给工具的参数；以当前宿主 schema 映射。

```yaml
delegateSubagents:
  - name: feature-architect
    skill: feature-architecture
    worker: document-author
    reasoning_effort: high
    fork_context: false
    waitForCompletion: true
    preferReuse: true
    inputContract:
      request: 原始功能请求全文及已知目标，不压缩或改写关键约束
      cwd: 工作目录
      skillPath: 当前加载的本技能 SKILL.md 绝对路径
      hostRoute: 当前 adapter 及其 context/search/reference 路由
      taskDir: activeWorkflow 存在时的 task 绝对目录；否则为 null
      reportDir: taskDir/feature-architecture/ 绝对目录；无 task 时为 null
      constraints: 用户约束、非目标、交付限制及只读来源边界
      discovery: 子代理自行定向检索，主代理不预先提供研究结论
    outputContract:
      persistedWhenTaskExists:
        artifact: reportDir 下唯一一份 Markdown 设计报告
        documentPath: 相对项目根目录的报告路径
        documentNaming: 文件名和一级标题均为 YYYY-MM-DD-HHmm-内容摘要
      whenNoTaskExists:
        artifact: 不创建文件
        finalReply: 返回 status 与紧凑 design
      requiredContent:
        - 问题、边界与不变量
        - 新增或改变的概念、唯一 owner 与数据流
        - 推荐决策、关键理由与一个关键失败路径
        - 最小实施切片与验证证据
      references: 关键项目事实在正文旁附精确锚点；末尾仅保留已引用来源的短索引。无法验证的内容标注假设。
      status: ready | needs-decision | insufficient-evidence
      openDecisions: 仅列出高影响且证据不能解决的决策，给出推荐项与原因
    closePolicy: keep_open_for_reuse
```

## 派发消息模板

```text
你是 feature-architect，不继承主代理上下文。直接设计，不再次委派或修改 plan。
完整阅读主代理提供的已加载技能路径：[skillPath]，以及其中匹配宿主的参考。
仅使用指定路径与宿主路由：[hostRoute]。不要自动优先读取项目 .agents 同名副本；路径不可用时报告缺口，不擅自替换宿主合同。
工作目录：[cwd]
原始请求（保留全部约束）：[request]
约束与非目标：[constraints]
task 根目录：[taskDir]
唯一可写报告目录：[reportDir；null 时严禁写任何文件]

先列待决策问题，再通过指定 adapter 的 search 定位最少量 Truth、ADR、设计资料和 owner 锚点；使用配置的代码索引追踪必要关系，索引不足时用宿主原生读/搜索工具精确定位。DSH 使用 read/glob/grep，不使用 shell 替代。来源只读；候选设计收敛后补齐锚点并做反证检查。

有 reportDir 时只在该目录写一份符合命名合同的报告，最终返回 status 和 documentPath；无 reportDir 时不写文件，最终返回 status 和紧凑 design。高影响未决项包含于报告或 design；遵守 outputContract。
```

## 子代理工作流

先做轻量门禁：是否触及持久化/内容协议、三个以上 owner、不可逆规则、长期扩展点或两个以上真实可行方案。仅命中这些条件时完成完整设计；局部、可逆改动交付不超过一页的设计摘要。

1. 只定义新增或改变的术语、状态与不变量，并指出与现有术语的冲突。
2. 为受影响业务事实指定唯一 owner；页面、演出、缓存和适配器不得成为第二个业务真相。
3. 写清正常路径及至少一个影响状态正确性的失败路径；仅在持久化、外部 I/O 或重复命令存在时补充迁移、重试和幂等语义。
4. 仅当取舍真实存在时比较替代方案；列出最小垂直切片和能证明核心合同的验证。

若证据与既有合同冲突或不足，收缩为 `needs-decision` 或 `insufficient-evidence`，并说明最小待补证据。不得以默认兼容、回退或吞错伪装成功。

实施前阅读相邻的 [设计产物与门禁](references/design-artifacts.md)。确认 owner、边界、合同和验证路径后停止扩展检索。
