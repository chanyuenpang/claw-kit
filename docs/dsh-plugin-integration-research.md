# DSH 插件机制研究与 claw-kit 集成方案

状态：调研基线，2026-XX-XX（证据均来自本机运行的 DSH 0.1.1-rc.2 与 claw-kit 0.2.21 源码）

本文回答两个问题：

1. DSH（DeepSeek Harness）的插件机制到底是什么样的；
2. 把 claw-kit 融入成 DSH 插件应当怎么做。

与 [platform-adapter-porting-guide.md](platform-adapter-porting-guide.md) 的关系：本文是
「DSH 宿主能力档案 + 移植映射」的落地稿，遵循该指南 §1.1「先建立 Host 能力档案」的流程，
§3 功能矩阵与 §9 发布前检查表直接适用。

## 一、DSH 插件机制

### 1.1 总览：一切能力都是 Cordis 插件行

DSH 构建在 Cordis（`@deepseek-ai/cordis` v4）之上。核心模型：

- **插件 = 一个 npm 包**，包的 main 入口默认导出（或 `exports.default`）一个 Cordis
  Plugin（loader 源码 `cordis-plugin-loader/lib/index.js:738`：`exports.default ?? exports`）。
  插件形如 `{ name?, inject?, apply(ctx, config) }`。
- **组合 = 声明式 YAML**。`cordis.yml` / `cordis.patch.yml` 描述插件行：
  `- id: <行id> / name: <npm包> / config: {...} / disabled / inject: [...]`。
- 行的激活由**服务可用性驱动**，不是行顺序（dsh-base 补丁头注释明确说明）。

### 1.2 两个平面

| 平面 | 位置 | 内容 | 生命周期 |
| --- | --- | --- | --- |
| **Host 组合** | profile 目录（如 `$DSH_HOME/profiles/web/cordis.yml` + bundle 补丁） | 注册表与跨会话共享：`tools`、`skills`、`agents`、`sessions`、`subagents`、`goals`、`jobs`、`sandbox`、`approval`、`llm` 路由、持久化 | 进程级，一个实例 |
| **Agent preset** | `$DSH_HOME/.agent-presets/<id>/agent.cordis.yml`（用户自建）；部署自带 `config/agent-presets/`（只读） | 一个会话向注册表贡献什么：工具行、persona、prompt 片段、compaction 策略 | 每会话挂载，随会话展开/回收 |

规则（`editing-cordis-compositions` 技能 + dsh-web-app 补丁注释）：

- 注册表本体必须在 Host 平面；preset 只贡献**消费注册表的工具行**。
- preset 里发布服务（`ctx.provide`）的行必须放进带 `isolate` realm 的 `cordis:group`，
  否则第二次挂载在同一 realm 冲突，挂载校验直接拒绝。
- 同一行既可能按 host 行为存在，也可能按 preset 行为存在——由哪一层写最后决定。

### 1.3 Profile 与 bundle 分层

- `dsh --profile web` 的 profile 根是空数组，树由补丁叠加组成
  （`profiles/web/cordis.yml` 注释 + `cordis.patch.yml`）：
  1. `@deepseek-ai/dsh-base`（核心 host 行：timer/llm/session/agent/jobs/sandbox/approval/
     tools/skill/goal/subagent/web/tool-* 等）；
  2. `@deepseek-ai/dsh-web-app`（web 表面：webserver/api-gateway/workspace/storage/UI 行）；
  3. 用户 `cordis.patch.yml`（按 id 覆盖任意行）。
- **bundle 声明**：包的 `package.json` 里
  `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`（见 `dsh-web-app/package.json:41-45`）。
- **安装**：`dsh plugin --profile <name> add <pkg>` 是 pnpm 转发器
  （`dsh/lib/plugin-*.js`）：装包 → 检查是否声明 `dsh.bundle` → 自动并入 profile 的
  `dsh.profile.bundles` → 重启 Host 生效。相对路径参数锚定到调用目录。

### 1.4 一个插件能注册什么（本机运行时实证）

主机 `Service.listService` 目录确认，插件在 `apply(ctx)` 里可：

- **模型工具**：`ctx.tools.register(defineTool({ name, description, parameters, execute, presentCall, output }))`
  —— 参数走 JSON Schema；`execute(args, exec)` 里 `exec` 携带**可信的调用身份**
  （`exec.agent`、session、turn），这正是 claw-kit「身份由 Host 注入」需要的通道。
- **Prompt 片段**：`ctx.systemPrompt.section({ name, order, text })`。
- **技能**：`ctx.skills.registerProvider(...)` / `ctx.skills.register(...)`（分层注册表，
  宿主全局层 + 每 preset 层合并）。
- **会话投影**：`ctx.sessionProjections.register(...)`（浏览器可读的投影单元）。
- **人类命令**：`ctx.commands.register(...)`（斜杠命令，如 `/claw`）。
- **事件监听**：`ctx.on('agent/session-start', ...)`、`ctx.on('agent/turn-stopping', ...)`、
  `ctx.on('agent/status', ...)`、`ctx.on('session/event', ...)`、
  `ctx.on('tools/result', ...)`（waterfall：`agent/pre-step`、`tools/post-execute` 等）。
- **服务提供**：`ctx.provide(name, value)`（跨会话共享必须 host 平面或 isolate realm）。
- **客户端 UI**：Slots（sidebar、settings、`conversation.chat.turnTail`、
  `tool.call.toolview`、`tool.view.cordis` 等）；Host↔Client 私有 RPC
  `harness.handle` / `host.call`。
- **进程能力**：`ctx.get('subprocess')` / `ctx.get('shell')` / `ctx.get('jobs')` ——
  静态包插件是**完整 Node 环境**，可 import 任意依赖、可 spawn 进程、可读环境变量。

