# 外部环境核验

本门禁验证“实际执行的实现来自外部用户可取得的发布渠道”，不只核验标签。使用 OS 临时目录中的独立测试根目录，不能在 claw-kit checkout、其子目录或其 workspace `node_modules` 中运行被测包。

门禁只检查本轮当前宿主的调用链。下文各宿主来源与修复方法是可移植说明，不是要求一次运行检查全部宿主。其他平台只有用户明确指定后才成为目标；修复当前路由时不能改走 DSH、standard 或其他宿主。

## 1. 锁定公开来源

查询公开渠道并记录本轮版本，不硬编码本文编写时的版本。CLI/Core/Client 使用官方 npm registry；CLI 声明的 Core/Client 版本必须满足其公开依赖合同，不能自行混用最新版。插件与 CLI 的版本独立记录，不强制各宿主四段版本相等。

先明确验收目标版本。用户要求验证刚发布的新版本时，不能因它尚未公开就自动安装较旧公开版本并把结果归给新包；应修复渠道/传播条件，仍不可取得则将该目标记 blocked。若另行验证旧公开版本，必须作为独立且明确的目标报告。当前本地候选包与公开目标不同时，报告开头写明本轮实际被测版本以及候选包未被测试；安装了候选包不等于隔离公开测试使用了它。

只读查询示例，`<version>` 替换为明确公开版本：

```text
npm config get registry
npm view @veewo/claw@<version> version dist.tarball dist.integrity dependencies --json --registry=https://registry.npmjs.org
npm view @veewo/claw-core@<version> version dist.tarball dist.integrity --json --registry=https://registry.npmjs.org
npm view @veewo/claw-client@<version> version dist.tarball dist.integrity --json --registry=https://registry.npmjs.org
```

Core/Client 查询使用实际解析的对应版本。锁定后的公开 tarball 必须能真实下载并核验 registry integrity，元数据可见不等于产物可安装。公司 registry 镜像只有在内容摘要与官方公开产物一致且用户安装确实经过该镜像时才可使用。

插件按各自公开分发来源验证：Codex 官方 GitHub marketplace 与 `claw-kit@claw-kit` identity；DSH 的 `@veewo/dsh-claw-kit` npm 包及官方 loader；Cindy 的独立官方 marketplace 发布；OpenCode/OpenClaw 的官方公开 release/ref 和安装入口。以目标版本的公开安装说明确认实际地址与 artifact 形态，不把开发 checkout、export 目录或另起的开发 identity 当官方产物。若官方插件渠道跟随可变分支，记录实际取得的 commit 和时间，并对照当时公开渠道内容，不能假定分支等于某个历史 tag。

## 2. 确认真正执行的 CLI 与依赖

Windows 使用 `Get-Command claw -All` 与 `where.exe claw`，其他系统使用 `type -a claw`；记录 alias/function/shim 和 PATH 优先级。检查脚本 shim 的实际 Node 入口，解析真实路径和链接目标，不能只看命令所在目录。

同时检查 `npm ls --global --json`（全局安装时）或隔离安装根的 `npm ls --json`、实际 package manifest、安装 lock/provenance。检查 PATH、NODE_PATH、包管理器 overrides、宿主子进程环境，以及 Node 从实际 CLI/plugin 入口解析的依赖：

- `@veewo/claw`、`@veewo/claw-core`、`@veewo/claw-client` 各自的 realpath、版本和来源；插件自行携带的同名依赖也要查。
- 任一实现解析回仓库、workspace、本地构建目录、link/junction 目标，或存在 `file:`/`link:`/workspace override，门禁失败。正常安装在本机目录内是允许的；禁止的是本地开发产物来源。
- 宿主通过 child process、resident daemon 或单独 PATH 找 CLI 时，必须核对**该进程实际解析路径**。控制台里的 `claw --version` 不能证明宿主用的是同一个 CLI。
- 版本号相同不证明文件相同。将实际安装的随包文件与干净下载的同版本公开 tarball 比较摘要，至少包含 package manifest、执行入口、driver/projector、Core 的宿主能力合同及插件 runtime/skills/hooks。忽略包管理器生成的缓存文件时记录排除规则；不允许排除被执行的文件。
- 记录公开 tarball 的 integrity、安装来源回执及文件校验结果；任何本地修改、来源缺失或摘要不一致均不能通过门禁。

已经确认干净的公开安装可直接测试；否则在新的隔离 prefix/profile 内从公开版本安装，不改默认全局安装。安装时指定精确公开包名/version 与 registry，不执行仓库安装脚本。隔离测试进程的 PATH 必须指向该安装，并在**宿主的实际执行路径**重新核验，不能仅给外部脚本换 PATH。

## 3. 确认真正加载的插件与宿主

记录真实宿主名称/版本、agent/model、插件 identity/source/ref/version、加载目录与关键摘要、会话 ID、实际可见工具和初始化/加载回执。

