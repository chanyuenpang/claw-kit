# Claw Kit 平台适配与 Codex 功能对标指南

状态：当前实现审计基线，2026-07-31

本文记录 claw-kit 当前的完整功能边界、Codex 插件基线，以及把 claw-kit
移植到新 Host 时必须调查、映射、实现和验证的内容。它面向适配器作者和审查者，
不是某一个 Hook 的设计说明。

本文不取代源码和 canonical Truth/ADR。发生冲突时，按以下顺序判断：

1. 当前可执行源码和测试；
2. `.claw/truth/` 中 `current` 或 `accepted` 的 Truth/ADR；
3. 本文和其他设计文档；
4. Host 适配器自己的说明。

核心与适配器的规范边界见
[Claw Kit Core and Adapter Design](claw-kit-core-and-adapter-design.md)，运行时文件和清理责任见
[Claw Runtime State and Cleanup Specification](claw-runtime-state-lifecycle-spec.md)。

## 1. 移植工作的正确流程

平台移植不是把 Codex 的 Hook 名称翻译成另一个 Host 的事件名。正确顺序如下。

### 1.1 先建立 Host 能力档案

只使用 Host 官方文档、公开源码、类型声明和可重复运行时探针。不要根据事件名、
日志或 UI 表象猜语义。至少回答：

| 能力 | 必须确认的问题 |
| --- | --- |
| 会话生命周期 | 哪个事件代表全新会话、恢复、重启、清空和上下文压缩？事件是否可能重复？ |
| 消息入口 | 能否在模型读取消息前改写 prompt 或注入 additional context？超时和 fail-open 规则是什么？ |
| 身份 | 能否取得稳定的 session/thread id、turn id、workspace root 和当前 cwd？它们由谁保证可信？ |
| Workspace | 是单根、多根还是临时目录？只读状态如何表达？是否允许本地进程访问？ |
| 工具 | 能否注册 typed tools？工具是否能得到 Host 注入的会话与工作区身份？ |
| 进程 | 能否启动 CLI、后台 worker 和 detached process？Windows 如何解析 `.cmd`？ |
| 观察能力 | 能否读取 transcript、最终回答、工具调用和 task checkpoint？ |
| UI 投影 | 是否有 Todo、Goal、Card 或 progress API？能否更新同一个对象？ |
| Agent 能力 | 是否支持后台 agent、原生 subagent、继续已有 agent，以及完成回执？ |
| 配置与安装 | 插件 manifest、权限、启用状态、缓存、升级和卸载合同是什么？ |
| 安全 | 哪些路径、环境变量、网络和凭证可见？用户同意边界在哪里？ |

`workspace` 不等于 `workdir`/`cwd`。`cwd` 是一次进程或命令的解析起点；
workspace 是 Host 授权给会话的工作区边界，可能有多个根、只读属性或临时映射。
当前 Core 主要通过 `cwd` 向上解析 `.claw`，并通过独立的 session key 绑定计划；
新适配器必须显式完成 `Host workspace → 安全 cwd/project root` 的映射，不能把两个概念混用。

### 1.2 再恢复 claw-kit 自身上下文

对仓库实现问题，调查顺序是合同的一部分：

1. 先运行 `claw search --query "<topic>"`，恢复 Truth、ADR、历史任务和声明文档中的设计背景。
2. 读取 `.claw/project.json` 与本地 override，确认 GitNexus、memory、Goal 和 writer 配置。
3. GitNexus 可用时，用它追踪调用关系、符号和依赖图。
4. 最后使用 `rg` 和精确文件读取确认当前实现。
5. 结论同时记录“为什么如此”和“现在具体如何运行”，不能只保留其中一边。

`claw search` 是项目文档/知识召回；GitNexus 是代码关系缩小；`rg` 是精确定位。
三者不是互相替代。

### 1.3 以 Codex 为功能基线，而不是复制模板

先为每项 Codex 功能记录：

- canonical owner；
- Codex 使用的 Host 能力；
- 入口、输入、输出和失败语义；
- Prompt/Guidance 合同；
- 新 Host 的等价能力或明确降级；
- 自动化测试和真实 Host 证据。

然后只实现一条最薄的端到端竖切：上下文恢复、一个计划 mutation、Host 投影和失败路径。
竖切成立后再扩展知识终结、后台维护、更新安装等链路。

### 1.4 最后在真实 Host 验收

打包成功、出现安装确认框、单元测试通过，都不是运行时兼容证明。必须用最终安装产物在
真实 Host 中验证 fresh、resume、compact、缺少 CLI、旧版本、损坏配置、只读工作区、
计划推进和 closeout。