动态 Cordis 插件（`cordis_define`/`cordis_run`）则是会话内临时插件：Host/Client 两个半区，
纯 JS，Builtin 只有 `ctx/harness/console/btoa/atob/TextEncoder/TextDecoder`
（`Builtin.listBuiltins` 实证）——**没有 process/fetch/require，不能直接 spawn CLI**。

### 1.5 对集成的关键结论

1. **静态包插件走生产，动态插件只走原型**。claw-kit 必须 spawn `claw` CLI / 常驻 worker，
   只有静态包插件（完整 Node 环境）能承载；动态插件连 `process` 都没有。
2. **工具身份可信**：DSH 在 `tools/execute` 的 `exec` 与事件 payload 里给插件可信的
   agent/session 身份，无需模型自报——对应 Cindy 的 `session_context` 注入。
3. **事件映射有现成锚点**：`agent/session-start`（含 `source`，区分 startup/resume 等）、
   `agent/turn-stopping`（回合即将关闭）、`agent/status`（idle ⇄ running）。
4. **skill 投递有现成通道**：`ctx.skills` 分层注册表，或 preset 的
   `skill-filesystem` 行配置 `customSkillDirs`（另外默认扫项目 `.dsh/skills` 与用户
   `~/.agents/skills`）。
5. **UI 投影可降级**：DSH 没有 Cindy 式卡片 API，但有 Slots 与 sessionProjections；
   P2 降级为纯 Guidance 即可。

## 二、claw-kit 现状与适配器模式

### 2.1 架构分层（移植指南 §2）

```text
Canonical Core（.claw 状态、plan/task/subplan、context、config、search、memory、
               knowledge jobs、maintenance、retention、structured errors）
  -> CLI 协议（claw 命令、--host 选择、session daemon、JSON-RPC over stdio）
  -> Shared 资产（workflowGuidance 配置、plan templates、shared Skills、writer prompts）
  -> Host adapter（manifest、生命周期映射、身份注入、typed tools、投影、transcript bridge）
  -> Distribution（安装、enablement、版本对齐、更新与 smoke）
```

- 包：`@veewo/claw-core`、`@veewo/claw-client`、`@veewo/claw`（CLI）、
  `@claw-kit/codex-adapter`、`@claw-kit/opencode-adapter`、`@claw-kit/openclaw-adapter`、
  `cindy-adapter`（工作区包，未发布）。
- CLI 支持的宿主：`SUPPORTED_CLAW_HOSTS = ["codex", "opencode", "cindy"]`
  （`packages/cli/src/invocation-host.ts:3`）。`claw session open <workdir> <sessionId> --host <host>`
  建立持久 JSON-RPC 会话，daemon 保留 workdir 与当前 plan 焦点。

### 2.2 两种已投产的适配器模式

**Cindy（Ghost 插件，与 DSH 结构最接近）** —— `packages/cindy-adapter/plugin/`：

- `ghost.json`：manifest，声明两个薄工具 `list_tools` / `call_tool` + 打包 skills +
  常驻 node worker（`node/claw-worker.cjs`，JSON-RPC stdio，生命周期 resident）。
- `main.js`（agent 侧）：订阅 Cindy 事件（session-created/switched、turn-end），
  维护 workdir 映射与 plan 投影，工具调用转发给 worker，渲染工作流卡片，
  驱动 goal 续跑（`agent.run`）。
- `claw-worker.cjs`（worker 侧）：`NativeClawSession` spawn `claw session open --host cindy`，
  持有操作目录（plan.*、task.*、search、context、knowledge.*），执行 `claw/execute`，
  通过 `--host cindy` 区分宿主语义。
- 关键设计：**工具面最小化**（list_tools/call_tool 两个工具承载整个操作目录，
  目录变化不需要 Host 重新审批）；**身份 Host 注入**（`args.session_context` 由 Host
  锻造：session_id、workdir、workdir_is_local、workdir_is_read_only）；**canonical 状态
  只有 .claw**（卡片/Goal 都是投影）。

**Codex（插件）** —— `packages/codex-adapter/`：

- `plugin.json`：manifest + 三条 `defaultPrompt`（路由代码：恢复的 workflow 先消费
  Guidance；无 scope 按是否产生可复用知识决定 plan/direct；mutation 走固定 driver）。
- `hooks.json`：`SessionStart`（startup|resume|clear|compact）→ `claw hook auto-claw --host codex`；
  `Stop` → knowledge-finalizer（capture → 持久化 job → 异步 writer）。
- `codex-driver.ts`：固定 mutation Driver（版本化、schema、cache key），原子消费
  `update_plan`/`create_goal`/`update_goal`，防止重复消费与部分成功。

### 2.3 移植方法（指南 §1、§6）

- 先建 Host 能力档案（官方文档 + 运行时探针），**先映射能力再映射事件**；
- 全新会话不恢复计划，只有 session key 绑定非终态计划时才恢复；
- auto-claw 不只是 plan recovery（还承载版本/安装/配置/搜索能力诊断）；
- 必需 mutation fail-closed，增强项 fail-open；不自动修复用户环境；
- 功能分级：P0 canonical correctness 必须完整；P1 workflow continuity 必须有等价路径；
  P2 native projection 可降级但记录 UX 差异；P3 优化可后置。

## 三、集成方案：claw-kit → DSH 插件

### 3.0 先回答：DSH 有没有 Code Mode？有。

`dsh-tools` 的 Code Mode 是完整实现（`dsh-tools/lib/index.js` 的 code-mode 区域）：

- **`run_code` 保留工具**：模型传 `code`（async 函数体，TypeScript type-stripped 或
  Python）+ `description`，在 worker-thread（`dsh-code-runtime-worker-thread`）里执行；
