# claw-kit 技能统一审查（2026-10-01）

> 本文是重构前的审查快照，不代表后续实现状态。已实施的公共技能共享源、平台边界与维护方法见[公共技能维护说明](<../public-skill-sources.md>)；内部资源和发布维护技能的问题不因此视为全部修复。

## 结论与范围

**修订后可统一：统一核心合同与维护源，不统一宿主的运行时执行权。** 不能把当前所有副本直接复制成一份；已存在会改变执行结果的合同漂移。

本轮仅审查 claw-kit 项目自有技能：**20 个技能家族、63 个源入口**（9 个公共家族、2 个 Core 内部家族、9 个仓库维护家族）。其他项目/个人技能不在范围内。目录扫描中发现的两个游戏机制技能只用于归属排除，不计入审查覆盖或建议。历史 dist、已安装全局技能、第三方技能不作为本轮源文件审查对象。

用户授权使用 DSH Agent Teams：role-reviewer、lifecycle-reviewer、distribution-reviewer 三个只读队友分别审查角色合同、生命周期/知识治理、分发/更新；Lead 审查仓库维护技能、交叉核验关键证据并汇总。全部共享审查任务已回报；没有将普通 subagent、Team 成员和知识 finalizer 混作一个执行面。

本轮交付为审查与迁移建议，不发布、不更新安装、不运行被审技能的业务流程、不批量改写技能。保留工作区已有修改，包括上一轮的委派披露要求。

跨平台统一的实施重点是上述 **9 个公共技能家族**；内部资源和仓库维护技能仅纳入关联边界、重复与过期合同审查，不合并进用户技能包。多平台副本必须随安装包存在，目标是减少手工维护源，而不是机械删除分发副本。

## 完整技能家族清单

数量包含共享规范源及各分发/本地副本，不等于用户可发现技能数。下表每行已完成入口审阅，重要模板、fallback、runner、reference 与发布路径按相关性核验。

| 技能 | 源入口数 | 现有位置/角色 | 统一建议 |
|---|---:|---|---|
| [planning](<../../shared/skills/planning/SKILL.md>) | 7 | shared；Codex/DSH/OpenCode/Cindy/standard/本地 | 保留共享，移除重复的准入判断 |
| [config](<../../shared/skills/config/SKILL.md>) | 7 | 同上 | 共享配置合同；Cindy 仅保留必要传输差异 |
| [create-claw-skill](<../../shared/skills/create-claw-skill/SKILL.md>) | 7 | 同上 | 整包统一，先修版本与生成入口路由 |
| [feature-architecture](<../../shared/skills/feature-architecture/SKILL.md>) | 6 | shared；Codex/DSH/OpenCode/standard/本地 | 修正共享源和宿主路由，不另造框架 |
| [researcher](<../../packages/dsh-adapter/skills/researcher/SKILL.md>) | 6 | Codex/DSH/OpenCode/Cindy/standard/本地 | 新增共享核心；保留宿主委派差异 |
| [using-claw-kit](<../../packages/dsh-adapter/skills/using-claw-kit/SKILL.md>) | 6 | 同上 | 共享语义，宿主拥有执行与收尾 |
| [knowledge-capture](<../../packages/codex-adapter/skills/knowledge-capture/SKILL.md>) | 2 | Codex/DSH | 共享正文和 runner；保留运行时版本绑定 |
| [claw-kit-doc](<../../packages/standard-adapter/skills/claw-kit-doc/SKILL.md>) | 7 | 六个 adapter 与本地 | 共享资料；入口仅选当前宿主资料 |
| [update](<../../packages/dsh-adapter/skills/update/SKILL.md>) | 3 | Codex/DSH/OpenCode | 暂保留宿主独立执行包 |
| [knowledge-writer](<../../packages/core/resources/knowledge-writer/SKILL.md>) | 1 | Core 内部 | 保持内部治理资源，不进入公共发现 |
| [doc-updater](<../../packages/core/resources/doc-updater/SKILL.md>) | 1 | Core 内部 | 保持内部，澄清调用输入与 standalone 分支 |
| [release-claw-kit](<../../.agents/skills/release-claw-kit/SKILL.md>) | 2 | 本地 .agents 与遗留 .claude | 保留唯一发布路由，退役旧流程 |
| [release-claw-cli](<../../.agents/skills/release-claw-cli/SKILL.md>) | 1 | 本仓库维护 | 补齐 client 包，不下发宿主插件 |
| [release-codex-plugin](<../../.agents/skills/release-codex-plugin/SKILL.md>) | 1 | 本仓库维护 | 保持独立制品与授权边界 |
| [release-dsh-plugin](<../../.agents/skills/release-dsh-plugin/SKILL.md>) | 1 | 本仓库维护 | 修命令与清单；保留 npm/profile 边界 |
| [release-openclaw-plugin](<../../.agents/skills/release-openclaw-plugin/SKILL.md>) | 1 | 本仓库维护 | 保持独立制品边界 |
| [release-opencode-plugin](<../../.agents/skills/release-opencode-plugin/SKILL.md>) | 1 | 本仓库维护 | 保持独立制品边界 |
| [release-cindy-plugin](<../../.agents/skills/release-cindy-plugin/SKILL.md>) | 1 | 本仓库维护入口 | 保留独立仓库交接，不与主库发布合并 |
| [test-claw-kit](<../../.agents/skills/test-claw-kit/SKILL.md>) | 1 | 本仓库维护 | 保留不发布合同；纠正版本文案和检查比例 |
| [cindy-claw-e2e](<../../.agents/skills/cindy-claw-e2e/SKILL.md>) | 1 | 本仓库维护 | 保留双通道；明确异步 policy 前提 |