## 2. 架构与责任边界

```text
Canonical Core
  .claw state, plan/task/subplan, context, config, search, memory,
  knowledge jobs, maintenance, retention, structured errors
        |
CLI protocol
  command parsing, host selection, compact result, hook envelope,
  background workers, process portability
        |
Shared behavior assets
  workflowGuidance config, plan templates, shared Skills,
  writer prompts and fallback instructions
        |
Host adapter
  manifest, lifecycle mapping, identity transport, prompt injection,
  typed tools, native Goal/Todo/Card projection, transcript bridge
        |
Distribution
  package, install, enablement, version alignment, update and smoke test
```

Core 是唯一可以定义计划状态和持久化语义的层。Host adapter 只负责进入 Core、
传递可信身份、投影结果和执行 Host 原生动作。

主要代码入口：

- Core 类型与状态：[packages/core/src/types.ts](../packages/core/src/types.ts)
- 计划与子计划：[packages/core/src/plan.ts](../packages/core/src/plan.ts)
- Guidance 计算：[packages/core/src/workflow-guidance.ts](../packages/core/src/workflow-guidance.ts)
- Guidance 文本配置：[packages/core/src/workflow-guidance.config.json](../packages/core/src/workflow-guidance.config.json)
- CLI 协议与 Host 投影：[packages/cli/src/cli.ts](../packages/cli/src/cli.ts)
- Codex 固定 Driver：[packages/cli/src/codex-driver.ts](../packages/cli/src/codex-driver.ts)
- Codex Host Action consumer：
  [packages/codex-adapter/scripts/code-mode-host-action-consumer.mjs](../packages/codex-adapter/scripts/code-mode-host-action-consumer.mjs)

## 3. 当前完整功能地图

下表是移植清单。没有实现或没有明确降级的项目，不能称为与 Codex 功能对标完成。