- **SDK 嵌套调度**：程序体内 `await tools.name(args)` 可调用当前 agent 可见的任意工具
  （除 `run_code` 自身），失败抛 `ToolCallError` 可捕获，只有 return/console.log 进入对话
  （`dsh-tools/lib/types/ts-types.js` 的 `renderToolsSdk`）；
- **呈现模式**：`tools.presentAs(mode)`（native/code/both，per-scope）与进程级
  `DSH_TOOLS_MODE` 环境开关（web-app 补丁的 tools 行）。

所以 Codex 式「固定 code-mode driver 信封」在 DSH 上**技术完全可行**：模型取信封 →
`eval` 或直接内联进 `run_code` → driver 用 SDK 调 `tools.pwsh`（执行 `claw ...`）与
`tools.update_goal`/`get_goal`（Goal 投影）→ 只返回紧凑字段。但经过下面 3.2 的对比，
**更好的方案是把 driver 下沉为插件原生工具**，而不是让模型在 `run_code` 里维护信封。

### 3.1 选型决策

| 维度 | 选项 | 结论 |
| --- | --- | --- |
| 插件形态 | 动态插件 / 静态包 | **静态包**（完整 Node 环境、可 spawn CLI、可 npm 发布、跨会话稳定）；动态插件仅原型 |
| 部署平面 | host bundle / agent preset / 两者 | **两者**：bundle 提供 host 侧（worker 生命周期、事件钩子、可选服务）；preset 行提供 per-session 工具面（与 dsh-tool-goal 等生态一致：注册表 host、工具 per-session） |
| 工具表面 | Cindy 两工具 / Codex 信封 / **单原生工具** | **`claw_run` 单工具**（见 3.2 对比） |
| 执行通道 | spawn CLI（daemon worker） | 复用 `claw session open --host dsh` 与 daemon 的 hostActions 输出 |
| mutation 原子性 | 固定 driver 语义 | `claw_run` execute 内部 = driver：一个入口消费 hostActions，模型不拆分执行 |
| 投影 / Goal 自动化 | 插件内自动 | execute 消费 CLI 已生成的 `hostActions`：`update_plan` → 投影；`create_goal`/`update_goal` → `ctx.goals` 同步（模型无感） |
| 生命周期映射 | DSH 事件 ↔ 钩子 | `agent/session-start` ↔ SessionStart；`agent/turn-stopping`/`tools/result` ↔ Stop 捕获 |
| UI 投影 | Slots / 纯 Guidance | 先纯 Guidance + 可选 turnTail 卡片（P2 降级可接受） |

### 3.2 三条路径对比：为什么选「单原生工具」，而不是信封

| 维度 | A：Cindy 式 `list_tools`+`call_tool` | B：Codex 式 `run_code` 信封 | **C：单原生工具 `claw_run`（推荐）** |
| --- | --- | --- | --- |
| 模型工具面 | 2 个工具 + 操作目录 | 1 个（run_code）+ 信封仪式 | **1 个（claw_run）** |
| 模型负担 | 理解目录、构造操作参数 | 取信封 → eval → 每次内联 ~15KB driver 源码（DSH 无 load/store 缓存） | **零仪式：按 guidance 的 commandHints 传参** |
| mutation 原子性 | 中（模型逐操作调） | 强（driver 单入口） | **强（execute 内部单入口）** |
| 投影/goal 自动化 | 插件 execute 内自动 | driver 内自动（SDK 调工具） | **execute 内自动（服务级 ctx.goals，比工具级更直接）** |
| token 开销 | 低 | **高**（信封代码反复内联） | **低** |
| 可靠性 | 中 | 依赖模型正确执行信封 | **高（插件代码，可测试）** |
| 审批/卡片 | 清晰 | 一般 | **清晰（presentCall 卡片）** |
| 与 Codex 对称性 | 低 | 高 | 中（**复用同一份 hostActions 协议**，语义对称） |

B 的唯一独特价值是「连 claw_run 工具都不注册，工具面只有 run_code」；代价是模型可靠性与
token。C 用**一个工具**换掉这些代价，同时保留 Codex 方案的精华：

- **hostActions 是 CLI 统一生成的（host 无关）**：`command-service.ts` / `session-daemon.ts`
  在每条 mutation 路径上都附带 `hostActions` 字段（`codexActionsFromMutation`），
  schema 有版本（`hostActionSchemaVersion: 1`）——DSH 插件**直接消费这份产物**，
  不需要信封，也不需要模型参与；
- **compact 结果白名单**：直接复用 `codex-driver.ts` 的 `visibleKeys`
  （stage/planSummary/nextsteps/notes/nextTask/commandHints/askUser/plan/...），
  `claw_run` 只把白名单字段返回给模型——这就是「减少 agent 信息」的落点；
- **Goal recovery 语义**：`codex-driver.ts` 的 get_goal 检查（已有 active Goal 不重建、
  update_goal 只在 active 时消费）原样移植到 execute 内，只是把 `tools.get_goal` 换成
  服务级 `ctx.goals.get(agent)`。

**结论**：DSH 的 code mode 是加分项而不是必选——`claw_run` 原生工具本身就是
「固定 driver」的最佳载体（插件 execute = 完整 Node 环境）。code mode 只在需要
「整个会话收窄到 run_code」时启用（可选预设增强），默认保持 native + claw_run。

### 3.3 推荐架构（最薄竖切）

新增工作区包 `packages/dsh-adapter`（发布名 `@claw-kit/dsh-adapter`）：