**发现面不必矩形化。** Cindy 磁盘有 6 个技能包，但 manifest 只公开 using-claw-kit、planning、researcher、claw-kit-doc 四个；config/create-claw-skill 文件存在不代表已公开。OpenClaw 仅公开 claw-kit-doc。不能为了“统一”无依据增加公开入口。证据：[Cindy manifest](<../../packages/cindy-adapter/plugin/ghost.json#L72>)、[Cindy surface test](<../../packages/cindy-adapter/test/cindy-skill-surface.test.mjs#L7>)。

## 已确认问题

### P1：先修执行合同（高）

1. **DSH 委派说明混淆普通子代理和 Agent Teams。** [researcher:72–91](<../../packages/dsh-adapter/skills/researcher/SKILL.md#L72>) 与 [architecture:23](<../../shared/skills/feature-architecture/SKILL.md#L23>) 使用 list_agents 查 idle/ready child，并把省略 run_in_background 当成持久复用保证。本次实际 SDK 的 list_agents 只列 Team 成员，状态是 running/inactive/provisioning/failed；普通 subagent 返回 background/continuable/foreground 三种结果，background 需要 job_output 收集。修成按实际返回类型处理，不自动将普通研究升级为 Team；Team 仅在用户授权时启用。[现有文本测试](<../../packages/dsh-adapter/test/delegation-contract.test.mjs#L39>) 还固化了旧假设，不能把 regex 通过当行为正确。
2. **同一技能进入原生路线后又逃逸到 raw CLI 或错误本地技能。** [architecture 路由](<../../shared/skills/feature-architecture/SKILL.md#L18>) 要求受控 context，却随后直接要求 claw plan edit；[子代理提示](<../../shared/skills/feature-architecture/SKILL.md#L66>) 优先加载工作区 hostless 副本。[DSH update](<../../packages/dsh-adapter/skills/update/SKILL.md#L22>) 也使用 raw CLI plan/subplan 和 goal handoff。[create-claw-skill](<../../shared/skills/create-claw-skill/SKILL.md#L14>) 及其生成入口存在同类问题。DSH 已支持 template_file，无需绕开 adapter；应把 context/search/plan reference/template 入口从头到尾交给同一宿主路线。模型不得重复消费 adapter 的 Goal 投影。
3. **本地 using-claw-kit 落后且本次加载实际命中了它。** [本地旧收尾](<../../.agents/skills/using-claw-kit/SKILL.md#L49>) 强制默认 background 三步链；[standard 当前收尾](<../../packages/standard-adapter/skills/using-claw-kit/SKILL.md#L49>) 和 [Core policy matrix](<../../packages/core/src/integration-contract.ts#L49>) 已使用默认 main-agent。修正源与本地发现面的同步，并确保原生 adapter 的入口优先，不仅改发布包。
4. **Cindy GPT bridge 与当前 CLI 静态不兼容。** [Cindy bridge](<../../packages/cindy-adapter/plugin/skills/using-claw-kit/SKILL.md#L140>) 只接受 driver v13/cache v13；[当前 CLI driver](<../../packages/cli/src/codex-driver.ts#L3>) 是 v22，当前源码组合会拒绝 envelope。应同步其协议版本/维护机制。尚未在已部署 Cindy 会话复现，不能称线上已失败。
5. **DSH main-agent 收尾存在真实 transport 缺口。** [配置合同](<../../packages/dsh-adapter/skills/claw-kit-doc/references/configuration.md#L75>) 与 [Core matrix](<../../packages/core/src/integration-contract.ts#L48>) 宣称可用；[guidance](<../../packages/core/src/workflow-guidance.ts#L651>) 返回 prepare/complete。但 [DSH 入口](<../../packages/dsh-adapter/skills/using-claw-kit/SKILL.md#L38>) 禁止 shell 工作流，[协议映射](<../../packages/dsh-adapter/src/protocol.ts#L207>) 只有 knowledge.claim/done，未知操作拒绝。需补受控 adapter 能力或收窄宣称；不能只改文案教模型绕开 claw_run，也不能拿手动 capture 替代自动 closeout。
6. **遗留同名发布入口仍可误导执行。** [旧 .claude 发布入口](<../../.claude/skills/release-claw-kit/SKILL.md#L24>) 引用六个不存在的 rules 文件，没有 DSH 路由，并保留旧跨制品流程；与 [当前发布 router](<../../.agents/skills/release-claw-kit/SKILL.md#L7>) 和 Cindy 独立仓库交接冲突。应退役旧执行树，或留下指向唯一当前 owner 的极薄入口，而不是维护两套。

### P2：整包语义与分发一致性（中）

7. **模板版本规则自相矛盾。** [转换 fallback](<../../shared/skills/create-claw-skill/FALLBACK.md#L5>)、[转换模板](<../../shared/skills/create-claw-skill/TEMPLATE.json#L67>) 要求当前 CLI 版本；[authoring 合同](<../../shared/skills/create-claw-skill/references/template-authoring.md#L8>) 与 generator 使用独立 driver 版本。会造成错误改写或无法满足的验收比较。Cindy 的旧生成器/入口漂移更大；[测试技能 coverage](<../../.agents/skills/test-claw-kit/CONTENT-COVERAGE.md#L14>) 也有旧说法。统一整个包，不仅入口。**旧 stamp 不等于运行时拒绝**：[Core 兼容逻辑](<../../packages/core/src/plan-templates.ts#L408>) 明确在内存正规化。
8. **同步检查的绿色结果只覆盖部分目录。** [同步声明](<../../scripts/sync-shared-skills.mjs#L8>) 仅含四个 shared skills→Codex/DSH/OpenCode；docs→这些宿主加 Cindy/OpenClaw。standard 与本地副本不在默认矩阵。[模板扫描根](<../../scripts/update-template-versions.mjs#L6>) 也漏 standard/Cindy/.claude。DSH 发布复制现有 skills，没有等价 shared freshness gate。先声明每个自有入口的 canonical/generated/host-owned 身份，再扩充既有工具；不要直接把新目录塞进会整目录替换的同步器，抹掉 hostless 差异或暗改 Cindy 子仓库。
9. **手动与自动知识沉淀的授权模式混入同一提示。** 公共 [knowledge-capture](<../../packages/codex-adapter/skills/knowledge-capture/SKILL.md#L8>) 正确要求用户明确请求、非 claw、同代理；自动 main-agent 通过相同 prepare 投影时，[direct assignment 提示](<../../packages/core/src/knowledge-assignments.ts#L348>) 却重复宣称 explicit manual/manual only。应共享证据治理与执行能力，但分别说明触发授权；不要让公共 capture 成为自动生命周期入口。此项是指令冲突，不是已复现命令报错。
10. **发布技能漏掉 client 包。** [CLI release 合同](<../../.agents/skills/release-claw-cli/references/artifact.md#L6>)、模板与 fallback 仍只描述 core→CLI 和两个包验收；[实际发布 gate](<../../scripts/publish-release.mjs#L143>) 与 [发布顺序](<../../scripts/publish-release.mjs#L332>) 已要求 core→client→CLI。应使用真实三包发布合同，避免 agent 依据技能手工遗漏依赖包。
11. **更新资料和 fallback 有宿主错误。** [OpenCode 更新参考](<../../packages/opencode-adapter/references/opencode-plugin-update.md#L10>) 及第 58 行要求公开 knowledge-writer，而 [bundle 边界测试](<../../scripts/opencode-plugin-bundle.test.mjs#L147>) 明确禁止。修资料，不恢复旧公共 writer。[DSH update fallback](<../../packages/dsh-adapter/skills/update/non-claw-fallback.md#L10>) 硬编码 web profile，而入口使用实际 profile；应解析/确认授权目标后再更新。

### 其他局部修正（中低）

- architecture 一面叫 readonly，一面要求 document-author 落盘；同时 taskDir/reportDir 名称混用。明确“源码只读、仅允许写指定报告目录”；无 active task 仍零文件。证据：[角色与输出](<../../shared/skills/feature-architecture/SKILL.md#L21>)。
- [doc-updater 入口](<../../packages/core/resources/doc-updater/SKILL.md#L10>) 先要求 active finalization plan，又给 standalone plan 分支；模板仍依赖 parent assignment。删除不可满足的分支，或定义真实 standalone 输入。direct-memory 保持走 fallback，不进入该计划入口。
- [manual capture complete](<../../packages/codex-adapter/skills/knowledge-capture/SKILL.md#L25>) 要求每个文件调用一次 complete；CLI 已支持重复 changed-truth 参数。建议一次提交全部路径，减少重复刷新；不改变手动授权边界。
- [DSH release fallback](<../../.agents/skills/release-dsh-plugin/FALLBACK.md#L9>) 和模板将 npm run build/test/check 当一条命令；[package scripts](<../../packages/dsh-adapter/package.json#L52>) 实际是三条独立脚本。列出明确命令。DSH update/release 的“七个技能”验收也已落后于当前九个入口，改按声明集合核验。
- [test-claw-kit fallback](<../../.agents/skills/test-claw-kit/FALLBACK.md#L5>) 对 mixed-stage 也固定全仓 build/check；建议保留真正 release-candidate 的完整门禁，对小范围验证按仓库比例原则选择，不借统一扩大测试成本。

## 统一方案：一个核心，短路由，明确的例外

1. **一个语义 owner。** researcher 新建共享核心；feature-architecture 继续原共享源；knowledge-capture 的两份相同正文及无已证实宿主必要差异的 runner 共源。planning/config 保持薄，配置 schema 不复制进各宿主长文。
2. **技能内先确定路线，只加载当前宿主细节。** 用已知 adapter/可用工具选择，不让用户选择“我在哪个平台”，不新建 host-choice task。较长说明放同包相邻宿主 reference。原生 adapter 存在时不能被本地 hostless 副本反向覆盖。
3. **主代理/受派角色分开。** 先披露委派角色与任务；受派代理不递归派发。普通 subagent 和 Team 各用自身结果/等待协议；保持用户对 Team 的授权门槛。
4. **共享技能包，不只共享正文。** 模板、fallback、生成 prompt、runner、reference、相邻资源一起核验。沿用现有同步器和一个小的显式目标清单，不引入通用路由框架或模板编译器。Cindy vendor/提交是显式跨仓库操作。
5. **必要例外不抹平。** update 目前有明确 [宿主独立 owner ADR](<../../.claw/truth/adr/host-specific-update-skill-ownership.md#L15>)；保留安装/激活包独立，不盲目加入 shared sync。仓库 release/test/E2E 技能仍 repo-local；Core governance 保持内部不可发现资源。

### 必须保护的执行差异

- DSH 默认自动知识收尾由 [adapter](<../../packages/dsh-adapter/src/index.ts#L707>) 启动并隐藏 writer prompt；不能再要求 Lead 派发一次。
- Codex/Cindy 有各自的 dispatch、停回合、身份与报告合同；Cindy researcher Worker 复用与停回合规则不能套 DSH 的并行工作方式。
- standard 使用稳定会话 ID 和 hostless CLI；main-agent 由当前代理执行。不是所有宿主都应有同样的公开技能数量。
- knowledge-capture 仍只接受明确手动请求、不从 claw 自动触发、不委派；自动 closeout 与它只能共享治理逻辑，不能共享触发授权。
- Codex committed marketplace 自包含、DSH npm/profile、OpenCode 多发现面、Cindy 独立仓库/UI 更新是不同交付合同。

## 建议迁移顺序与验收

| 切片 | 内容 | 最小验收 |
|---|---|---|
| 1：修执行合同 | DSH 委派/原生路由、本地 hostless 漂移、Cindy driver、遗留发布入口、版本与三包发布文案 | 逐项对照 SDK/协议 owner；资源链接与兼容版本检查；更新固化旧规则的测试 |
| 2：优先统一三技能 | researcher 共享核心、architecture 路由修正、knowledge-capture 正文+runner 共源 | 全包同步只读比较；按 background/continuable/Team/Cindy 停回合、architecture 有/无 task、manual capture 授权场景做少量定向验证 |
| 3：补齐维护矩阵 | standard/本地的明确生成策略；Cindy 显式 vendor；DSH freshness gate | 每个声明目标完整自包含、无丢失相邻资源；不覆盖未拥有目录、不暗改子模块 |
| 4：生命周期能力修复 | DSH main-agent transport、自动/手动 assignment 措辞、内部 updater 输入 | 聚焦 prepare/complete 的调用映射和授权合同；按 host/policy 定向 smoke，不全仓盲跑 |

以上为实施建议，不代表已完成重构。是否把 update 的入口源码也共享涉及既有 ADR 变更，应单独明确；推荐此轮先保留独立 owner。DSH main-agent 缺口需要代码修复，不应把它伪装成纯技能去重。

## 证据与验证边界

- 源入口 frontmatter 检查：63 个 claw-kit 入口均有 name/description。
- distribution-reviewer 运行 verifySharedSkillsSynced()：ok=true，problems=[]；只证明默认同步矩阵。
- inspectTemplateVersions()：driver 1.0.0、CLI 0.2.41、20 个模板、issues=[]；只证明扫描根覆盖内的模板。
- 三个只读 Team 任务均完成，Lead 对严重缺陷核对了具体源文件；无技能运行、安装、发布、全仓 build/test 或外部宿主 E2E。
- OpenCode discovery 使用合并复制且只明确清理 truth-writer/adr-writer，旧资源可能残留（[安装实现](<../../scripts/opencode-plugin-bundle.mjs#L162>)）；未检查用户实际安装，不声称残留已发生。迁移时只清理已确认属于本包的资源。
- [Cindy E2E](<../../.agents/skills/cindy-claw-e2e/SKILL.md#L110>) 默认要求异步 job，应先确认有效 executionPolicy 与知识沉淀资格；main-agent 无 job 不能被误报失败。未运行双通道 E2E。
- 非 DSH 宿主的实时工具参数未逐一验证；Codex 工具名不能仅凭与 DSH 不同就判错。入口恢复顺序、Goal timing 等未复现项不列为已确认运行失败。

## 附录：全部 claw-kit 源入口

### cindy-claw-e2e

- [.agents/skills/cindy-claw-e2e](<../../.agents/skills/cindy-claw-e2e/SKILL.md>)

### claw-kit-doc

- [packages/cindy-adapter/plugin/skills/claw-kit-doc](<../../packages/cindy-adapter/plugin/skills/claw-kit-doc/SKILL.md>)
- [packages/codex-adapter/skills/claw-kit-doc](<../../packages/codex-adapter/skills/claw-kit-doc/SKILL.md>)
- [packages/standard-adapter/skills/claw-kit-doc](<../../packages/standard-adapter/skills/claw-kit-doc/SKILL.md>)
- [packages/opencode-adapter/skills/claw-kit-doc](<../../packages/opencode-adapter/skills/claw-kit-doc/SKILL.md>)
- [packages/dsh-adapter/skills/claw-kit-doc](<../../packages/dsh-adapter/skills/claw-kit-doc/SKILL.md>)
- [packages/openclaw-adapter/skills/claw-kit-doc](<../../packages/openclaw-adapter/skills/claw-kit-doc/SKILL.md>)
- [.agents/skills/claw-kit-doc](<../../.agents/skills/claw-kit-doc/SKILL.md>)

### config

- [shared/skills/config](<../../shared/skills/config/SKILL.md>)
- [packages/standard-adapter/skills/config](<../../packages/standard-adapter/skills/config/SKILL.md>)
- [packages/cindy-adapter/plugin/skills/config](<../../packages/cindy-adapter/plugin/skills/config/SKILL.md>)
- [packages/codex-adapter/skills/config](<../../packages/codex-adapter/skills/config/SKILL.md>)
- [packages/dsh-adapter/skills/config](<../../packages/dsh-adapter/skills/config/SKILL.md>)
- [packages/opencode-adapter/skills/config](<../../packages/opencode-adapter/skills/config/SKILL.md>)
- [.agents/skills/config](<../../.agents/skills/config/SKILL.md>)

### create-claw-skill

- [shared/skills/create-claw-skill](<../../shared/skills/create-claw-skill/SKILL.md>)
- [packages/cindy-adapter/plugin/skills/create-claw-skill](<../../packages/cindy-adapter/plugin/skills/create-claw-skill/SKILL.md>)
- [packages/standard-adapter/skills/create-claw-skill](<../../packages/standard-adapter/skills/create-claw-skill/SKILL.md>)
- [packages/codex-adapter/skills/create-claw-skill](<../../packages/codex-adapter/skills/create-claw-skill/SKILL.md>)
- [packages/dsh-adapter/skills/create-claw-skill](<../../packages/dsh-adapter/skills/create-claw-skill/SKILL.md>)
- [packages/opencode-adapter/skills/create-claw-skill](<../../packages/opencode-adapter/skills/create-claw-skill/SKILL.md>)
- [.agents/skills/create-claw-skill](<../../.agents/skills/create-claw-skill/SKILL.md>)

### doc-updater

- [packages/core/resources/doc-updater](<../../packages/core/resources/doc-updater/SKILL.md>)

### feature-architecture

- [shared/skills/feature-architecture](<../../shared/skills/feature-architecture/SKILL.md>)
- [packages/codex-adapter/skills/feature-architecture](<../../packages/codex-adapter/skills/feature-architecture/SKILL.md>)
- [packages/dsh-adapter/skills/feature-architecture](<../../packages/dsh-adapter/skills/feature-architecture/SKILL.md>)
- [packages/opencode-adapter/skills/feature-architecture](<../../packages/opencode-adapter/skills/feature-architecture/SKILL.md>)
- [packages/standard-adapter/skills/feature-architecture](<../../packages/standard-adapter/skills/feature-architecture/SKILL.md>)
- [.agents/skills/feature-architecture](<../../.agents/skills/feature-architecture/SKILL.md>)

### knowledge-capture

- [packages/codex-adapter/skills/knowledge-capture](<../../packages/codex-adapter/skills/knowledge-capture/SKILL.md>)
- [packages/dsh-adapter/skills/knowledge-capture](<../../packages/dsh-adapter/skills/knowledge-capture/SKILL.md>)

### knowledge-writer

- [packages/core/resources/knowledge-writer](<../../packages/core/resources/knowledge-writer/SKILL.md>)

### planning

- [shared/skills/planning](<../../shared/skills/planning/SKILL.md>)
- [packages/cindy-adapter/plugin/skills/planning](<../../packages/cindy-adapter/plugin/skills/planning/SKILL.md>)
- [packages/standard-adapter/skills/planning](<../../packages/standard-adapter/skills/planning/SKILL.md>)
- [packages/codex-adapter/skills/planning](<../../packages/codex-adapter/skills/planning/SKILL.md>)
- [packages/dsh-adapter/skills/planning](<../../packages/dsh-adapter/skills/planning/SKILL.md>)
- [packages/opencode-adapter/skills/planning](<../../packages/opencode-adapter/skills/planning/SKILL.md>)
- [.agents/skills/planning](<../../.agents/skills/planning/SKILL.md>)

### release-cindy-plugin

- [.agents/skills/release-cindy-plugin](<../../.agents/skills/release-cindy-plugin/SKILL.md>)

### release-claw-cli

- [.agents/skills/release-claw-cli](<../../.agents/skills/release-claw-cli/SKILL.md>)

### release-claw-kit

- [.agents/skills/release-claw-kit](<../../.agents/skills/release-claw-kit/SKILL.md>)
- [.claude/skills/release-claw-kit](<../../.claude/skills/release-claw-kit/SKILL.md>)

### release-codex-plugin

- [.agents/skills/release-codex-plugin](<../../.agents/skills/release-codex-plugin/SKILL.md>)

### release-dsh-plugin

- [.agents/skills/release-dsh-plugin](<../../.agents/skills/release-dsh-plugin/SKILL.md>)

### release-openclaw-plugin

- [.agents/skills/release-openclaw-plugin](<../../.agents/skills/release-openclaw-plugin/SKILL.md>)

### release-opencode-plugin

- [.agents/skills/release-opencode-plugin](<../../.agents/skills/release-opencode-plugin/SKILL.md>)

### researcher

- [packages/codex-adapter/skills/researcher](<../../packages/codex-adapter/skills/researcher/SKILL.md>)
- [packages/dsh-adapter/skills/researcher](<../../packages/dsh-adapter/skills/researcher/SKILL.md>)
- [packages/opencode-adapter/skills/researcher](<../../packages/opencode-adapter/skills/researcher/SKILL.md>)
- [packages/cindy-adapter/plugin/skills/researcher](<../../packages/cindy-adapter/plugin/skills/researcher/SKILL.md>)
- [packages/standard-adapter/skills/researcher](<../../packages/standard-adapter/skills/researcher/SKILL.md>)
- [.agents/skills/researcher](<../../.agents/skills/researcher/SKILL.md>)

### test-claw-kit

- [.agents/skills/test-claw-kit](<../../.agents/skills/test-claw-kit/SKILL.md>)

### update

- [packages/opencode-adapter/skills/update](<../../packages/opencode-adapter/skills/update/SKILL.md>)
- [packages/codex-adapter/skills/update](<../../packages/codex-adapter/skills/update/SKILL.md>)
- [packages/dsh-adapter/skills/update](<../../packages/dsh-adapter/skills/update/SKILL.md>)

### using-claw-kit

- [packages/opencode-adapter/skills/using-claw-kit](<../../packages/opencode-adapter/skills/using-claw-kit/SKILL.md>)
- [packages/cindy-adapter/plugin/skills/using-claw-kit](<../../packages/cindy-adapter/plugin/skills/using-claw-kit/SKILL.md>)
- [packages/standard-adapter/skills/using-claw-kit](<../../packages/standard-adapter/skills/using-claw-kit/SKILL.md>)
- [packages/dsh-adapter/skills/using-claw-kit](<../../packages/dsh-adapter/skills/using-claw-kit/SKILL.md>)
- [packages/codex-adapter/skills/using-claw-kit](<../../packages/codex-adapter/skills/using-claw-kit/SKILL.md>)
- [.agents/skills/using-claw-kit](<../../.agents/skills/using-claw-kit/SKILL.md>)
