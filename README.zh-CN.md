[English](README.md) · [简体中文](README.zh-CN.md)

# claw-kit

开箱即用、小白也能上手的专业级 harness，给 coding agent 用。

<a href="docs/assets/claw-kit-demo-zh.mp4"><img src="docs/assets/claw-kit-demo-zh.gif" alt="claw-kit 演示：看一步装一步"></a>

[![npm version](https://img.shields.io/npm/v/@veewo/claw)](https://www.npmjs.com/package/@veewo/claw)
[![npm downloads](https://img.shields.io/npm/dm/@veewo/claw)](https://www.npmjs.com/package/@veewo/claw)
[![license](https://img.shields.io/npm/l/@veewo/claw)](./LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/chanyuenpang/claw-kit)](https://github.com/chanyuenpang/claw-kit/stargazers)

## 你会得到什么

### 项目记忆

计划和结论留在仓库里。agent 把工作流写到 `.claw/tasks/`，下次会话再把它找回来。收口把可复用的 Truth 笔记和 ADR 写进项目，需要时由 agent 自己去搜这些笔记。持久会话会一直沿用同一个工作目录和当前计划。

想看记录员实际记了什么？翻翻我们自己仓库的 [`.claw`](https://github.com/chanyuenpang/claw-kit/tree/main/.claw) 目录，claw-kit 本身就是用 claw-kit 开发的。这些笔记是写给下一次干活的 Agent 看的，不是给人看的，所以你不用读，也不用维护。

### 代码质量 skills

这些 skill 在写代码之前和旁边把改动框清楚：

- **planning** 把一句话需求整理成要求、范围、完成标准和可以勾掉的任务。
- **feature-architecture** 为高风险或跨系统的改动写一份短设计：谁拥有什么、不变量、一条失败路径，以及最小的一块实现。它只读源码。有活动任务时，它新增的唯一文件是那份设计报告。
- **researcher** 针对代码、行为，或已有的 Truth 与 ADR，回答一个有边界的问题，并给出证据。它不改仓库。

标准 skill 集，以及 DSH、Codex、OpenCode 适配器，都包含这三项。Cindy 公开插件包含 planning 和 researcher。

### 团队协作

`.claw/project.json` 是团队共享的工作流：规划开或关、默认计划模板、回忆设置。`.claw/project-override.json` 留给一个人的本地偏好。重复出现的工作可以放成 `.claw/templates` 里的模板。Truth 和 ADR 写进项目，下一个人可以直接读。提交它们仍走你平常的 git 流程。

仓库完成 `.claw` 初始化之后，这套 harness 才会加入该仓库。

## 支持的平台

| agent 跑在哪里 | 你用什么 | 状态 |
| --- | --- | --- |
| 任何能跑 shell 的平台 | `claw` CLI，加上标准 skills。`claw init` 会写入 `AGENTS.md` 引导块，所以不需要钩子。 | 通用路径，[欢迎反馈](https://github.com/chanyuenpang/claw-kit/issues/new?template=platform-adapter.yml) |
| Claude Code | `claw` CLI 加上标准 skills。没有专用适配器。安装、`claw init`，然后直接说。引导块要落在 Claude Code 真正会读的说明文件里：有 `CLAUDE.md` 时读它，没有时才读 `AGENTS.md`。 | 通用路径，[欢迎反馈](https://github.com/chanyuenpang/claw-kit/issues/new?template=platform-adapter.yml) |
| DeepSeek Harness (DSH) | 专用适配器。一个 `claw_run` 工具，进度和原生 goal 同步，知识收口由适配器分发。npm：`@veewo/dsh-claw-kit`。 | 稳定可用 |
| Codex | 专用适配器。Marketplace 插件，带 skills、钩子和同一套工作流。 | 稳定可用 |
| Cindy | 专用适配器。从 Cindy marketplace 安装 `claw-kit-cindy`。 | 稳定可用 |
| OpenCode | 专用适配器。插件、垫片、agents 和 skills。 | 已适配，测试中 |

DeepSeek Harness、Codex、Cindy 稳定可用，已有团队每天在用它写代码；OpenCode 已适配，还在测试；其他平台欢迎试用，遇到问题请[提 issue](https://github.com/chanyuenpang/claw-kit/issues/new?template=platform-adapter.yml) 或直接发 PR。

优先安装 DSH 或 Codex。两者各带九个 skill，包括知识沉淀和该宿主的更新 skill，并且都会在宿主里应用同一套进度和 goal 动作。Cindy 和 OpenCode 是技能面更小的专用适配器。OpenClaw 目前只带文档 skill，见 [包地图](#package-map)。

## 快速开始

安装，在项目里初始化一次，然后照常和 agent 说话。你不用自己跑工作流命令，不用设置会话 id，也不用粘贴启动提示。

### 1. 安装

`@veewo/claw` 需要 Node.js 22.13 或更高版本。

```bash
npm install -g @veewo/claw
```

如果 agent 跑在 DeepSeek Harness、Codex、Cindy 或 OpenCode 上，再装对应的适配器。适配器会带上 `using-claw-kit` skill。

- **DeepSeek Harness：** `dsh plugin --profile web add @veewo/dsh-claw-kit@latest`，然后重启 Host。[安装 DSH 适配器](#install-the-dsh-adapter)。
- **Codex：** 添加 marketplace 并安装 **Claw Kit**。[安装 Codex 插件](#install-the-codex-plugin)。
- **Cindy** 和 **OpenCode** 的安装在下面各自的章节里。

Claude Code 走同一条路：CLI、标准 skills，然后 `claw init`。没有 Claude Code 适配器。其他能跑 shell 的 agent 也一样。把 skills 复制到该 agent 扫描 skill 的文件夹。见 [packages/standard-adapter/README.md](packages/standard-adapter/README.md)。

### 2. 初始化项目

```bash
cd your-project
claw init
```

`claw init` 会创建 `.claw/`，并在 `AGENTS.md` 里写下引导块，夹在 `<!-- claw-kit:bootstrap:start -->` 和 `<!-- claw-kit:bootstrap:end -->` 之间。这段文字告诉 agent：开始项目工作或恢复上下文时，加载并遵循 `using-claw-kit`。这个 skill 自己选择宿主入口，恢复已有工作流，并决定要不要建计划。随口一问不会变成一份计划。Claude Code 在项目路径上已经有 `CLAUDE.md` 时会加载它并跳过 `AGENTS.md`，所以这些项目里同一段引导块也要写进 `CLAUDE.md`。

### 3. 直接说

用平常的话说就行，例如：「帮我计划怎么修登录 bug。」

### 它怎么自己启动

到这里就设置完了。宿主有启动钩子时，钩子自己跑，并把 agent 指向 `using-claw-kit`。没有钩子的地方，包括 Claude Code，由说明文件里的引导块来做这件事。

| 宿主 | 谁把流程拉起来 |
| --- | --- |
| Codex | 插件的 `SessionStart` 钩子做上下文恢复，并告诉 agent 加载 `using-claw-kit`。 |
| DeepSeek Harness (DSH) | `agent/session-start` 钩子做同样的上下文恢复并注入同一句说明。之后 agent 调用 `claw_run`。 |
| OpenCode | 插件处理 `session.created` 和 `session.compacted`（OpenCode 没有 `hooks.json`）。它恢复上下文，并为后续 claw 命令设置会话 id。 |
| Cindy | Ghost 的 session 与 turn 钩子会刷新会话状态，也可以续上一个活动计划。它们不注入首轮提示。agent 遵循已安装的 `using-claw-kit` skill，`AGENTS.md` 引导块也会点名这个 skill。 |
| Claude Code | 没有钩子，也没有专用适配器。安装 CLI 和 skills，运行 `claw init`，然后直接说。Claude Code 启动时加载 `CLAUDE.md`。只有项目路径上没有 `CLAUDE.md`、`.claude/CLAUDE.md` 或 `CLAUDE.local.md` 时，才会加载 `AGENTS.md`。 |
| 其他 agent | 没有钩子。启动路径就是 `AGENTS.md` 引导块。 |

<h2 id="under-the-hood">底层：agent 自己做什么</h2>

这不是安装步骤。安装并执行 `claw init` 之后，agent 遵循 `using-claw-kit`，自己去跑这些命令：

- **`claw context`** 恢复活动工作流，或说明当前没有绑定的工作流。Codex、DSH 和 OpenCode 还会在上面的启动钩子或插件事件里跑这一步。
- **会话 id。** Codex 的 `SessionStart` 钩子和 OpenCode 插件把宿主会话 id 写入 `CLAW_SESSION_ID`。DSH 和 Cindy 在适配器内部锻造会话身份。没有适配器的宿主上，由 skill 为这次对话设置一个稳定的 `CLAW_SESSION_ID`。
- **`claw search index --refresh`** 只在项目回忆需要向量索引时才跑。然后 **`claw search`** 去读 Truth 笔记和 ADR。
- **`claw plan create`** 只在 skill 判断这次工作需要一份计划时才跑。

`claw-kit` 是面向 agent 工作的项目级工作流与知识层。

它给 agent 一条能留下来的路径：先计划再执行，把可复用的项目知识留住，并在已初始化的 `.claw` 项目里干净收口，而不是把进度困在转瞬即逝的对话状态里。

## 产品页

GitHub Pages 产品介绍在 [docs/index.html](docs/index.html)，是一份中英双语、随滚动展开的 `claw-kit` 介绍。

## 它给项目带来什么

- 围绕 `.claw` 的项目级计划与任务生命周期；第一次创建计划时会自动补齐本地项目结构
- Truth 与 ADR 沉淀，让有用的知识跨会话留下来
- 面向回忆的项目文档搜索，先查已有材料，再做更广的调查
- 收口流程，让任务、笔记和决策保持对齐
- 规划面可以保持开启、关掉，或接到自定义 planning skill
- 适配器表面，让同一套工作流落到不同的 agent 宿主
- 持久、与宿主无关的 session daemon，以及有类型的 Node 客户端，在多次操作之间保留工作目录和当前计划焦点

## 团队为什么用它

- 项目级，而不是全局常开：仓库完成 `.claw` 初始化之后，`claw-kit` 才进入工作流。已加入的项目里它可以很顺，同时不会默认接管每一个仓库。
- 先计划再执行：`.claw` 计划结构给 agent 一条可以回来的工作流，复杂或更长的任务比只靠松散对话状态更稳。
- 设计上可调整：团队可以关掉规划、接入自己的规划方式，或把 `claw-kit` 嵌进另一个 harness，而不被绑在单一宿主或单一调查工具上。
- Truth 和 ADR 可以复用：工作流把 truth 和 ADR 维持为持久的项目知识，再通过项目回忆把这些上下文调出来。
- 适合团队的配置：`.claw/project.json` 放共享的规范工作流，`.claw/project-override.json` 留给个人运行时偏好。
- 任务需要更深的代码调查或关系追踪时，GitNexus 可以补强这套工作流；它是可选项，不是前提。

## 和其他工具怎么配合

- 在已初始化的项目里，`claw-kit` 负责项目工作流层：计划、回忆、truth/ADR 和收口。
- GitNexus 是可选搭档，用于更深的代码调查和关系追踪。
- 宿主适配器把同一套工作流带进 DeepSeek Harness (DSH)、Codex、Cindy 和 OpenCode。其他能跑 shell 的 agent 使用 CLI 加上标准 skills。工作流也可以嵌进另一个 harness。

## 工作流形状

在典型的一轮里，`claw-kit` 帮助 agent 走一条可重复的循环：

`plan` -> `search and recall` -> `execute` -> `close out` -> `finalize reusable knowledge`

这条循环就是产品本身：一套可复用的项目工作流，而不是一次性的聊天。

## 从哪里开始

- 想在项目里用 CLI？从下面的安装与设置开始，再读 CLI 包说明 [packages/cli/README.md](packages/cli/README.md)。
- 想了解集成表面？直接看包地图。
- 需要备用配置细节？按需使用适配器参考说明 [packages/codex-adapter/references/project-config-reference.md](packages/codex-adapter/references/project-config-reference.md) 或 [packages/opencode-adapter/references/project-config-reference.md](packages/opencode-adapter/references/project-config-reference.md)。

<h2 id="install-the-cli">安装 CLI</h2>

用 Node.js 22.13 或更高版本安装已发布的 CLI：

```powershell
npm install -g @veewo/claw
```

也可以用一次性安装脚本：

```powershell
.\scripts\install-cli.ps1
```

每个项目里运行一次 `claw init`。这是用户要跑的命令。下面的片段是 agent 通过 `using-claw-kit` 去跑的；见 [底层：agent 自己做什么](#under-the-hood)。不要自己运行 `claw context`、`claw search index --refresh`，也不要自己设置 `CLAW_SESSION_ID`。

agent 会用到的参考命令：

```powershell
claw init --max-tasks-to-keep 20 --planning true --external-planning-skill team-planning-skill --external-writer-skill external-knowledge-writer
claw plan create --title "My task" --goal "Define the first task"
claw plan create "My templated task" --template default --goal "Use the default template"
claw plan create "Auxiliary workflow" --no-knowledge-capture --goal "Run the full workflow without project deposition"
```

要开一个持久终端会话，把不可变的项目工作目录和宿主 agent 会话 id 一起打开：

```powershell
claw session open G:\Projects\my-project agent-session-id
```

之后输入的命令会复用该会话的工作目录和当前计划。`plan create`、`plan resume [planId]` 和 `plan leave` 会改变当前计划焦点；普通的 `plan` 和 `task` 命令不需要反复带上任务名或计划文件。用 `search --dir <other-dir> <query>` 做一次跨目录查找，且不改变会话工作目录。关掉终端会断开实时客户端，会话元数据会保留七天。

`claw plan create` 会走种子计划模板。显式 `--template` 优先；否则 claw 使用 `.claw/project.json` 或 `.claw/project-override.json` 里的 `defaultPlanTemplate`，再回退到内置的 `default` 模板。开启规划的项目从 `process.discussing` 开始，包含一个规划任务加上一个激活桥接任务；关闭规划的项目直接从 `process.active` 开始。规划任务分析请求，并用配置好的 planning skill 填入可执行任务。`claw search --query "<topic>"` 仍是可选的命令提示，不是规划的必经步骤。

`claw context` 只输出最小的公开恢复面：项目身份与路径、存在时的活动工作流、仅在需要处理时才出现的恢复或版本诊断，以及根据已启用的 embedding 和 GitNexus 能力得出的可选搜索引导。有名字的宿主适配器负责自己宿主上的启动恢复，并提供当前宿主身份；标准无宿主流程则按入口契约直接调用不带宿主的 `claw context`。内部 SessionStart 路径保留恢复和协议处理所需的完整已解析上下文。Claw 生成的引导、返回元数据和宿主提示文本使用英文；用户提供的计划内容和仓库文档语言保持原样。

新的项目任务归在 `.claw/tasks/YYYY-MM-DD/` 下。`claw context` 会做一次带锁的惰性每日维护：清空 `.claw/runtime/tmp/`（并移除旧的 `.claw/tmp/`），把昨天之前的按日期分组的任务目录移入归档（无论旧计划有没有 `completedAt`），按 `plan.updatedAt` 归档遗留的扁平任务（没有该字段时回退到计划文件时间戳），对归档应用 `maxTasksToKeep`，移除已经不在活动任务下的计划绑定，并清扫过期的会话工作流。它在每个本地日历日的第一次 context 调用时运行，不会安装后台调度器。

新计划使用当前项目或祖先项目，并自动补齐缺失的本地 claw 结构和默认配置。`--knowledge-capture false`（或 `--no-knowledge-capture`）只关闭知识累积；它不会改选另一个存储、丢弃已有配置、附上会话 TTL，也不会免除正常的完成要求。`--scope` 已不再接受。已存在的会话内工作流仍可就地恢复；会话身份仍然绑定焦点并授权工作。

项目可以直接在 `.claw/templates` 下用 `.json`、`.js`、`.mjs` 或 `.cjs` 文件定义可复用模板。团队共享的 `defaultPlanTemplate` 放在 `.claw/project.json`，个人运行时覆盖放在 `.claw/project-override.json`。

## 使用标准无宿主流程（任意平台）

没有原生适配器的平台，或者任何能跑 shell 命令的 agent 环境，都可以直接使用完整的 `.claw` 工作流：不需要 `--host` 标志，不需要注册 `CLAW_HOST`，也不需要生命周期钩子。在这些环境里，`claw init` 就是启动方式：它写进 `AGENTS.md` 的引导块会告诉 agent 加载 `using-claw-kit`。

1. 安装 CLI（`npm install -g @veewo/claw`）。
2. 把 [packages/standard-adapter/README.md](packages/standard-adapter/README.md) 里说明的标准 skills 复制到该平台的 skill 发现位置。
3. 在项目里运行 `claw init`。

然后由 agent 把完整循环跑下去。它运行 `claw context` 恢复会话绑定的计划，在需要计划时运行 `claw plan create`，`plan done` 时开启了沉淀的工作走标准收口负责人。默认是同一 agent 上的 `knowledge prepare/complete --source agent-memory`。显式配置的后台路线使用它提供的 capture/dispatch 步骤，以及一份不捕获知识的辅助 writer 计划。`knowledgeCapture: false` 阻止递归的知识累积；不需要公开的存储范围选择。详见 [packages/standard-adapter/README.md](packages/standard-adapter/README.md)。

<h2 id="install-the-codex-plugin">安装 Codex 插件</h2>

Codex 插件是与 CLI 分开的分发面。在另一台机器上，先添加官方仓库 marketplace：

```powershell
codex plugin marketplace add chanyuenpang/claw-kit --ref vcodex-0.2.42.1
```

重启 ChatGPT 桌面应用，打开插件目录，选择 **Claw Kit** marketplace，并安装 **Claw Kit**。安装后新开一个任务，让 Codex 发现打包的 skills。更新的发布要先在 marketplace 注册里选择已发布的 `vcodex-*` ref；钉住的旧 ref 不会自己前进。用下面的命令刷新已选的 Git marketplace：

```powershell
codex plugin marketplace upgrade claw-kit
codex plugin add claw-kit@claw-kit
```

只有当启用身份是 `claw-kit@claw-kit`，且已安装清单与目标版本一致时，升级才算完成。Codex 插件缓存里出现一个更新的目录并不够：如果同名的旧身份（例如 `claw-kit@claw-kit-local`）仍处于启用状态，Codex 会继续加载那个更旧的 marketplace 来源。

已发布的 `vcodex-*` 产物标签包含 `.agents/plugins/marketplace.json`，指向完全物化的 `packages/codex-adapter` 树；规范 skill 迁移之后，源码 `main` 不是可安装的 marketplace。因此 Codex 可以把每一份共享 skill 和资源复制进插件缓存，而不运行仓库或 npm 生命周期脚本。

提交进 Git 的 marketplace 快照就是 Codex 插件的发布产物。不需要 GitHub Release 的 ZIP 附件。请使用完整仓库检出；只含 `.agents/plugins` 的稀疏检出，会漏掉所引用的 `packages/codex-adapter` 载荷。

在本仓库里工作的维护者有两条 Codex 命令：

```powershell
npm run export:codex-plugin
npm run install:codex-plugin
```

它们的作用：

1. `npm run export:codex-plugin` 把可安装的插件载荷复制到 `dist/codex-plugin/claw-kit/<plugin-version>/`。
2. `npm run install:codex-plugin` 拉取已发布的不可变 `vcodex-<plugin-version>` marketplace 标签，把该载荷安装到 `%USERPROFILE%\.codex\plugins\cache\claw-kit\claw-kit\<plugin-version>\`，启用 `claw-kit@claw-kit`，并禁用 `claw-kit@claw-kit-local`。

运行 `install:codex-plugin` 之前要先发布新版本；它会故意拒绝安装未发布的工作区内容。本地 marketplace 安装不是受支持的验证或更新路径。

用 `claw template validate --template <id>` 可以在不创建计划的情况下校验模板。这条命令使用与 `claw plan create` 和 `claw subplan create` 相同的注册表解析模板，并报告需要选择 id 的路由感知任务。

## 安装 OpenCode 插件

OpenCode 插件是与 CLI 分开的分发面。事实来源在 `packages/opencode-adapter`，本仓库提供两条受支持的命令：

```powershell
npm run export:opencode-plugin
npm run install:opencode-plugin
```

它们的作用：

1. `npm run export:opencode-plugin` 把可安装的插件载荷复制到 `dist/opencode-plugin/claw-kit/<plugin-version>/`。
2. `npm run install:opencode-plugin` 把同一份载荷复制到本地 OpenCode 配置 `~/.config/opencode/plugins/claw-kit/`，然后：
   - 在 `~/.config/opencode/plugins/claw-kit.ts` 创建插件垫片，让 OpenCode 在启动时发现插件，
   - 把每个 skill 文件夹复制到 `~/.config/opencode/skills/`，使适配器 skills 可用（OpenCode 只从约定目录发现 skills，不通过配置项），
   - 把打包的 agent 定义复制到 `~/.config/opencode/agent/`。

安装后重启 OpenCode，新的插件、skills 和 agents 才会被加载。

想让这台机器立刻开始使用适配器时，用 `install:opencode-plugin`。想要一份干净的带版本打包、可以附在发布上、拷到另一台机器或交给另一个安装器时，用 `export:opencode-plugin`。

## 安装 Cindy 插件

Cindy 适配器从它自己的 Git marketplace 仓库分发。在 Cindy 里把 `https://github.com/chanyuenpang/claw-kit-cindy-adapter.git` 加为 marketplace，安装 `claw-kit-cindy` 条目，检查权限并启用它。`claw` CLI 仍然是单独安装。完整的安装和更新顺序见 [packages/cindy-adapter/README.md](packages/cindy-adapter/README.md)。

<h2 id="install-the-dsh-adapter">安装 DSH 适配器</h2>

DSH 适配器是安装到 DSH profile 里的 npm 包。从已发布的注册表：

```powershell
dsh plugin --profile web add @veewo/dsh-claw-kit@latest
```

重启 Host（`dsh --profile web`）以挂载 `claw-kit` 这一行，然后确认出现 `claw_run` 工具和打包的 skills。已安装的 `claw` CLI 必须支持 `--host dsh`。

由 Electron 管理的 `desktop` profile 是例外：`PATH` 上的全局 `dsh` 会以 `profile "desktop" is managed exclusively by the Electron application` 拒绝它，所以要通过该 profile 自己的插件管理器安装——`plugin_manager(action: "install_bundle", target: "@veewo/dsh-claw-kit@<version>")` 或导出的 tarball 路径——不要直接写 profile 文件。见 [desktop profile 写入边界](packages/dsh-adapter/skills/update/references/desktop-profile-write-boundary.md)。

在本仓库里工作的维护者有两条命令：

```powershell
npm run export:dsh-plugin     # build + pack the installable tarball into dist/dsh-plugin/
npm run install:dsh-plugin    # dsh plugin --profile web add <tarball> (--profile to override)
```

`install:dsh-plugin` 运行 `PATH` 上的全局 `dsh`，因此只适用于非 Electron profile；`desktop` 请用上面的 `plugin_manager` 路径。

适配器会自动消费 CLI hostActions（进度投影 + 原生 goal 同步），并通过原生 DSH 子代理自动分发知识收口；模型只驱动单一的 `claw_run` 工具。详见 [packages/dsh-adapter/README.md](packages/dsh-adapter/README.md)。

<h2 id="package-map">包地图</h2>

- `@veewo/claw`
  - 在项目里运行 `.claw` 工作流的 CLI 入口
- `@veewo/claw-client`
  - 轻量、有类型的 Node API，面向 `claw session open` 使用的同一个持久 session daemon
- `@veewo/claw-core`
  - 共享的工作流原语：项目配置、规划、搜索、truth 入库和保留
- `@claw-kit/standard-adapter`
  - 与宿主无关的适配器资产（入口契约 + skills），让任何能执行 shell 命令的平台运行这套工作流，无需宿主注册或钩子
- `@claw-kit/codex-adapter`
  - 面向 Codex 的适配器资产、钩子、skills 和参考，用于把工作流落到 Codex
- `@veewo/dsh-claw-kit`
  - 面向 DSH 的 Cordis 插件，暴露 `claw_run` 工具、自动消费 hostActions（进度 + 原生 goal 同步）、自动分发的知识收口，以及七个打包 skills
- `@claw-kit/openclaw-adapter`
  - 面向 OpenClaw 的适配器层，建立在同一套核心工作流模型上
- `@claw-kit/opencode-adapter`
  - 面向 OpenCode 的适配器，通过 TypeScript 插件、插件垫片、agent 定义和 skills 把工作流落到 OpenCode

## `project.json` 一览

`.claw/project.json` 是项目里团队拥有的规范工作流配置，`.claw/project-override.json` 是仅用于本地运行时的个人偏好覆盖。

通过插件修改 claw 配置时，先使用 `config` skill。它会询问这次改动是共享的团队配置还是个人本地配置，然后按当前的扁平字段形状路由到 `.claw/project.json` 或 `.claw/project-override.json`。

需要备用细节时，先看上面的适配器参考说明，只在需要更深的规范细节时再使用 [docs/project-json-reference.md](docs/project-json-reference.md)：

- 共享配置与本地配置的边界
- 项目模板默认值以及 `.claw/templates` 的用法
- memory、workflow、GitNexus 和 writer 覆盖字段
- 需要调一个真实项目时可以照抄的示例

## 参与贡献

平台上的问题和小改动都欢迎。issue 表单、本地准备和发 PR 的步骤见 [CONTRIBUTING.md](CONTRIBUTING.md)。标了 `good first issue` 的问题适合第一次参与。

## 维护者文档

发布与分发步骤使用 [DISTRIBUTION.md](DISTRIBUTION.md) 里的规范维护流程，以及仓库本地的 `release-claw-kit` skill。
