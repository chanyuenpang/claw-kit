# @veewo/dsh-claw-kit

DSH（DeepSeek Harness）的 claw-kit 适配器：一个 `claw_run` 工具，通过
`claw session open --host dsh` 常驻 daemon 执行 `.claw` 工作流操作，自动消费
CLI 生成的 `hostActions`（进度投影 + DSH 原生 Goal 同步），并只返回紧凑 guidance。

与 Codex 适配器共享同一份 hostActions 协议（`schemaVersion: 1`，
`update_plan` / `create_goal` / `update_goal`）；区别在于 Codex 用模型求值的
code-mode driver 信封消费，这里在 `claw_run` 工具内部消费——不需要信封、不需要
模型 eval、工具面固定为一个工具。

Goal 动作遵循共享状态转换合同：`create_goal` 只在没有原生未完成 Goal 时创建；
`blocked` 只允许由 active 发起，`complete` 允许由 active 或 blocked 发起。DSH
原生 Goals 没有 blocked 状态，因此将合法的 `blocked` 映射为原生完成；后续恢复会
创建新的原生 Goal。重复 action ID 与不匹配的状态均为 no-op。

## 架构

```text
DSH 会话
  └─ claw_run 工具（本插件注册）
       └─ ClawSession（常驻子进程：claw session open <workdir> <sessionId> --host dsh）
            └─ claw/execute（JSON-RPC over stdio）
                 └─ CLI daemon → 返回 { output, hostActions, knowledgeDispatch }
                      ├─ consumeHostActions：create_goal/update_goal → DSH ctx.goals
                      └─ compactClawOutput：白名单字段（stage/nextsteps/notes/nextTask/
                         commandHints/askUser/planSummary/planStatus）→ 模型
```

生命周期钩子（fail-open）：

- `agent/session-start` → `claw context --host dsh`，恢复绑定计划并注入紧凑
  workflow 快照（`systemPrompt.context` 名 `claw:workflow`）；
- `agent/pre-step` 的新 turn 首步：adapter 私下只读查询当前绑定 plan，恢复 DSH
  因 `turn/start` 清空的原生 todo。活动、等待、讨论阶段装载当前任务；所有 `end.*`
  或 owner 明确返回无绑定时清理，子计划进入／返回按当前绑定快照切换。
  该恢复不产生模型工具调用、消息、提示词或 Goal/plan mutation；同一 turn 后续 step
  不重复查询。读取有 2 秒预算并随 turn 取消／插件卸载中止，失败静默跳过、不误清理
  或阻断业务。允许宿主清空至恢复完成期间短暂空白，不修改 DSH 本身。
- 无 turn-stopping 钩子：计划完成后，每份 source-plan handoff 分发一个原生
  `subagents` writer。worker 通过 `knowledge.materials` 按需读取完整源计划和
  有上界的普通对话，再以普通、不捕获知识的辅助计划／子计划完成收口；不创建
  claimable job，不复用 writer lease，也不等待第二份终态。主模型不手工管理 writer。
- 前台 `delegate.start/result/complete` 是 adapter 本地语义入口，不转发成未知 CLI 命令。
  详见 [委派合同与验证边界](<../../docs/dsh-delegation.md>)。

## DSH 0.2.2-rc.3 兼容性

2026-11-14 核对：当前适配器源码版本 `0.2.72.6` 无需新增 rc.3 运行时分支，
也不需要迁移 profile 或 Session 数据。本次不打包、不分配新候选版本、不发布／安装。

核对基线是当前 Desktop 安装的 `@deepseek-ai/dsh@0.2.2-rc.2`；目标是 npm
[官方 rc.3 发布包](<https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-0.2.2-rc.3.tgz>)，
不是把当前运行环境误认作 rc.3。以下 15 个包中所选的 38 个相关源码文件逐字一致
（包名均带 `@deepseek-ai/dsh-` 前缀；这是适配器使用表面的核对，不是全包无变化的声明）：

| 使用表面 | 核对包 |
| --- | --- |
| 原生委派、目录、创建与调用者身份 | `subagent`、`subagent-spawn-in-process`、`agent` |
| skill 注册、提示词、工具与 Goal | `skill`、`system-prompt`、`tools`、`goal` |
| 子进程、Session、历史、workspace 与模型偏好 | `subprocess-local`、`session`、`session-query`、`workspace`、`llm` |
| 设置入口、Slot 与浏览器 RPC | `client-ui-settings`、`client-ui-slots`、`client-connection` |

