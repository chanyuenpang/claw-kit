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
- 无 turn-stopping 钩子：终态 plan mutation 写入 adapter 私有 final journal；统一的
  claw-kit claim 流程随后调用 DSH collector 发布按时间排序的 report，knowledgeDispatch
  经 DSH 原生 subagent 自动分发。

## 安装

```powershell
# 已发布到 npm：直接安装（重启 DSH Host 后生效；验证组合：dsh --profile web --dump-config）
dsh plugin --profile web add @veewo/dsh-claw-kit
```

仓库内本地开发可用 tarball 流程（等价安装面）：

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

安装即投递 8 个 skills（`ctx.skills` bundled provider，无需手动复制）：

- shared 同步：`planning`、`config`、`create-claw-skill`、`feature-architecture`、`claw-kit-doc`
  （`npm run sync:shared-skills` 维护，勿手改——AUTO-GENERATED banner）；
- Host 特定（本包手写）：`using-claw-kit`（claw_run 单路线主入口）、
  `researcher`（recall → code index → exact source 调查顺序 + 可选 subagent 委派）、
  `update`（CLI + adapter 联合升级，见 `skills/update/SKILL.md`）。

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