| 功能域 | Canonical owner / 入口 | Codex 基线 | 新 Host 必须适配或声明 |
| --- | --- | --- | --- |
| 项目发现 | `context.ts`, `paths.ts`, `claw context` | 从 Hook cwd 解析项目；显式调用可初始化/修复 | workspace 到安全 cwd 的映射；嵌套目录和临时目录规则 |
| 项目初始化与协议修复 | `init.ts`, `project-check.ts` | startup/显式 context 返回修复和版本诊断 | 哪个入口允许写入；只读时的结构化降级 |
| 配置分层 | `project.json` + `project-override.json`, `effective-config.ts` | shared Skill 先区分 team/personal | 保持 deep merge、数组替换和显式 `null` 语义 |
| 版本与更新诊断 | `runContextCommand`, `buildVersionSyncPrompt` | autoUpdate 决定强制询问更新或仅提示 | 保留用户同意；更新 CLI 与当前 Host 插件为一个验证单元 |
| 计划创建 | `writePlan`, `plan.create` | 默认 planning-first；固定 Driver 消费 Host actions | session identity、scope、模板路径和返回 Guidance |
| 需求讨论 | `process.discussing`, planning Skill | 不进入 Goal，不实施；任务明确后再 active | Host 没有 Goal 也必须保留暂停语义 |
| 计划 mutation | `editPlan`, CLI plan/task commands | 所有 mutation 经版本化 code-mode Driver | typed gateway 或可靠 CLI worker；禁止重写状态机 |
| 批量 mutation | `PlanMutationOperation`, partial result | Driver 返回 chainStatus 和失败位置 | 部分成功不能被重试成重复 mutation |
| Task 生命周期 | `task.add/edit/remove/done` | Todo 是 plan 的单向投影 | task choice、blocked、subagent_running 和重复调用幂等性 |
| Subplan | `createSubplan` | 父 Goal handoff 后建立子 Goal | parent plan/task 绑定、返回、完成和恢复 |
| Session 绑定 | `session-bindings.ts` | Host thread id 绑定 plan path | 稳定可信 session key、TTL、解绑和过期清理 |
| Session 恢复 | `tryResolveActiveWorkflowSnapshot` | startup/resume/clear/compact 恢复非终态计划 | 新会话绝不假设有计划；只从有效 session binding 恢复 |
| Workflow Guidance | `buildPlanWorkflowGuidance` | 唯一下一步合同 | 完整保留 stage、nextTask、askUser、choice 和覆盖规则 |
| 模板 | `plan-templates.ts`, `.claw/templates` | Skill 可携带 adjacent template | 文件解析、版本验证、choice route、merge/replace |
| Host 计划投影 | `buildHostActions`, `update_plan` | mutationId 生成一次性 action | 无原生 Todo 时明确降级；UI 不能成为 canonical state |
| Goal Mode | `goalTool`, `create_goal/update_goal` | Driver 先检查现有 Goal，并提供 recovery sync | 无 Goal Host 删除投影字段，不改变 Core 生命周期 |
| Ask User | `workflowGuidance.askUser` | Codex options 映射 Host 交互 | 无结构化询问时保持 reason/options 语义并等待用户 |
| Direct mode | `buildDirectWorkflowGuidance` | 无复用知识时跳过计划 | 不得因缺少项目计划而强迫初始化任意目录 |
| Skills | shared source + Host package | using/planning/researcher/config/create/update | Host 的发现、命名、加载、相邻资源和同步策略 |
| 代码/项目调查 | `claw search`, researcher Skill | search → GitNexus → exact search | 把顺序写入入口 Prompt/Skill，而不只藏在 researcher |
| 项目记忆 | `memory.ts`, `memory-query.ts` | `claw search` 召回 truth/ADR/docs/tasks | memory disabled、索引缺失和 provider 失败的降级 |
| Embedding | local/openai config, daemon protocols | 本地缓存、device fallback、远程 API | 网络/凭证/缓存权限、模型尺寸和后台预热 |
| GitNexus | CLI preflight/refresh | 可选代码索引；完成时可刷新 | 是否安装、是否允许自动安装、锁/Windows crash 处理 |
| Daily maintenance | `daily-maintenance.ts` | 非必要工作 fail-open | 必须异步、加锁、幂等；不能延迟 prompt |
| Retention/migration | task lifecycle/layout/retention | Core 统一清理 | adapter 不能另起清理器删除 Core 数据 |
| Completion refresh | CLI queue/worker | memory、task archive、GitNexus 异步刷新 | 状态文件、合并并发请求、失败可观察和可重试 |
| Turn report | transcript parser + Stop Hook | 收集 task conclusion 和 final answer | transcript API、turn id、无目标时的早退出 |
| Knowledge job | `knowledge-sidecar.ts` | capture、claim、complete/fail，持久化回执 | writer 启动不等于完成；Host 必须保留可恢复 job |
| Knowledge writer | assignments/governance | background SDK 或原生 subagent policy | Host 支持矩阵、顺序 assignment、无人值守 Prompt |
| Truth/ADR | knowledge document/governance, truth ingest | 一次 consistency-aware pass | current/history/superseded 语义和有界演化不能丢失 |
| 错误合同 | `ClawError` + compact JSON | 必需 mutation fail-closed，增强项 fail-open | 稳定错误码、用户可执行修复和不可假装成功 |
| 跨平台进程 | CLI/adapter worker | Windows 通过 `ComSpec`/PowerShell 启动 `.cmd` | 每个 OS 的 executable、quoting、encoding、detached 行为 |
| 安全与权限 | paths、worker validation、Host manifest | Interactive/Read/Write 权限 | 路径限制、只读、本地性、环境变量和用户同意 |
| 包装与安装 | Host manifest + release scripts | marketplace identity、enablement、版本对齐 | artifact、安装、启用、缓存和真实运行证据分别验证 |

## 4. Codex 插件基线

### 4.1 Manifest 与入口 Prompt

[plugin.json](../packages/codex-adapter/.codex-plugin/plugin.json) 声明 Skills、权限、
版本、界面描述和三条 `defaultPrompt`。这三条不是营销文案，而是路由代码：

1. 已恢复 workflow 时，禁止再创建计划，先消费 `workflowGuidance`。
2. 没有 scope 时，根据是否会产生可复用项目知识选择 plan 或 direct work。
3. Codex mutation 必须走固定 Driver，由程序消费 `hostActions`，agent 不拆分执行。

任何新 Host 都要有等价的入口合同。若 Host 没有 manifest prompt，必须放在可靠的
主 Skill 或首次消息注入中，并证明每次入口都能到达。

### 4.2 Lifecycle Hooks

[hooks.json](../packages/codex-adapter/hooks/hooks.json) 当前注册：

- `SessionStart(startup|resume|clear|compact)`：
  `claw hook auto-claw --host codex`，用于运行时诊断、版本/修复提示和存在绑定时的恢复。
- `Stop`：运行 adapter-owned knowledge finalizer，收集报告并启动可恢复的异步 writer。

