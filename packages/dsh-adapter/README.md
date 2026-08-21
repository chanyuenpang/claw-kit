# @veewo/dsh-adapter

DSH（DeepSeek Harness）的 claw-kit 适配器：一个 `claw_run` 工具，通过
`claw session open --host dsh` 常驻 daemon 执行 `.claw` 工作流操作，自动消费
CLI 生成的 `hostActions`（进度投影 + DSH 原生 Goal 同步），并只返回紧凑 guidance。

与 Codex 适配器共享同一份 hostActions 协议（`schemaVersion: 1`，
`update_plan` / `create_goal` / `update_goal`）；区别在于 Codex 用模型求值的
code-mode driver 信封消费，这里在 `claw_run` 工具内部消费——不需要信封、不需要
模型 eval、工具面固定为一个工具。

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
- `agent/turn-stopping` → `claw hook auto-doc --host dsh`，捕获 turn 报告
  （knowledgeDispatch 经 DSH 原生 subagent 分发为后续工作项）。

## 安装

```powershell
# 仓库内（本包是 private workspace 包，尚未发布到 npm）
npm run export:dsh-plugin     # 生成 dist/dsh-plugin/claw-kit-dsh-adapter-<v>.tgz
npm run install:dsh-plugin    # dsh plugin --profile web add <tarball>（可 --profile 指定）
# 重启 DSH Host 后生效；验证组合：dsh --profile web --dump-config
```

发布到 npm 后直接：`dsh plugin --profile web add @veewo/dsh-adapter`。

前置条件：`claw` CLI 已安装且版本与仓库对齐（`claw --version`），
CLI 需支持 `--host dsh`（见 claw-kit 仓库的 dsh host 支持）。

## 工具

`claw_run`：

- `operation`：点号形式（`plan.create`、`plan.start`、`task.done`、`plan.done`、
  `plan.show`、`search`、`context` 等）；
- `args`：操作字段（snake_case，与 Cindy 适配器的操作目录一致）；
- 会话身份与 workspace 由插件从 `exec.agent` 锻造，模型不得传 session/host/workdir；
- 返回紧凑 guidance + `goalSync`（已自动消费的 goal hostAction 列表）。

## Skills

安装即投递 7 个 skills（`ctx.skills` bundled provider，无需手动复制）：

- shared 同步：`planning`、`config`、`create-claw-skill`、`claw-kit-doc`
  （`npm run sync:shared-skills` 维护，勿手改——AUTO-GENERATED banner）；
- Host 特定（本包手写）：`using-claw-kit`（claw_run 单路线主入口）、
  `researcher`（recall → code index → exact source 调查顺序 + 可选 subagent 委派）、
  `update`（CLI + adapter 联合升级，见 `skills/update/SKILL.md`）。

更新安装时若 pnpm 报旧 tarball ENOENT，先 `dsh plugin --profile <name> remove @veewo/dsh-adapter`
再重新 `install:dsh-plugin`（版本号即更新信号）。

## 测试

```powershell
npm run build -w @veewo/dsh-adapter
npm test -w @veewo/dsh-adapter
```

覆盖：operation→daemon input 映射、hostActions 消费（含 fail-open）、
白名单 compact、ClawSession 协议（open/request/串行化/诊断忽略）。

## 已知限制

- `systemPrompt.context` 注入的是「最近一次 session-start 快照」：单会话 TUI 精确，
  并发 web 会话收敛到最后一个写入者；
- 进度投影（`update_plan` → sessionProjections/UI）为 P2，当前以紧凑 guidance 承载；
- knowledgeDispatch 的 DSH 原生 subagent 分发尚未实现（turn 报告已捕获）。