```text
@claw-kit/dsh-adapter
├── package.json            # main = lib/index.js（Cordis 插件）；dsh.bundle.patch = cordis.patch.yml
├── cordis.patch.yml        # bundle 补丁：host 行（worker/事件钩子/可选服务）
├── lib/index.js            # Host 插件：apply(ctx, config)
├── lib/claw-session.js     # 常驻 worker：spawn `claw session open <workdir> <sessionId> --host dsh`
├── lib/claw-run.js         # claw_run 工具 execute：driver 语义（执行→消费 hostActions→compact 返回）
├── lib/host-actions.js     # hostActions 消费器：update_plan→投影；create_goal/update_goal→ctx.goals
├── lib/session-start.js    # agent/session-start 钩子：auto-claw 等价恢复，注入 workflowGuidance
├── lib/turn-report.js      # agent/turn-stopping 钩子：turn 报告捕获 → knowledge job
├── skills/                 # shared skills 的 dsh 版本（using-claw-kit/planning/researcher/config/...）
└── preset/agent.cordis.yml # 可选：agent-presets/claw 预设（standard 副本 + 工具行）
```

**Host 插件（lib/index.js）的职责**：

1. 持有 per-session worker 管理器（`claw session open --host dsh` 的 JSON-RPC 子进程，
   移植 `NativeClawSession`）；
2. 注册**一个模型工具** `claw_run`：
   - 参数最小化：`operation` + `args`（与 guidance 的 `commandHints` 一一对应），
     **session/workspace 身份由插件从 `exec.agent`/session/cwd 锻造**，绝不信任模型参数
     （对应 `workdir_is_local`/`workdir_is_read_only`，DSH 侧用 `sandboxPolicy` 判定）；
   - execute 内部（= 固定 driver）：经 worker 执行 mutation → 拿到 `hostActions` →
     `host-actions.js` 自动消费（`ctx.goals` 同步 + 投影）→ 按 `visibleKeys` 白名单
     返回 compact 结果（stage/currentTask/nextSteps/commandHints/askUser）；
3. 事件钩子：
   - `agent/session-start`（source 区分 startup/resume/compact）→ 恢复绑定计划，
     把 `workflowGuidance` 注入 `systemPrompt.context`（或 agent-instructions）；
   - `agent/turn-stopping` → 捕获 turn 报告；存在 knowledge job 时用 DSH 原生
     `subagents`（`subagent`/`subagent_fork`）执行 writer —— **比 Cindy 顺，无需 Orca**；
4. `ctx.systemPrompt.section({ name: 'claw-kit', ... })`：using-claw-kit 等价的路由指引；
5. `ctx.skills.registerProvider(...)`：把 `skills/` 目录注册进分层注册表。

**Progress 投影与 Goal mode 的 DSH 映射（全部插件内自动，模型无感）**：

| CLI 生成的 hostAction | DSH 消费端 |
| --- | --- |
| `update_plan`（todo 投影） | `ctx.sessionProjections.register(...)` 注册 `clawPlan` 投影单元（P2）；最小可用：白名单里带 `plan` 字段供 UI/后续渲染 |
| `create_goal` / `update_goal` | `ctx.goals.create(agent, {objective})` / `ctx.goals.complete(agent, ref)` —— DSH 原生 goal 服务（dsh-tool-goal 同款调用），原生 goal bar 呈现、模型可经 `get_goal` 读取 |

**预设（preset/agent.cordis.yml）**：复制 `standard`，把 `claw_run` 工具行放进预设
（消费 host 侧注册表；若插件发布服务则整组加 `isolate` realm）。可选极简预设把
`tools` 呈现设为 code 模式（`presentAs('code')` 或 `DSH_TOOLS_MODE`），将工具面收窄到
`run_code`——**默认不启用**，避免剥夺用户普通工具。

**claw-kit 侧配套改动**：

1. `packages/cli/src/invocation-host.ts` 的 `SUPPORTED_CLAW_HOSTS` 增加 `"dsh"`，
   并按需实现 dsh 的 host 分支（context 输出、session open 语义）；
2. 新增 export/install 脚本（仿 `export:codex-plugin`/`install:codex-plugin`）：
   `export:dsh-plugin` / `install:dsh-plugin`；
3. 发布：`@claw-kit/dsh-adapter` 上 npm（或 git 直装），用户执行
   `dsh plugin --profile web add @claw-kit/dsh-adapter` 后重启。

### 3.4 与 DSH 原生能力的映射清单

| claw-kit 功能域 | DSH 等价物 | 等级 |
| --- | --- | --- |
| 项目发现 / 计划 / task / subplan / Guidance | CLI + worker（canonical .claw） | P0（不变） |
| SessionStart 恢复 | `agent/session-start` 事件 + sessionPersistence 日志 | P1 |
| Stop 捕获 / turn report | `agent/turn-stopping` + session 日志 | P1 |
| typed mutation | `claw_call_tool`（worker 内原子执行，等价固定 driver） | P1 |
| Goal Mode（投影） | DSH 原生 `goals` 服务 / goal 工具（可选双写，canonical 仍是 .claw） | P2 |
| Ask User | `userQuestions` 服务 / `ask_user_question` 工具 | P2 |
| Todo / Card 投影 | sessionProjections + Slots（turnTail / tool.call.toolview） | P2 可降级 |
| 原生 subagent（writer） | `subagents` 注册表 + `subagent`/`subagent_fork` 工具 | P1（直接可用） |
| Skills | `ctx.skills` 分层注册表 / skill-filesystem customSkillDirs | P1 |
| 斜杠命令入口 | `ctx.commands.register`（如 `/claw`） | P3 |
| 后台维护 / 预热 | `jobs` 注册表 + `timer` 服务 | P3（fail-open） |

### 3.5 验收要点（裁剪自移植指南 §8.3）

1. fresh 会话不恢复；有绑定才恢复；compact 后恢复；
2. CLI 缺失/旧版本 → 结构化降级与诊断，不假装成功；
3. plan mutation 原子性与幂等（worker 崩溃、非 JSON、partial failure）；
4. knowledge closeout：DSH 原生 subagent 完成 writer，job 可恢复；
5. Windows：`claw.cmd` 经 `ComSpec`/`cmd.exe` 启动（worker 已有该模式）；
6. 工具面稳定（DSH 重视 request-cache 稳定，工具面尽量不随目录变化）。