- 核验 enabled 插件配置、安装文件和 loaded cache；被测 adapter 的运行 skill、driver、runtime 和 hooks 必须来自该公开安装并实际加载。用于编排本轮测试的 smoke-test-claw-kit 指令和测试输入可以来自项目，不属于被测实现。仓库相同版本的 adapter 文件不能代替 cache 校验。
- 若安装刚刷新，旧会话仍可能执行旧 skill/driver 或驻留旧 daemon。用宿主的加载元数据/日志证明本会话所用版本；需要重启/新会话才能生效时遵循宿主真实流程和既有授权，不能只比较磁盘文件就宣称已激活。
- 无法确定 loaded provenance 时先检查加载日志、刷新测试 profile 并使用已授权的重载/测试会话流程。确实缺少重启/新会话权限时请求必要条件，并继续其他可执行修复；不能一遇到不确定就结束，也不能冒充真实宿主。
- 真实宿主缺少某项工具应照实记录并检验该版本是否正确处理；禁止提供 mock `tools.update_plan`、伪造 Goal snapshot、虚构 callback 或使用仓库 test oracle。
- Standard CLI lane 的通过只能证明 CLI，不证明 Codex driver、Ghost、DSH tool 或其他插件链路。

## 4. 隔离与复核

测试项目和 runtime 使用唯一目录/ID；路径、环境变量与进程操作使用当前系统的原生方式，不硬编码 Windows 路径或 shell。保留与普通用户一致的公开默认配置，不能通过关闭知识、Goal 或 hooks 等功能让基础生命周期“通过”。这里只准备可用性冒烟所需环境，不默认增加配置测试或离线/缺依赖故障场景。

门禁表每个 lane 至少记录以下字段：

| 字段 | 必须具备的证据 |
| --- | --- |
| 目标渠道、版本/ref、时间 | 公开元数据、安装说明、实际下载回执 |
| OS、Node、宿主 | 本机与真实宿主状态；收口实际依赖模型时再记录相关条件 |
| CLI 与依赖 | 实际入口/realpath、解析依赖、来源与内容校验 |
| 插件 | identity、官方源、安装与 loaded cache 摘要 |
| 实际调用环境 | 子进程/daemon 路径、profile、session、可见工具 |
| 隔离 | 测试 project/runtime 路径及唯一 marker |
| 门禁状态 | passed / failed / blocked 和具体原因 |

测试期间若自动 update、driver 的 CLI 版本修复或宿主重载改变了产物，重新执行门禁，固定新版本，并重跑受影响的已执行场景。不能把前后不同的版本合并成一次通过结论。

发现已发布缺陷时保留失败证据。源码修复之后，只能等新的公开产物可获取并重新核验、重新运行，才能改变外部冒烟结论。公开版本仍失败时应明确报告，不能从候选包取得“通过”。

## 5. 环境不合格时主动修复

将环境问题视为本次测试准备工作的组成部分，按原因执行可逆修复，再复核实际加载路径。不要只输出“环境不合格，停止”。

| 问题 | 修复与重新核验 |
| --- | --- |
| 本地 link/workspace、PATH 遮蔽或手工改包 | 新建隔离安装，从官方 registry 获取精确公开版本；移除测试进程的本地路径/override，核验真实调用路径与摘要 |
| Core/Client 版本混合或来源缺失 | 按公开 CLI/plugin 依赖合同重装完整依赖树；不能借用仓库 node_modules；复查每个解析入口 |
| 插件源/identity 错误 | 在独立 profile 通过官方安装入口准备官方 identity，取得安装和来源回执；不制造开发 identity |
| 文件已更新但会话/daemon 仍旧 | 在测试 profile 内按公开流程重载、释放本轮旧 daemon 或使用已授权新会话；再次确认 loaded version/ref 与子进程路径 |
| registry/cache/网络异常 | 核查 registry、代理和公开 tarball 可达性；重建本轮隔离 cache，按错误原因有限重试，保留错误与下载证据 |
| 缺少公开要求的 Node/依赖 | 使用外部用户可获取的受支持运行时/依赖，在测试环境补齐并重新查路径；不使用源码 shim 绕过 |
| 当前目标的凭证、宿主访问或重启权限缺失 | 获取真正必需的条件；同时继续当前范围内不依赖它的步骤。不能虚构凭证、mock 宿主、改用本地实现或切换宿主 |
| 指定版本未公开/产物无法获取 | 查询正确官方渠道并排除缓存/传播问题；仍不可取时报告具体外部阻塞，不自行发布或用候选版本代替 |

每种修复应有明确原因和可检验变化。同一措施无变化时最多重试两次；取得新证据后可以选择下一种针对性措施。修复失败不无限循环：列已尝试措施、剩余根因及所需用户/外部条件。只有此时才把对应 lane 记 `blocked`。修复前后的环境记录都保留，但功能结果必须来自修复后重新通过门禁的同一组公开产物。