其中 Slot 源码用 npm rc.2／rc.3 包比较（Desktop CLI anchor 不暴露此包）；
其余以已安装 rc.2 源码对照 rc.3 包。继续使用 rc.2 的扁平 `startActivation`
请求、显式 `delivery: "caller"`／`signal` 和 `listDescendants(rootId)`；
`agentTeams` 只拥有共享任务板，不恢复旧成员载体，不增加版本／目录预检门禁。

rc.3 发布包的升级索引未新增 `v0.2.2-rc.2` 迁移节。对已有 rc.1 迁移项，复核了
`runtime-context-reminders`、`session-append-overloads` 和 `subagent-interrupt-default`：
对话提取已按 `source.kind` 排除合成上下文，只调用而不替换 `Session.append`，
委派也不依赖 `interrupt_agent` 工具。其余账号、Forge、附件／CUA、技能重命名、
插件管理、终端、搜索计费与 macOS 浮层项目不涉及本适配器消费的表面，未作迁移。

验证：`npm test -w @veewo/dsh-claw-kit` 完成 Core／adapter TypeScript 构建，
现有 **166/166** 项回归通过（含身份、复用、不重发、收口、todo 与 RPC）。
这是发布源码契约核对与受控 Host 测试，**不是 rc.3 真实会话 E2E**；未更改当前
安装或重启 GUI。升级宿主后仍应在新会话确认计划操作、委派及知识收口。

## 安装

```powershell
# 已发布到 npm：直接安装（重启 DSH Host 后生效；验证组合：dsh --profile web --dump-config）
dsh plugin --profile web add @veewo/dsh-claw-kit
```

Electron 独占的 `desktop` profile 不接受上面这条命令：PATH 上的全局 `dsh`
会以 `profile "desktop" is managed exclusively by the Electron application`
拒绝它。该 profile 只能通过它自己的插件管理器写入——应用内 Plugins 页，或
agent 工具 `plugin_manager(action: "install_bundle", target: "<spec 或 tarball 路径>")`
——不得用文件系统工具、脚本或 shell 直接改写 profile 文件。完整边界与命令见
[desktop profile 写入边界](<skills/update/references/desktop-profile-write-boundary.md>)。

仓库内本地开发可用 tarball 流程（等价安装面，仅适用于非 Electron profile）：

```powershell
npm run export:dsh-plugin     # 生成 dist/dsh-plugin/veewo-dsh-claw-kit-<v>.tgz
npm run install:dsh-plugin    # dsh plugin --profile web add <tarball>（可 --profile 指定）
```

前置条件：`claw` CLI 已安装且版本与仓库对齐（`claw --version`），
CLI 需支持 `--host dsh`（见 claw-kit 仓库的 dsh host 支持）。

## 工具

`claw_run`：

- `operation`：点号形式（`plan.create`、`plan.start`、`task.done`、`plan.done`、
  `plan.show`、`search` 等）；
- `args`：操作字段（snake_case，与 daemon canonical contract 对齐）；
  - `plan.start`：`goal`、`requirements`、`questions`、`acceptance`、`rules`、
    `key_decisions`、`references: [{ path, why }]`、`add_tasks`；
  - `plan.edit`：上述 plan 字段，以及 `summary`、对应的 `remove_*` 字段、
    `retrospective`、`what_worked`、`issues`、`follow_ups`、`status`；需要保持
    mutation 顺序时可直接传 canonical `operations` 数组；
  - `plan.resume`：可选 `plan_id`；`plan.done`：完整 closeout 字段；
  - `task.add`：单个 `title/detail` 或批量 `tasks`；`task.done`：单个
    `id/choice` 或批量 `tasks`；
- 已映射 operation 遇到目录外参数会立即报 `Unsupported ... argument(s)`，不再静默丢弃；
- 会话身份与 workspace 由插件从 `exec.agent` 锻造，模型不得传 session/host/workdir；
- 返回紧凑 guidance + `goalSync`（已自动消费的 goal hostAction 列表）。

## Skills

安装投递由 [skill-inputs.json](<skill-inputs.json>) 声明的 9 个完整 skill 包。
公共规范源只保留一份，打包时复制全套资源与所有宿主分支，不维护 adapter 源码镜像。
`update` 保持本宿主所有权；手动 `knowledge-capture` 与自动 finalizer 分离。
角色技能只提交语义任务和结果，DSH adapter 负责执行机制。