### 3.6 风险与注意

- **权限边界**：claw 写 `.claw` 属于沙箱 workspace-write 内；host 平面插件拥有 spawn
  能力，与 `tool-bash` 同信任级；
- **工具审批**：新工具行进入 preset 后，会话工具面变化影响 request 缓存 —— 因此
  工具面保持「两个固定工具 + 动态目录」，不按操作逐个注册；
- **版本对齐**：adapter 与 CLI 版本一致性验证并入 release 流程（沿用现有
  update/version-sync 合同）；
- **动态插件不用于生产**：受限 builtins、进程级生命周期，只用于交互式原型验证。

## 四、原型验证记录（2026-08-21）

载体：会话内动态 Cordis 插件（`claw-1`，host 半区），工具 `claw_run`。逻辑 = 方案 C 的
最小实现：`ctx.get('subprocess').spawn(...)` 调用真实 claw CLI（Windows 用
`cmd.exe /d /s /c claw.cmd` 包装 + POSIX fallback），`CLAW_SESSION_ID=agent.id` 环境变量
绑定会话，解析 CLI JSON 协议（与 codex-driver 同款扫描），白名单 compact 返回，
hostActions 消费器（`create_goal`/`update_goal` → `ctx.goals`，fail-open）。

端到端结果（全部真实执行）：

| 步骤 | 结果 |
| --- | --- |
| 插件定义/运行 | ✅ `cordis_define` + `cordis_run` 成功，`claw_run` 进入工具列表 |
| spawn claw CLI | ✅ 经 subprocess 服务（首版 ENOENT——Node 不能直接 exec `.cmd`，`cmd.exe /d /s /c` 包装后解决，与 Cindy worker 同模式） |
| 会话绑定 | ✅ `CLAW_SESSION_ID=agent.id` → 计划落在 `~/.claw/runtime/sessions/<hash>/tasks/...`，绑定当前 DSH 会话 |
| plan.create | ✅ 返回 planSummary/nextsteps/notes/commandHints/plan（紧凑白名单，无冗余） |
| plan.start | ✅ nextTask 出现、guidance 更新（Sync update_plan / Restore Goal Mode） |
| task.done / plan.show | ✅ 多操作链路正常 |

关键发现（正式化工作项）：

1. **无 `--host` 时 CLI 不生成 `hostActions`**（`cli.ts:3340` 的
   `codexResult ? buildCodexHostActions : []`）→ goal/投影同步未触发。正式版必须：
   claw-kit 的 `SUPPORTED_CLAW_HOSTS` 增加 `"dsh"` 并实现 dsh host 分支（或走 daemon
   路径——`session-daemon.ts:276` 的 `claw/session-start`、`claw/execute` 统一带 hostActions）；
2. **动态插件无 `process`**：平台分支用「cmd.exe 优先 + ENOENT fallback」双尝试；静态包
   里用 `process.platform` 更干净；
3. **session-start 注入 guidance 未做**：原型只覆盖工具层，`agent/session-start` →
   恢复 + 注入 workflowGuidance 是下一步。

验证了方案 C 的核心判断：**DSH 插件工具 execute 就是固定 driver 的最佳载体**——无需
run_code 信封、无需模型 eval，spawn + 解析 + 白名单在一个工具里闭环。

## 五、正式化进度（2026-08-21 续）

claw-kit 侧（`dsh` host 支持）：

- `packages/cli/src/invocation-host.ts`：`SUPPORTED_CLAW_HOSTS` 增加 `"dsh"`，
  导出 `isHostActionsHost`（codex|dsh）与 `isSubagentPolicyHost`（codex|cindy|dsh）；
- `packages/cli/src/command-service.ts`：daemon 路径的 hostActions 门控
  `context.host !== "codex"` → `!isHostActionsHost(...)`（hash fallback 保证
  actionIdPrefix）；
- `packages/cli/src/cli.ts`：`compactPlanCommandResult` 的 `codexResult` →
  `hostActionsResult`（codex|dsh 共享同一 compact 协议与 hostActions 产物）；
  knowledgeWriter `subagent` policy 与 `knowledgeDispatch` 构建对 dsh 开放；
- `packages/core/src/knowledge-sidecar.ts`：`KnowledgeFinalizationHost` 增加 `"dsh"`。

实测（daemon 探针，`claw session open --host dsh` + `claw/execute`）：

- `--host dsh` 被 CLI 接受，compact 输出语义与 codex 一致（`stage` 字段）；
- `plan.start`（≥3 任务）生成标准 hostActions：
  `update_plan`（mutationId 前缀）+ `create_goal`（goal mode 恢复场景）；
- 主 CLI 路径的 hostActions 行为与 codex 完全一致（无回归）；
- `shouldUsePlanHostIntegration` 对 ≤2 任务 default 计划不投影——设计行为。

新增包 `packages/dsh-adapter`（`@claw-kit/dsh-adapter`，private）：

- `cordis.patch.yml`：bundle 声明（`dsh.bundle.patch`），一行 `claw-adapter`；
- `src/index.ts`：Cordis 插件（`claw_run` 工具 + `agent/session-start` 注入 +
  `systemPrompt` section/context，均 fail-open）；后续演进：turn 报告改为终态
  plan mutation 内确定性写入 dsh-capture，无 turn-stopping 钩子（见 §5.5）；
- `src/claw-session.ts`：常驻 daemon 客户端（`claw session open --host dsh`，
  JSON-RPC over stdio，串行链，Windows `.cmd` 包装）；
- `src/host-actions.ts`：hostActions 消费器（`create_goal`/`update_goal` →
  `ctx.goals`，`update_plan` 投影透出，fail-open）+ 白名单 compact；