Hook 只是增强层，不能成为计划正确性的唯一来源。事件名也不跨 Host 继承：
全新 session 没有恢复计划的需要；resume/compact 只有在 Core 找到有效绑定时才恢复。
`auto-claw` 仍有计划恢复以外的职责，包括 CLI/SDK、版本、配置和搜索能力提示，因此不能
因“新会话不恢复 plan”而整体删除。

### 4.3 固定 mutation Driver

[codex-driver.ts](../packages/cli/src/codex-driver.ts) 返回带版本、schema、cache key 和
hash 的可执行 Driver。它：

- 自动补 `--host codex`；
- 解析首个完整 JSON；
- 拒绝失败 mutation；
- 按白名单消费 `update_plan`、`create_goal`、`update_goal`；
- 用 action id 防止同次消费重复；
- 处理已有 Goal 与 `claw plan sync` 恢复；
- 只向 agent 返回当前阶段需要的字段。

这是一条原子边界。把 CLI 调用、`get_goal`、`update_plan` 拆给模型分别执行，会引入
重复消费、旧 Goal 和部分状态成功问题。

### 4.4 Plan/Goal 投影

CLI 根据 canonical plan 生成 `hostActions`。Todo 项只使用
`pending/in_progress/completed`，Goal 只在 Guidance 请求时创建或结束。Host 投影失败
不能反向篡改 `.claw`。没有等价 UI 的平台可以返回纯 Guidance，但要记录为 UX 降级，
不是 Core 功能缺失。

### 4.5 Knowledge closeout

[knowledge-finalizer.mjs](../packages/codex-adapter/scripts/knowledge-finalizer.mjs) 在 Stop：

1. 先运行 capture，并禁止前台直接启动 finalizer；
2. 取得持久化 job path；
3. 清除前台 Host/session 环境；
4. 异步启动 `internal-knowledge-finalize`；
5. 捕获和启动均 fail-open。

`knowledgeWriter.executionPolicy=subagent` 则由主 Agent 按完整 dispatch prompt 创建原生
subagent，之后 Stop 生成 awaited job。新 Host 没有原生 subagent 时必须在配置验证阶段
拒绝该 policy，不能静默退回另一路径。

### 4.6 Shared Skills

Codex 包含：

- `using-claw-kit`：主入口、生命周期和 mutation bridge；
- `planning`：讨论与需求收敛；
- `researcher`：有界代码调查；
- `config`：team/personal 配置选择；
- `create-claw-skill`：模板化 Skill 创建与验证；
- `update`：CLI 与 Codex 插件联合升级。

移植时应从 shared source 生成 Host 版本，只在 Host routing、工具调用和安装说明处产生
差异。复制后手工长期维护会造成 Prompt 漂移。

## 5. Prompt 与 Guidance 必须像代码一样审查

claw-kit 中每一句 Prompt 都可能改变控制流、权限、状态推进或失败行为。以下资产全部属于
可执行合同：

- manifest `defaultPrompt`；
- Hook 生成的 `additionalContext`；
- `workflow-guidance.config.json` 的 summary、nextsteps、notes、commandHints、
  goalTool、askUser；
- `using-claw-kit` 和其他 Skill 的正文；
- plan template 的 task detail、rules 和 guidance route；
- update、runtime repair、version sync prompt；
- knowledge assignment、delegate template 和 writer prompt；
- Host adapter 的静态 WAM/system prompt。

### 5.1 每句审查表

每次修改上述文本，逐句记录：

| 字段 | 问题 |
| --- | --- |
| Intent | 这句话要阻止、允许、要求或排序什么行为？ |
| Producer | 哪个源码、JSON、模板或 Skill 产生它？ |
| Trigger | 哪个状态、Host、配置或错误码让它出现？ |
| Consumer | 主 Agent、Driver、Host UI、subagent 还是 writer 消费？ |
| Precedence | 它与 defaultPrompt、Skill、recovered context、template route 如何合并或覆盖？ |
| State effect | 它是否要求 mutation、Goal、询问用户、停止或异步 dispatch？ |
| Failure effect | 缺失、重复、顺序错误或翻译后会产生什么故障？ |
| Evidence | 哪个单元测试、快照、Hook probe 和真实 Host 场景证明它有效？ |

文本修改应像 API 修改一样做 diff review。不要以“语义差不多”为由压缩句子；先证明控制流
等价。面向 agent 的 canonical 元数据和 Host prompt 当前保持英文，用户内容保持原语言。

