---
name: feature-architecture
description: 为高风险或跨系统功能产出最小充分的领域架构设计；有 claw task 时将报告保存在 task 内并引用到 plan。
---

# Feature Architecture

将功能请求视为对领域模型和架构边界的潜在变更。产出最小充分、可供实现者采用的设计：每个长期存在的概念应有清晰 owner、单一事实来源、必要的协作合同和可验证的失败语义。

默认目标是消除会改变实现决策的未知，而不是形成完整研究报告。不能改变决策、边界、实施顺序或验收方式的信息，应省略或压缩为一句结论。

最终设计固定为四个一级内容：**问题、边界与不变量**；**新增或改变的概念、唯一 owner 与数据流**；**推荐决策、关键理由与一个关键失败路径**；**最小实施切片、验证与关键引用**。条件内容只能嵌入最相关的一项，不得为模板完整性另起一级章节。

## 主代理路由

- 主代理触发本技能时，先通过当前 adapter 的受控恢复入口取得 context，只以返回的 `activeWorkflow` 判断当前会话是否已有绑定的 claw task；不得扫描或猜测其他 task。Codex 使用固定 code-mode driver 的 `argv: ["context"]`；DSH 使用 `claw_run(operation: "context", args: {})`；其他 adapter 使用其注入当前 host 的 context 入口。不得直接运行 CLI 或手工附加 `--host`。
- 若存在 `activeWorkflow`，从 `planPath` 的父目录取得 `taskDir`，创建 `taskDir/feature-architecture/`，并把该绝对路径作为唯一报告目录传给架构子代理。报告文件名和一级标题使用 `YYYY-MM-DD-HHmm-内容摘要`。
- 子代理成功返回 task 内报告后，主代理立即执行 `claw plan edit --reference <相对项目根目录的报告路径> --why "Feature architecture design for the active task."`。只有该 mutation 成功，才向用户称报告已纳入 plan。
- 若 `claw context` 没有 `activeWorkflow`，仍可派发只读设计子代理，但不得创建、保存或要求任何 Markdown 文件，也不得向 plan 添加引用；子代理仅在最终消息返回 `status` 和紧凑的 `design` 内容。
- 主代理必须按下方合同派发只读设计子代理；收到结果后继续 claw 流程。若本技能正在被安装、同步或维护，而非为一个功能请求产出设计，则不进入该子代理路由。

## Delegation contract

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
      request: 原始功能请求全文及已知目标，不压缩、不改写关键约束
      cwd: 工作目录
      taskDir: activeWorkflow 存在时的 task 绝对目录；否则为 null
      constraints: 用户已明确的项目约束、非目标和交付限制
      discovery: 子代理自行检索项目事实、现有设计资料与外部参考；主代理不提供研究结论
    outputContract:
      persistedWhenTaskExists:
        artifact: taskDir/feature-architecture/ 下的一份 Markdown 设计文档
        documentPath: 相对项目根目录的文档路径
        documentNaming: 文件名和一级标题均为 YYYY-MM-DD-HHmm-内容摘要
      whenNoTaskExists:
        artifact: 不创建文件
        finalReply: 返回 status 与紧凑 design
      requiredContent:
        - 问题、边界与不变量
        - 新增或改变的概念、唯一 owner 与数据流
        - 推荐决策、关键理由与一个关键失败路径
        - 最小实施切片与验证证据
      references: 每项依赖项目事实的关键决策在正文旁附精确锚点；正文末尾仅保留已引用来源的短索引。无法验证的内容明确标注假设。
      status: ready | needs-decision | insufficient-evidence
      openDecisions: 仅列出高影响且无法由现有证据解决的决策，并给出推荐项与原因
    closePolicy: keep_open_for_reuse
```

## 派发消息模板

```text
你是本次任务的 feature-architect 子代理，不继承主代理上下文。

请完整阅读：[cwd]\.agents\skills\feature-architecture\SKILL.md；若不存在，读取当前安装包中的同名 SKILL.md。

任务工作目录：[cwd]
原始设计需求（保持原意与全部约束）：[request]
明确约束与非目标：[constraints；无则写“无额外约束”]
报告目录：[taskDir；若为 null，严禁写入任何文件]

先列出待决策问题，再用 `claw search --query` 定位最少量的相关 Truth、ADR、设计资料和 owner 锚点。使用 GitNexus 或项目配置的代码索引追踪必要关系；索引不足时再用 `rg` 精确定位。候选设计收敛后，为关键结论回填精确锚点并做反证检查。

若报告目录存在，在其中写入一份 Markdown 设计文档；若不存在，不写任何文件而在最终回复中给出紧凑 `design`。设计满足 outputContract 的必填内容。最终只返回：有 task 时 `status` 和 `documentPath`；无 task 时 `status` 和 `design`。
```

## 子代理工作流

先做轻量门禁：是否触及持久化/内容协议、三个以上 owner、不可逆规则、长期扩展点或两个以上真实可行方案。仅命中这些条件时完成完整设计；局部、可逆改动交付不超过一页的设计摘要。

1. 只定义新增或改变的术语、状态与不变量，并指出与现有术语的冲突。
2. 为受影响业务事实指定唯一 owner；页面、演出、缓存和适配器不得成为第二个业务真相。
3. 写清正常路径及至少一个影响状态正确性的失败路径；仅在持久化、外部 I/O 或重复命令存在时补充迁移、重试和幂等语义。
4. 仅当取舍真实存在时比较替代方案；列出最小垂直切片和能证明核心合同的验证。

若证据与既有合同冲突或不足，收缩为 `needs-decision` 或 `insufficient-evidence`，并说明最小待补证据。不得以默认兼容、回退或吞错伪装成功。

实施前阅读相邻的 [设计产物与门禁](references/design-artifacts.md)。确认 owner、边界、合同和验证路径后停止扩展检索。