- `src/protocol.ts`：operation→daemon input 映射 + session-start guidance 渲染
  （纯函数，可单测）；
- `src/skills.ts`：bundled skill provider（`ctx.skills` 注册，安装即投递）；
- `skills/`：shared 同步（planning/config/create-claw-skill/claw-kit-doc，
  `sync-shared-skills.mjs` 已把 dsh-adapter 纳入同步目标）+ Host 特定手写
  （`using-claw-kit`：claw_run 单路线主入口；`researcher`：recall → code index →
  exact source + 可选 subagent 委派；`claw-kit-doc`：DSH 更新/配置/知识格式入口）；
- `test/`：29 个 node:test 用例全绿（protocol 12 / hostActions 8 / ClawSession 4 /
  skills 5）。

profile 安装已更新至 `@claw-kit/dsh-adapter@0.2.21.4`（bundle 行 + 6 skills +
provider 均已就位，`--dump-config` 确认组合树含 `claw-adapter` 行）。

### 5.1 真实 Host 端到端验证（三次重启后完成）

生产化过程中修掉的三个真实问题（均带证据）：

1. **静态 bundle 插件必须声明 `inject`**：无依赖的行在 Cordis 服务驱动激活下会
   立即 apply——此时 `subprocess/tools/systemPrompt` 未挂载，`ctx.get` 全 undefined，
   guard 静默 return，什么都不注册（bundled skills 也未生效，skill 工具加载到的
   仍是用户根 Cindy 版）。加 `inject: ["subprocess","tools","systemPrompt","skills","goals"]`
   后 loader 等待服务就绪再 apply，`claw_run` 与 bundled skills 才出现。
2. **subprocess 服务 pipe 流的读取**：`readline.createInterface` 在 subprocess 服务
   返回的 pipe stdout 上未触发 line（动态探针证明 data 事件可靠、collect 模式可靠、
   手动 node spawn 可靠，唯一差异是 readline）。`ClawSession` 改用 data 事件 + 行缓冲。
3. **全局 claw 需含 `--host dsh`**：adapter spawn 的是 PATH 上的全局 claw，发布版
   0.2.24 不支持 dsh（工作区改动未发布）。`npm link -w @veewo/claw` 把工作区 CLI
   链接为全局后恢复。

重启后的完整链路（`[claw workflow]` 快照由 session-start 钩子注入并恢复绑定计划）：

- `claw_run plan.create` ✅ 紧凑 guidance + 会话绑定
- `claw_run plan.start` ✅ `goalSync: ["...:create_goal"]`（hostActions 消费 →
  DSH 原生 goal）+ `projection`（update_plan 进度数据）
- `get_goal` ✅ 读到 claw 自动创建的 DSH goal（objective 为 claw 生成的
  "Follow the claw workflow guidance..."，phase active）——**goal mode 自动处理，
  模型无感**
- `claw_run task.done` ✅ 任务推进 + projection 更新

已知边界（enhancement）：跨 daemon 恢复**仅对 daemon 创建的会话**自动生效（open 时
`opened.record.currentPlan`）。原型用一次性命令创建的计划（绕过了 daemon registry）
在重启后的新 daemon 连接里无 focus——session-start 快照仍恢复（文件层 binding），
但 claw_run 的 plan.show 报 CURRENT_PLAN_REQUIRED。真实使用（claw_run 创建）的计划
重启后由 daemon open 自动恢复。后续可对齐 0.2.24 的 `session-start` daemon 操作
（工作区 0.2.21 落后于发布版 0.2.24，Cindy worker 已依赖该操作）。

### 5.2 自动派发端到端验证（0.2.21.11，重启后）

`plan.done`（project 作用域 + retrospective）真实返回并自动派发：

```json
{
  "planStatus": "end.completed",
  "goalSync": ["<id>:update_goal"],
  "knowledgeDispatch": { "schemaVersion": 1, "policy": "subagent", "finalizeId": "ba361e9b...", "preferReuse": true, "prompt": "..." },
  "dispatch": { "ok": true, "runId": "ea035b70-...", "policy": "subagent" }
}
```

- **adapter 自动派发**：`claw_run` execute 内 `subagents.start("spawn", { prompt: dispatch.prompt, parent: exec.agent })`——writer one-shot subagent 后台启动，模型无感；
- **goal 自动关闭**：`get_goal` → `phase: complete, revision 2, disarmed`；
- **writer 执行中**：job `queued` → delegate 计划 `knowledge-finalizer-<finalizeId>` 已创建（之后 claim → 知识治理 → truth 沉淀，与 5.1 的 writer 流程一致）。

DSH 上 `subagent` 与 `background` 两种 knowledgeWriter policy 统一为「插件派送一个
one-shot subagent」一套流程（KnowledgeDelegateDispatch 两种 policy 都带自包含 prompt）。

修复链（workdir/解析，全部有探针证据）：

- `agent.session` 公共 API 不暴露 cwd；`sandboxPolicy.workspaceRoot` = 宿主启动目录
  （System32）——唯一权威来源是 **workspaceRegistry**（每个 workspace 的 `sessionIds`
  归属 + `path`）；且 workspaceRegistry 比 subprocess/tools 晚挂载，须**执行时惰性获取**；
- **session binding 干扰**：`resolveWorkflowProjectContext`（claw-kit 设计）在 session
  有 workflow 绑定（原型 session 计划遗留）时优先 session 上下文，project 计划解析
  失败——`claw session clean` 清理遗留绑定后恢复 project scope；
- **连接失效重建**：daemon 进程被杀后缓存 ClawSession 引用死进程导致挂起——execute
  层捕获连接类错误（SESSION_CONNECTION_LOST/CLAW_SESSION_TIMEOUT/OPEN_TIMEOUT）
  → 重建会话重试一次。