### 5.2 Guidance 合成顺序

当前 Guidance 大致按以下顺序形成：

1. 从 plan status 选择基础 state template；
2. 渲染 task、plan、Goal 和命令变量；
3. 应用 Host/Goal capability gating；
4. 对 `plan.create` 注入 recall command；
5. 应用 template task done route，按 `merge` 或 `replace` 组合；
6. 若 task 有 completion choices，移除普通 task-done 命令并生成唯一 choice 命令；
7. CLI 再按 Host 压缩字段并生成投影动作；
8. Session 恢复把 Guidance 摘要和 plan content 渲染进 additional context。

审查不能只看最终一句，也要审查覆盖顺序。特别是 `replace` route 会有意清空默认
nextsteps、notes 或 commandHints。

### 5.3 Prompt/文档漂移审计

本次审计确认以下差异；已修复项仍保留在清单中，避免后续同步重新引入：

1. `researcher` Skill 明确规定 `claw search → 配置/代码索引 → 精确源码`，但
   `using-claw-kit` 主入口没有把它写成所有代码调查的通用规则。SessionStart 动态提示
   也只在能力开启时使用 “When useful”，不足以保证先 search 再 `rg`。
2. `memory.enabled` 曾在 canonical config reference 与 `config` Skill 中互相矛盾；
   现已统一为项目记忆、任务记忆、embedding refresh 和 `claw search` 的 master switch。
3. `codex-startup-recovery.md` 曾要求主 agent 在 `plan done` 前 deposit Truth/ADR；
   现已改为 adapter-owned Stop/finalizer closeout。
4. Core/adapter 设计文档中的部分 Cindy lifecycle 映射属于进行中设计，不能作为已完成
   真实 Host 验证证据。

这些修订只清理 Prompt 和文档合同，没有改变 Core 状态机。

## 6. Host 适配设计规则

1. **先映射能力，再映射事件。** `did-session-created` 不是 `SessionStart` 的天然等价物。
2. **全新会话不恢复计划。** 只有当前 session key 已绑定非终态计划时才恢复。
3. **不要把 auto-claw 缩减成 plan recovery。** 它还承载版本、安装、运行时、配置修复和
   search capability prompt；若 Hook 无法可靠承载，主 Skill 必须手动调用 `claw context`
   或等价 auto-claw 入口。
4. **阻塞路径只做正确 prompt 所需工作。** cleanup、embedding warmup、retry discovery
   和 completion refresh 进入异步 worker。
5. **Canonical state 只有一个。** Card、Todo、Goal 和 Host session metadata 都是投影。
6. **身份由 Host 注入。** 不让模型猜 session id、workspace 或 provider。
7. **必需 mutation fail-closed，增强项 fail-open。** 不成功就不假装成功。
8. **不自动修复用户环境。** CLI/SDK/配置修复先说明原因和风险并取得同意。
9. **不依赖私有日志。** 私有日志只可用于诊断，不可成为路由合同。
10. **不以 artifact 代替安装与运行证据。**

## 7. 功能分级与允许降级

| 等级 | 内容 | 发布要求 |
| --- | --- | --- |
| P0 Canonical correctness | 项目解析、计划/task/subplan、session binding、Guidance、错误与持久化 | 必须完整；不得降级语义 |
| P1 Workflow continuity | prompt 入口、恢复、typed mutation、配置/更新诊断、closeout job | 必须有 Host 等价路径或明确阻止发布 |
| P2 Native projection | Todo、Goal、Card、结构化 ask-user、原生 subagent | 可降级，但必须记录 UX 差异 |
| P3 Optimization | 预热、后台刷新、卡片复用、低延迟 daemon | 可后续实现，失败必须 fail-open |

Host 不支持 P2 时，正确做法是保留 Core 结果和清晰 Guidance，而不是在 Core 中删除相应
概念或伪造 Host 能力。

## 8. 验证矩阵

### 8.1 Core 与 CLI 合同

- plan 状态和非法 transition；
- task choice、批量 mutation partial result；
- session bind/resolve/unbind/TTL；
- template merge/replace 与变量；
- Guidance 每个状态、Goal gating、askUser 和 recall command；
- project config/override/repair/version sync；
- search、embedding provider 和 memory disabled；
- knowledge job capture/claim/done/fail/retry；
- maintenance lock、retention、migration 和 completion refresh；
- Host compact result 与稳定错误码。

### 8.2 Adapter 单元与集成