更新安装时若 pnpm 报旧 tarball ENOENT，先 `dsh plugin --profile <name> remove @veewo/dsh-claw-kit`
再重新 `install:dsh-plugin`（版本号即更新信号）。

## 测试

```powershell
npm run build -w @veewo/dsh-claw-kit
npm test -w @veewo/dsh-claw-kit
```

覆盖：operation→daemon input 映射、hostActions 消费（含 fail-open）、Todo 投影与空表清理、
按 agent 隔离的 workflow snapshot、完整 canonical mutation 映射、白名单 compact、
ClawSession 协议（open/request/串行化/启动错误透传/真实 timeout）。

## 会话进程生命周期与诊断

- DSH Web 首次在一个 `(workspace, agent session ID)` 上执行非 `context` 的 `claw_run` 时，Windows 的 `subprocess-local` 为该 CLI 启动一枚 Job runner 和一枚 `claw session open` 目标进程；多个 CLI 连接复用共享 daemon。`context` 和 session-start 恢复是一次性命令。
- 成功的 `plan.done` 在 hostActions 与知识分发交接后关闭当前传输；若同期已有新请求发起，则不关闭新工作的句柄。尚未完成计划的传输连续 **10 分钟**无正在运行或排队的 CLI 请求后回收；下次操作用同一 workdir/agent ID 重新打开，从磁盘保留的 workflow 恢复。页面切换并不是结束事件。独立的 subagent、后台 job、daemon 和持久化计划均不由传输回收删除；共享 daemon 仅在全局无连接后按 CLI 现有空闲策略退出。
- 关闭先等待既有请求排空、发送 `session close`、等待目标自然退出；若 2 秒内不退出，只调用该传输句柄的 `terminate` 并等待其受管进程树退出，不扫描或杀掉全局 Node 进程。超时／失联的 mutation 结果未知，不自动重放，先用 `context`/`plan.show` 对账。
- loopback-only RPC `/claw-session-lifecycle` 返回 `{ schemaVersion, idleTimeoutMs, sessions: [{ workdir, sessionId, state, queued, requestsStarted, lastActivityAt, closeReason }] }`；`state` 区分 `active`（请求排队／运行）、`idle`（传输尚驻留）、`reclaiming`（正关闭）、`dead`（传输已断但记录仍在）。这是适配器**进程内**快照，重启后清零，不是持久会话状态或 OS PID 列表。只读 Windows 采样工具 `scripts/session-process-snapshot.ps1` 用 `sessionId + workdir` 与 runner→claw 父链对应 PID、启动时间及工作集；没有出现在适配器快照中的 PID 只能标记待核查，不能单凭此断定异常残留。

```powershell
# 在 packages/dsh-adapter 中，按需要多次保存现场快照；脚本只读。
./scripts/session-process-snapshot.ps1 -OutputPath .\before.json
./scripts/session-process-snapshot.ps1 -OutputPath .\after.json -LeaseJson .\lease-rpc.json
# 另可在隔离临时项目运行真实 runner/CLI 的打开、复用、切换、关闭、重连探针；不会重启共享 daemon。
node ./scripts/session-lifecycle-probe.mjs
```

回收已有积累进程：先在 DSH Web 停止或完成有活动任务的会话，保存只读快照并核对会话 ID／项目／父链；升级适配器并**经用户明确同意后**正常重启当前 DSH Web 实例，使旧实例通过 DSH subprocess 受管 teardown 关闭它自己仍拥有的子进程。重启前不能因 plan 已完成就批量 taskkill：当前旧插件既无 per-session 可枚举关闭接口，也不能证明历史每个 PID 闲置；重启后仍存留的父 PID 不属于新 DSH 实例、且无法核实身份的进程应逐个核查命令行、创建时间、会话运行状态，再决定是否人工清理。代码构建或测试**不会更新当前正在运行的 GUI**。

## 已知限制

- `systemPrompt.context` 按 DSH agent scope 保存和读取 workflow snapshot，
  并发 Web 会话不会共享全局 last-writer 状态；
- 进度投影（`update_plan` → sessionProjections/UI）为 P2，当前以紧凑 guidance
  + DSH 原生 todo dock 承载。