测试域：dsh-adapter 自带测试（TDD，`npm test -w @claw-kit/dsh-adapter`）。
claw-kit 既有测试域（codex/cindy/opencode）语义未改，不纳入本批验证。

待办：

- ~~`export:dsh-plugin` / `install:dsh-plugin` 脚本~~（已完成：`npm run export:dsh-plugin`
  产出 `dist/dsh-plugin/claw-kit-dsh-adapter-<v>.tgz`，`install:dsh-plugin` 经
  `dsh plugin --profile web add <tarball>` 装入 profile，bundle 自动并入
  `dsh.profile.bundles`；`--dump-config` 确认 `claw-adapter` 行进入组合树）；
- 真实 DSH Host 集成验收：重启后 fresh/resume/compact/closeout（组合已验证，
  激活需重启 Host）；
- 进度投影（`update_plan` → sessionProjections/UI，P2）；
- knowledgeDispatch 经 DSH 原生 `subagent` 分发。

### 5.3 knowledge job host 根因修复 + daemon E2E 矩阵（0.2.21.16，2026-08-22）

**根因**：`claw knowledge claim` 报 "Claim-time report capture is unavailable for host
unknown"。上下文诊断确认 `context.host = "dsh"`、`inputHost = "dsh"`、job 存在，但
knowledge job 的 `host` 字段仍为 null——因为 job 在 **core plan.ts 的 editPlan** 里创建
（`tryEndKnowledgePlan` / `tryRegisterKnowledgePlan`），其 host 白名单只含
codex/opencode/cindy，缺 "dsh"（command-service 的 finalizeEnteredEnds 后到，不重写
job）。补两处白名单后新 job `host='dsh'`（探针证据）。

**daemon 通道 E2E 矩阵**（`scripts/probe-dsh-daemon-e2e.mjs`，13/13 通过，绕过 Host
内失效连接直接驱动 `claw session open --host dsh` JSONL 协议）：

1. `session.open (host=dsh)` ✅
2. `plan.create` ✅ 紧凑 guidance
3. `plan.start` ✅ 2 任务 append
4. `task.done` ✅ plan_changed + plan_task_completed
5. `plan.done` → `knowledgeDispatch {schemaVersion:1, policy:"subagent", finalizeId}` ✅
6. **knowledge job `host='dsh'`** ✅（根因修复验证）
7. job `reportCapture.mode='claim'` + `startedAt` 已写 ✅
8. 模拟 adapter capture 文件（含窗口前/内/后三结论）✅
9. **claim dsh 分支** ✅（claimToken 签发、job → running）
10. **claim startedAt 窗口过滤** ✅（2 条窗口内结论入 report，OLD 被排除）
11. `knowledge done --status succeeded` ✅
12. `search` 召回 ✅（10 条命中）

**claim dsh 分支**：`packages/cli/src/cli.ts` 读 `readDshKnowledgeCapture(sessionId)`，
以 job 的 `reportCapture.startedAt`（registry activeStartedAt）为窗口起点过滤
`taskConclusions[].time >= startedAtMs`——只提取上一个 plan 窗口内的 task.done 结论
（跨 turn 捕获在 adapter 的 plan.done execute 内确定性写入 dsh-capture 文件，无
turn-stopping 依赖）。null-host fallback 保留（历史 job / CLI 主路径防御）。

### 5.4 子 agent workdir 解析修复（0.2.21.17，2026-08-22）

**症状**：subagent 调用 claw_run 报 `no workspace owns this session and
agent.session.cwd resolved to none`；主 agent 同时报 connection-interrupted（旧
adapter 无重试）。

**根因**：`resolveWorkdir` 只查 `agent.session.cwd` / `meta.cwd` + workspaceRegistry
sessionIds 精确匹配。Agent 公共 API 的 `session` 是 dsh-session 的 `Session`，权威
cwd 在 **`session.header.cwd`**——子 agent 创建时 `childSessionMeta` 从
`parentHeader.cwd` 复制（dsh-subagent/lib/types/child-agent.js:84）。子 agent id 不在
workspaceRegistry.sessionIds，导致无 workdir。

**修复**：候选顺序改为 `header.cwd` → `session.cwd` → `meta.cwd` → registry 匹配。

**主 agent 连接中断**：connection-interrupted 业务错误重建重试（0.2.21.16 引入）需
Host 重启加载新 adapter 后生效。重启后验证：主 agent claw_run 恢复（返回业务错误而非
连接中断）；子 agent 调 claw_run 成功（`ok: true`，无 workspace 错误）✅。

**search 召回可见性**（0.2.21.18）：`compactClawOutput` 白名单原不含 search 结果字段
（`results[].{sourcePath,kind,snippet,score}` / `count`），模型只能看到 `{ok,command}`
——知识召回闭环断裂。白名单补 search 字段（按 hit 精简 surface，内部字段如
storePath 之外仍隐藏），新增单测锁定，36/36 用例通过。

### 5.5 真实 Host 完整闭环验收（0.2.21.18，重启后）

0.2.21.18 装 profile 并重启 Host（PID 晚于安装时间戳）后，用主 agent 的 claw_run 走
完整闭环，全部通过：

1. `claw_run search` → **真实知识召回列表**（truth_doc/adr 命中，sourcePath/kind/
   snippet/score 全可见）✅
2. `plan.create`（discussing，含完整 plan 文档）→ `plan.start`（active +
   `goalSync:[create_goal]` + projection 进度）→ `task.done`×3（plan_changed/
   plan_task_completed）✅
3. `plan.done` → `end.completed` + `goalSync:[update_goal]`（原生 goal 自动关闭）+
   `knowledgeDispatch {schemaVersion:1, policy:"subagent", finalizeId}` +
   **`dispatch {ok:true, runId}`（adapter 自动派发 writer subagent，模型无感）** ✅