- Host payload → cwd/session/turn identity；
- fresh session 不恢复、已有 binding 才恢复；
- prompt timeout 和 fail-open verdict；
- typed tool schema、路径和只读检查；
- mutation 后只生成一次 UI/Goal action；
- worker crash、CLI 缺失、非 JSON 和 partial failure；
- Windows `.cmd` 通过 `ComSpec`/`cmd.exe` 或已验证的等价方式启动；
- static prompt、dynamic prompt 和 Skill 的组合快照；
- knowledge capture 无目标时早退出，存在 job 时可恢复。

### 8.3 真实 Host E2E

至少执行：

1. 新建 session，健康项目，无活动计划；
2. 新建 session，缺少 `.claw`，显式调用插件；
3. 当前 session 创建计划、推进 task、创建 subplan、返回父计划；
4. Host 重启/恢复同一 session；
5. 上下文 compact 后恢复；
6. 新 session 指向同一 workspace，确认不会误恢复旧 session 计划；
7. CLI 缺失、CLI 旧于项目、可更新版本、用户拒绝更新；
8. SDK/worker 缺失和配置损坏，确认先询问再修复；
9. 只读或非本地 workspace；
10. `claw search → GitNexus → rg` 调查链；
11. plan done、turn report、writer 成功和 writer 失败重试；
12. 插件更新后 manifest、启用 identity、CLI 与插件版本一致。

每项记录：Host 版本、插件 artifact 版本、CLI 版本、输入、可见 prompt、工具调用、
canonical `.claw` 变化、Host 投影和最终结果。

## 9. 发布前移植检查表

- [ ] Host 能力档案来自官方资料和运行时探针。
- [ ] 已完成 `claw search`、GitNexus 和精确源码三层调查。
- [ ] 完整功能矩阵逐项标记 implemented/degraded/unsupported。
- [ ] workspace、cwd、project root 和 session identity 没有混用。
- [ ] 所有 Prompt/Guidance 已逐句 review，并有触发与消费者说明。
- [ ] Shared Skill 与 Host-specific Skill 的 owner 清楚，未复制漂移。
- [ ] P0/P1 行为有自动化合同测试。
- [ ] P2 降级不会改变 canonical state。
- [ ] 后台维护不阻塞用户 prompt。
- [ ] CLI/SDK/配置修复遵守用户同意。
- [ ] Windows/macOS/Linux 进程路径按支持范围验证。
- [ ] 最终安装包已在真实 Host 做 fresh/resume/compact/closeout smoke。
- [ ] 版本、manifest、marketplace identity、启用状态和 runtime 一致。
- [ ] 已记录剩余限制，未把未验证行为写成已完成。

## 10. 关键当前实现与决策索引

计划、Session 与 Guidance：

- [Task-plan storage and session binding ADR](../.claw/truth/adr/task-plan-storage-and-session-binding.md)
- [CLI-guided plan lifecycle ADR](../.claw/truth/adr/cli-guided-plan-lifecycle.md)
- [SessionStart workflow recovery ADR](../.claw/truth/adr/session-start-restores-session-bound-workflow.md)
- [Codex workflow guidance feature](../.claw/truth/features/codex-workflow-guidance-consumption.md)
- [Codex Goal Mode contract](../.claw/truth/adr/codex-goal-mode-thread-contract.md)
- [Fixed code-mode mutation consumer](../.claw/truth/adr/codex-plan-mutations-use-fixed-code-mode-consumer.md)

搜索、配置与知识：

- [Codex recall uses claw search ADR](../.claw/truth/adr/codex-recall-uses-claw-search.md)
- [Search index and embeddings ADR](../.claw/truth/adr/search-index-refresh-and-openai-embeddings.md)
- [Project override ADR](../.claw/truth/adr/project-override-overlays-canonical-project-config.md)
- [Hook-owned knowledge finalization ADR](../.claw/truth/adr/hook-owned-two-phase-knowledge-finalization.md)
- [Codex knowledge capture boundary](../.claw/truth/features/codex-knowledge-capture-boundary.md)
- [Truth/ADR corpus semantics](../.claw/truth/features/truth-and-adr-corpus-semantics.md)

Codex adapter：

- [Codex hooks strategy](../packages/codex-adapter/references/codex-hooks-strategy.md)
- [Codex startup recovery](../packages/codex-adapter/references/codex-startup-recovery.md)
- [Codex session entry validation](../packages/codex-adapter/references/codex-session-entry-validation.md)
- [Codex using-claw-kit Skill](../packages/codex-adapter/skills/using-claw-kit/SKILL.md)