4. **dsh-capture 文件**：`%LOCALAPPDATA%\claw\dsh-capture\<sessionId>.json` 已写
   （turnId=plan.done，13 条跨 turn task.done 结论，带事件 time）✅
5. **job `host='dsh'`** ✅（§5.3 根因修复在真实 Host 链路生效）
6. **claim dsh 分支**：claimToken 签发，job → running，reportCapture.status=captured，
   messageCount=3 ✅
7. **startedAt 窗口过滤**：13 条结论 → 窗口内 3 条（time ≥ plan 起点）→ report 2 条
   task_conclusion（窗口内去重后），OLD 结论全部排除 ✅
8. writer subagent 完成（list_agents 可见 `claw knowledge finalizer writer`）✅

**结论**：subagent/background 两种 knowledgeWriter policy 在 DSH 上统一为一条
adapter 自动派发链路（dispatch → writer one-shot subagent → claim dsh 分支 →
capture 窗口过滤 → knowledge done），模型全程无感，无需 turn-stopping hook。

### 5.6 三件套发布（0.2.25，2026-08-22）

用户授权发布 CLI + DSH + Codex，全部完成：

- **CLI 0.2.25**：本地 main 从 0.2.21 rebase 到 origin/main（0.2.24.2）之上，
  叠加 2 个 dsh 提交；bump root/core/cli/client 到 0.2.25、adapter 重置 .0、
  模板/shared skills 同步、CHANGELOG；`verify:release` 通过后发布
  `@veewo/claw-core` / `@veewo/claw-client` / `@veewo/claw`（含 dsh host 支持），
  tag `v0.2.25` + GitHub Release。
- **DSH adapter 首发**：`@claw-kit` npm scope 无权限 → 全局改名 `@veewo/dsh-adapter`。
  **npm 无 4 段正式版**：`0.2.25.0` 会被解析为 prerelease `0.2.2-5.0` 错误发布
  （PUT 200 但 GET 404；granular token 无法 unpublish）。publish 脚本改为映射
  npm 版本 `<cli-base>-rc.<n>`（`0.2.25-rc.0` / `0.2.25-rc.1`），git tag 保持
  4 段 `vdsh-0.2.25.0` / `vdsh-0.2.25.1`。发布流程文档已记录该坑。
- **plan.show --simple 空壳修复**（0.2.25-rc.1）：`compactClawOutput` 白名单缺
  `{status, goal, tasks}` 字段，模型看不到计划投影 → 补白名单 + 单测（37/37）。
  重启 Host 后 plan.show / search 恢复。
- **Codex 0.2.25.1**：CLI 重置后 bump 第四段（无功能改动），marketplace 快照
  验证通过，tag `vcodex-0.2.25.1` + GitHub Release。

发布后验证：npm metadata 全部可检索；profile 安装 `@veewo/dsh-adapter@0.2.25-rc.1`
后重启，claw_run plan.show 返回 release-claw-cli 计划（process.active + goal +
tasks），search 返回真实知识召回。

### 5.7 插件改名（2026-08-22 续）

用户授权把 DSH 插件 npm 包从 `@veewo/dsh-adapter` 改名为 `@veewo/dsh-claw-kit`
（GUI Settings → Plugins 的插件卡片名由 `moduleShortName(moduleName)` 派生：
`@veewo/dsh-adapter` → "adapter"，改名后 `@veewo/dsh-claw-kit` → "claw-kit"）。
同一提交把 cordis 行 id 从 `claw-adapter` 改为 `claw-kit`，导出名
`export const name` 同步为 `"claw-kit"`；安装/更新/发布脚本与技能文档全部跟随
新包名。历史记录（本节 5.6 及更早）保留原包名以如实记载当时发布内容。

## 六、证据索引

- DSH 组合：`$DSH_HOME/profiles/web/cordis.yml`、`cordis.patch.yml`；
  `@deepseek-ai/dsh-base/cordis.patch.yml`、`@deepseek-ai/dsh-web-app/cordis.patch.yml`
- preset：`@deepseek-ai/dsh/config/agent-presets/standard/agent.cordis.yml`
- 插件源码示例：`@deepseek-ai/dsh-tool-goal/lib/index.js`（tools/systemPrompt 注册）
- 插件安装：`dsh/lib/plugin-*.js`；bundle 声明：`dsh-web-app/package.json` 的 `dsh.bundle`
- loader 契约：`@deepseek-ai/cordis-plugin-loader/lib/index.js:738`
- 运行时能力：主机 `Service.listService` / `Event.listEvents` / `Builtin.listBuiltins`
- DSH Code Mode：`@deepseek-ai/dsh-tools/lib/index.js`（run_code 保留工具、tools/code-dispatch-log、
  `presentAs`、`DSH_TOOLS_MODE`）、`@deepseek-ai/dsh-tools/lib/types/ts-types.js`
  （run_code SDK：`tools.name(args)` 嵌套调度、ToolCallError）、
  `@deepseek-ai/dsh-code-runtime-worker-thread/lib/index.js`（worker-thread 隔离）
- claw-kit：`packages/cindy-adapter/plugin/{ghost.json,main.js,node/claw-worker.cjs}`；
  `packages/codex-adapter/{.codex-plugin/plugin.json,hooks/hooks.json}`；
  `packages/cli/src/invocation-host.ts`（SUPPORTED_CLAW_HOSTS）；
  `packages/cli/src/codex-driver.ts`（信封 runner、visibleKeys 白名单、goal recovery）；
  `packages/cli/src/command-service.ts` / `session-daemon.ts`（hostActions 统一生成，
  `codexActionsFromMutation`，schemaVersion=1）
- 官方方法论：`docs/platform-adapter-porting-guide.md`
