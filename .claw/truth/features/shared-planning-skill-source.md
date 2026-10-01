# Shared Skill Sources

## 状态

这是 `claw-kit` 当前 host-neutral skill 维护方式的稳定事实。

<!-- state: current -->
## 核心事实

- 七个项目可发现公共整包以 [.agents/skills](<../../../.agents/skills/>) 为单一源码：planning、config、create-claw-skill、feature-architecture、researcher、using-claw-kit、claw-kit-doc；它不是生成镜像。
- 手动 knowledge-capture 保持 [独立共享包](<../../../shared/skills/knowledge-capture/>)；update 仍由各 adapter 独立拥有。Core 内部 delegate/writer 与仓库维护技能不进入公共包，外部治理只来自显式 knowledgeWriter.externalSkills。
- 文档入口、完整语料与格式规范共同位于 [claw-kit-doc](<../../../.agents/skills/claw-kit-doc/>)；Core 仅在构建 dist 时复制知识格式，不反写内部源码。
- 六宿主 skill-inputs.json 声明整包依赖，由 [catalog/assembler](<../../../scripts/skill-artifacts.mjs>) 解析。Codex/DSH 各九包、OpenCode 八包、standard 七包、Cindy 六包但仍只有四项 manifest 注册、OpenClaw 仅文档；集合不同不允许裁剪包内任何 host reference、template、fallback 或 runner。
- 所有整包逐字节复制到隔离 artifact 的平铺 skills/。没有生成 banner 或 adapter 源码镜像；旧 sync 命令明确失败，不能用来恢复源目录副本。输出只能在源码之外或 ignored dist 内；拒绝源码重叠、未知 id、符号链接和陈旧 skills 树，源 hash 变化使候选失败。
- 完整 exporter 使用原 manifest、hooks、loader、模板发现与 runtime API；失败保留旧有效产物或要求全新输出。DSH 导出和 npm pack 使用同一隔离 stage；OpenCode 的安装发现副本仍是安装产物，而不是 authoring source。
- Git marketplace 必须发布组装后的自包含树，不能发布缺 skill 的原 adapter 源目录。Codex 保留 .agents/plugins/marketplace.json → packages/codex-adapter 布局及原 ./skills/、$PLUGIN_ROOT/scripts 合同；没有采用根插件迁移或 Core 模板发现扩展。发布目标/ref 须另获授权。
- Cindy 源码与 artifact 远端的归属由 [发布 Truth](<artifact-specific-plugin-release-and-cindy-update.md>) 拥有；宿主身份与入口顺序由 [startup Truth](<platform-skill-startup-gating.md>) 拥有，分发目标不决定执行宿主。
- feature-architecture 仅在已有 active task 时把报告保存到该 task 并注册 plan reference；没有 active task 时返回紧凑设计，不创建报告文件或 reference。
- 共享后的 `planning` skill 保持宿主无关：它只描述如何产出高质量 plan 内容，不承担 claw-kit runtime、project-plan admission、status 语义、writer dispatch、goal mode 或 closeout 规则。
- `planning` 不以预设 task 数量作为拆分目标。当前拆分边界是可验收的进度检查点：检查点完成后，后续工作应能继续执行，或该阶段能被独立重试；文件、命令、文档、测试、构建、检查和 review 默认保留在同一 task 内，除非它们本身形成有意义的检查点。
- 当现有证据不足以可靠确定后续步骤时，`planning` 只规划到决定路线的检查点，并在该检查点完成后用其证据进行第二次规划、追加下一批可执行 tasks；不得为了让初始计划显得完整而虚构推测性的后续 tasks。
- `planning` handoff 在当前阶段 requirements、solution 与 task list 已清楚且 material open questions 已解决时成立。用户已经指定 solution，或既有 workflow / 可用证据已把路线充分确定时，可以直接继续而不重复确认；否则必须先让用户看到 decision-relevant content，并且只有 solution 引入 meaningful choice 时才等待回应。若实施路线依赖尚未取得的证据，就把决定路线的检查点及其后续 planning task 作为当前阶段 solution，而不是猜测下游实现方案。
- `planning` 的文案所有权已收敛：`Planning principles` 只承载规划过程与任务拆分规则；`Quality bar` 单独拥有“好计划需要传达什么”的标准，包括当前阶段目标与决策逻辑、拆分理由与先后顺序、范围与非目标、受控风险与延后事项、可观察的 task/round 完成条件以及可交接性。不得再在开头用独立 `A good plan should answer` 清单重复这些标准。
- `planning` 不定义强制的实施后 `user-review` task、同一 plan 的跨轮反馈循环或独立 review lifecycle。若可预见任务会反复修改，当前 `How to write` 规则会询问用户是否要在 closeout 前增加一个最终 `manual-review` task，并且只在用户明确请求时追加；这是 opt-in 的 task-shape guidance，不是默认 lifecycle stage。执行前的当前阶段 solution discussion 仍由 default planning bridge 与 shared planning 合同共同承担。
- `planning` 不承载 `claw-kit` 仓库专属的比例化 TDD 政策；`.agents/skills/planning/SKILL.md` 及 Codex/OpenCode 物化副本都不应包含该规则，避免把仓库开发约束传播给插件使用方的其他项目。
- 当前仓库比例化验证与测试政策由根目录 `AGENTS.md` 承载：验证不应重于其保护的执行，只有明确且现实的高成本回归风险才能证明额外成本合理；成本判断覆盖选择、编写、运行、排障和维护 checks 的总成本。低风险改动使用最轻可信验证；纯文档或其他不可执行变更、高频变化或合同未稳定的区域优先使用审阅、结构检查、smoke、探针或定向手工验证；高风险稳定行为、已复现缺陷、关键边界和兼容合同优先使用针对性自动化测试。
- ADR 保存稳定决策、理由和取舍，防止未来修改静默逆转设计意图；它与行为回归测试互补，但不会机械触发文档测试，也不能替代高风险运行时行为所需的测试。上述当前 owner 边界由本文拥有，迁移到仓库 `AGENTS.md` 的决策及其取舍由 `.claw/truth/adr/workflow-cost-optimization-route.md` 拥有。
- 共享后的 `config` skill 保持宿主无关：它只描述配置入口、team-vs-personal scope 判断、canonical field shape 和 override 格式，不承担 claw-kit lifecycle 或 writer dispatch。
- 共享后的 `create-claw-skill` skill 保持宿主无关：它只负责把既有 skill 或用户想法转换成 claw-template-backed skill，不承担 claw-kit runtime、project-plan admission、status 语义、writer dispatch、goal mode 或 closeout 规则。
- 为了避免把试验性产物误固化成长期合同，`brainstorming` 和 `systematic-debugging` 这类在创建 `create-claw-skill` 过程中生成的测试 skill 树不应作为正式 shared skills/templates 保留在仓库里；它们不属于公共 artifact 输入声明，除非未来被明确重新晋升。
- claw-kit 运行时共同语义由 `.agents/skills/using-claw-kit/` 拥有，邻接 host references 承载具体执行路由；按活动 adapter 与实际工具选路，不能从模型名称或 workspace 副本推断 host。project-plan versus direct-work 不回流到 planning skill。

## 影响

- 以后修改 planning skill 时，只需要编辑 `.agents/skills/planning/SKILL.md`，不应再分别修改 codex 和 opencode 两份副本。
- 以后修改 config skill 时，只需要编辑 `.agents/skills/config/SKILL.md`，不应再分别修改 codex 和 opencode 两份副本。
- 以后修改 create-claw-skill skill 时，只需要编辑 `.agents/skills/create-claw-skill/SKILL.md`，不应再分别修改 codex 和 opencode 两份副本。
- 修改共享技能时编辑完整 canonical package，再组装声明目标；不得编辑生成副本形成分叉。角色委派细节由 [DSH delegation Truth](<dsh-subagent-delegation-contract.md>) 拥有；手动 capture 语义由 [manual capture Truth](<codex-manual-knowledge-capture.md>) 拥有。
- 文档入口、语料与相邻资源共同编辑 `.agents/skills/claw-kit-doc/`。宿主 update 的安装与激活仍由各自 adapter package 拥有。
- 以后修改自动 knowledge finalization 的 delegate 或 built-in governance contract，应编辑 `packages/core/resources/`，而不是在 `shared/skills` 或 adapter `skills/` 中恢复公开 writer package。
- planning 只拥有规划质量；调整 project-plan admission 或运行时规则应修改 shared `using-claw-kit` 及其相应 host reference，而不是在每个生成入口独立修补。
- planning 的任务质量检查应审阅检查点是否可验收、是否支持后续继续或独立重试，以及证据依赖的后续阶段是否被延迟到第二次规划；不应以 task 数量是否落在某个范围内作为质量标准。
- 2026-07-19 的只读质量 review 在当时的 planning 文案中发现四项缺口：三处强制确认 `proposed solution` 与证据依赖的阶段性规划冲突；复杂前向场景仍在 planning task 之后预建实现、Windows 验证和文档 tasks；简单 CLI 错误消息场景把没有独立检查点价值的包级验证拆开；`## When to use` 与多个质量章节存在重复。该 review 同时确认结构与分发同步健康，这些结论只描述 review 当时的源码和场景结果。
- 当前 working tree 已用更晚的 shared planning 文案取代上述 skill 内缺口：handoff 先判断 solution 是否由用户、既有 workflow 或证据充分确定；只有需要采用另一条且包含 meaningful choice 的路线时才等待用户回应。证据依赖场景把决定路线的 checkpoint 及其后续 planning task 作为当前阶段 solution，不猜测最终实现方案。planning task 是初始 task list 的末端边界，依赖未知证据的 implementation、validation、documentation 或 closure tasks 必须等它运行后再追加；支持性 validation 默认留在同一 outcome task，只有形成独立 gate、ownership、retry 或 materially different risk 价值时才拆分；可预见反复修改时只询问是否增加 final `manual-review` task，并且只在用户请求时增加；trigger 已收敛进 frontmatter，重复章节已合并。该 planning 合同由完整 canonical package 统一拥有。
- `packages/core/src/templates/plans/default.ts` 现在先区分 action instruction 与 open-ended discussion，使用 effective planning skill 澄清 requirements 并准备 task list，再应用同一 decision-relevant-content / meaningful-choice gate。该 lifecycle bridge 的当前实现由 `.claw/truth/features/cli-guided-workflow.md` 拥有；本文拥有 evidence-dependent checkpoint route 如何满足 planning handoff 的 shared quality contract。
- 本次 knowledge pass 只做了实现锚点与后续 diff 的只读 freshness check，没有重跑前向场景；因此可以确认当前文本合同已覆盖 review 建议，但不能把旧场景结果提升为对新文案行为效果的重新验证。
- `Add optional manual review planning guidance` 的 completed closeout 记录了 planning-only 定向同步、精确文本检查与 diff 检查通过，并明确没有运行完整测试套件；该次文本检查只证明当时的共享源及物化副本含同一句 opt-in 规则，不把该结果扩大为未执行的全量验证。
- shared planning 不应重新加入仓库专属的 TDD admission policy；在本仓库内规划开发工作时由根 `AGENTS.md` 提供比例化测试约束，插件使用方的其他项目不会从 shared planning skill 继承该政策。
- config 文案提供明确配置入口：先判断 shared team config 还是 personal local override，再使用当前扁平 canonical field shape。
- create-claw-skill 文案继续承担模板化转换入口：如果未来要调整转换流程或 fallback 语义，先改 canonical package，再由 artifact assembler 交付完整安装包。
- 生成型测试 skill 默认不进入公共 artifact 声明；如果未来要重新引入 `brainstorming` 或 `systematic-debugging`，应先明确它们是否要晋升为正式 shared skills/templates，再决定是否纳入产物声明。
- 源提交、组装产物提交与 activated host version 是三个独立证据边界；本次迁移没有发布、安装、push 或 live-host E2E。

## 执行与验证边界

- DSH workflow 只经 `claw_run`，Codex context/mutation 走固定 driver 而只读 search 不走 mutation driver；Cindy/OpenCode 保留各自原生 transport 和 handoff，standard 只在无 native adapter 时使用。具体协议由 shared host references 拥有，不能将 shell 示例当作 native failure 的旁路。
- `using-claw-kit` 的 DSH reference 明确披露 automatic main-agent prepare/complete transport 缺口；该重构没有补齐 runtime，也没有声称发布、安装或 live external-host E2E。
- 验证应覆盖矩阵隔离、完整资源、pin、bridge 与授权边界，不冻结整段技能措辞或固定提及次数。产物检查通过只证明所声明目标，不能代替宿主激活证据。

## 证据

- [源码与产物合同](<../../../docs/public-skill-sources.md>)
- [隔离 assembler](<../../../scripts/skill-artifacts.mjs>)、[host exporters](<../../../scripts/host-plugin-artifacts.mjs>)
- [canonical planning](<../../../.agents/skills/planning/SKILL.md>)、[host routes](<../../../.agents/skills/using-claw-kit/references/hosts/>)
- [Core governance](<../../../packages/core/resources/knowledge-writer/>)

<!-- state: history -->
## 演化历史

<!-- dated: 2026-10-01 -->
### 源码镜像改为隔离产物组装

此前 shared/skills 与独立文档语料经 sync 写回 adapter，Codex 依赖源码仓 committed 物化目录。现在整包源码提升到项目发现根、文档并包，Git 分发通过隔离组装树保持原安装布局。旧 sync-back 与根插件迁移均不再是维护路线；此变更不等于远端已发布或宿主已激活。

<!-- dated: 2026-10-01 -->
### 从四技能共享源扩展为公共整包与显式 host 路由

早期只有四个技能进入共享列表，researcher、using-claw-kit 与文档入口保留 adapter-local ownership。当前实现扩展到八个整包并纳入 standard/项目发现面，同时显式隔离 Cindy vendoring。该变化落实了同日审查的公共技能建议，但没有把 Core 内部或维护技能公开，也不意味着审查中的所有 runtime follow-up 已解决。

<!-- dated: 2026-07-16 -->
### 0.1.66 repository marketplace 与 committed materialization

#### 官方 marketplace 命令面

- 当前官方 Codex manual 规定 `codex plugin marketplace add` 可接收 GitHub shorthand、Git URL、SSH URL 或本地 marketplace root。
- `--ref` 用于固定 Git ref；可重复的 `--sparse` 用于控制 Git-backed marketplace 的 sparse checkout。
- `codex plugin marketplace list` 用于报告已配置 marketplace snapshot 及其 resolved root，排查安装来源时应以该输出确认实际解析结果。

#### claw-kit 的仓库安装合同

- 仓库 marketplace manifest 位于 `.agents/plugins/marketplace.json`。每个 plugin 的 `source.path` 必须以 `./` 开头，并相对于 marketplace root 解析。
- claw-kit entry 的 `source.path` 是 `./packages/codex-adapter`，因此 repository marketplace 直接安装 Git 中已提交的 Codex adapter payload。
- `shared/skills/planning/`、`shared/skills/config/`、`shared/skills/create-claw-skill/` 与 `shared/skills/knowledge-writer/` 是当前 authoring sources。`scripts/sync-shared-skills.mjs` 将这些目录的完整文件物化到两个 adapter；`update` 是明确的 adapter-owned exception，不带 shared source banner。
- Repository marketplace 安装不依赖 npm lifecycle，也不依赖安装时或 build 时临时生成 shared skills；安装输入是 Git 中已提交且已经物化的 `packages/codex-adapter` 树。
- GitHub Release ZIP 是同一 adapter payload 的衍生副本，不参与 repository marketplace 安装链路。只有明确要求 offline/manual artifact policy 时，才需要把 ZIP 作为额外必需分发面。

#### Sparse checkout 边界

- 只 sparse checkout `.agents/plugins` 不足以安装 claw-kit，因为 manifest 的 `source.path` 指向该目录之外的 `packages/codex-adapter`。
- 对 claw-kit 应优先使用完整 checkout；若必须 sparse checkout，则至少同时包含 `.agents/plugins` 与 `packages/codex-adapter`，保证 source path 能在 resolved marketplace root 下命中真实插件树。

#### 0.1.66 验证基线

- `v0.1.66` Git tree 同时包含 `.agents/plugins/marketplace.json` 与四个 shared skills 在 `packages/codex-adapter/skills/` 下的全部物化文件和资源。
- `verifySharedSkillsSynced(...)` 返回 `{ok:true,problems:[]}`。
- `scripts/publish-release.mjs` 在 release 前要求 Codex adapter 物化内容与 shared sources 一致，漂移或缺失会阻止发布。
- `npm run test:codex-plugin` 通过 `11/11`，覆盖 materialized source、marketplace target、cache copy 与 exported bundle。

#### 关联代码

- marketplace manifest：`.agents/plugins/marketplace.json`
- shared authoring sources：`shared/skills/planning/`、`shared/skills/config/`、`shared/skills/create-claw-skill/`、`shared/skills/knowledge-writer/`
- host-specific update sources：`packages/codex-adapter/skills/update/`、`packages/opencode-adapter/skills/update/`
- materialization：`scripts/sync-shared-skills.mjs`
- committed Codex marketplace payload：`packages/codex-adapter/`
- release gate：`scripts/publish-release.mjs`
- Codex bundle tests：`scripts/codex-plugin-bundle.test.mjs`

#### 补充检索词

- `codex plugin marketplace add --ref --sparse`
- `marketplace list resolved root`
- `repository marketplace committed materialization`
- `verifySharedSkillsSynced 0.1.66`
- `release ZIP derivative payload`

<!-- dated: 2026-07-16 -->
### 0.1.67 asset-free marketplace 发布合同

#### 结论

- `scripts/publish-release.mjs` 现在直接验证 committed `HEAD` 中的 `.agents/plugins/marketplace.json`、`packages/codex-adapter/.codex-plugin/plugin.json` 以及必需的 adapter skill / resource paths。通过验证的 committed repository marketplace snapshot 就是 Codex release artifact，不要求附加 GitHub Release ZIP。
- `DISTRIBUTION.md`、`README.md`、`CHANGELOG.md` 与 Codex bundle contract tests 共同定义这条 asset-free Git marketplace release protocol；发布验收不应再把 ZIP asset 数量或 ZIP 上传作为成功条件。
- Repository URL 安装会执行真实 Git clone。`0.1.67` 的完整 Git marketplace clone 在当前仓库上约耗时四分钟，因此安装时间不能被误判为 metadata-only manifest fetch。
- Metadata-only sparse checkout 仍无效：`.agents/plugins/marketplace.json` 的 `source.path` 指向 `packages/codex-adapter`。完整 checkout 是默认安全路径；使用 sparse checkout 时必须同时覆盖 marketplace manifest 与 adapter source tree。

#### 验证标准

- Release source commit 必须先位于 `origin/main`，再运行 `npm run verify:release` / publish 流程。
- Release gate 必须从 committed `HEAD` 验证 marketplace manifest、plugin manifest 和 adapter resources，而不是依赖工作树临时生成物。
- Codex bundle contract tests 必须覆盖 repository marketplace target 与 committed materialization；`0.1.67` 基线为 `12/12`。
- 真实用户路径至少验证 `codex plugin marketplace add chanyuenpang/claw-kit --ref main` 与 `codex plugin add claw-kit@claw-kit`，并核对 active identity 的 marketplace snapshot manifest 与 official cache manifest 版本一致。

#### 关联代码与文档

- repository marketplace：`.agents/plugins/marketplace.json`
- committed plugin manifest：`packages/codex-adapter/.codex-plugin/plugin.json`
- committed adapter payload：`packages/codex-adapter/`
- release gate：`scripts/publish-release.mjs`
- bundle contract tests：`scripts/codex-plugin-bundle.test.mjs`
- distribution contract：`DISTRIBUTION.md`
- user installation contract：`README.md`
- release history：`CHANGELOG.md`

#### 补充检索词

- `0.1.67 asset-free Git marketplace`
- `committed HEAD marketplace snapshot`
- `GitHub Release zero assets`
- `repository clone four minutes`
- `claw-kit@claw-kit official identity`

<!-- dated: 2026-07-30 -->
### 0.2.2.1 Codex-only marketplace 发布完成态

#### 结论

- Codex adapter package 与 committed plugin manifest 已对齐到 `0.2.2.1`。release commit `71aee20c4d1c32cc61b64012949ae596ae93ae67` 直接交付到 `origin/main`，并由不可变标签 `vcodex-0.2.2.1` 与正式 GitHub Release 标识。
- 该轮严格走 Codex artifact rule：GitHub Release 没有 ZIP 资产，也没有发布 npm 包；交付物仍是标签提交中通过门禁的 `packages/codex-adapter` marketplace snapshot。
- 该 revision 的完成报告记录 template version 检查、shared-skill 同步测试 `4/4`、全仓 `npm run check`、Codex bundle 测试 `18/18`、staged diff 检查和 guarded `verify:release` 均通过。完成边界内 `main`、`origin/main` 与标签提交一致，工作树为空；这些是该 revision 的版本化证据，不构成后续发布的固定验证矩阵。
- 本轮没有刷新维护者本机安装，因为 Codex artifact rule 只在明确请求时进入 published-source update。已发布的 `0.2.2.1` 不能单独证明 active marketplace identity、cache 或新任务运行时已经采用该版本。

#### 关联代码与检索词

- adapter package：`packages/codex-adapter/package.json`
- committed manifest：`packages/codex-adapter/.codex-plugin/plugin.json`
- marketplace source：`.agents/plugins/marketplace.json`
- release rule：`.agents/skills/release-claw-kit/rules/codex.md`
- `vcodex-0.2.2.1`
- `71aee20c4d1c32cc61b64012949ae596ae93ae67`

<!-- dated: 2026-10-01 -->
### 公共技能统一审查：覆盖边界与未采纳的迁移建议

- [2026-10-01 技能审查](<../../../docs/reviews/2026-10-01-claw-skills-review.md>) 盘点了当时的 20 个 claw-kit 自有技能家族、63 个源入口：9 个公共家族、2 个 Core 内部家族、9 个仓库维护家族。数量是该轮源文件审查快照，不是当前公开技能数量；其他项目/个人技能、历史 dist 和已安装副本不在覆盖内。
- 该轮确认了一个重复审查陷阱：shared 同步检查与模板检查通过，只能证明其声明目标和扫描根内的一致性，不能外推到所有宿主、本地副本、完整相邻资源或运行时语义。报告记录了 source frontmatter 检查和有限矩阵检查，但没有执行被审技能、安装、发布或跨宿主实时 E2E；静态合同冲突不等于线上故障已复现。
- 审查建议统一公共技能的语义 owner 与整包维护源，同时保留宿主执行、委派、发现、安装和收尾边界；优先候选为 researcher、feature-architecture 与手动 knowledge-capture。上述内容是迁移提案，不是重构完成或统一方案获批的证据，不能据此把 Core 内部治理或仓库维护技能加入公共包。
- 本次审查没有替换既有 [shared-source 决策](<../adr/shared-planning-skill-source.md>) 或 [host-specific update ownership](<../adr/host-specific-update-skill-ownership.md>)。后续落地应重新核对实际宿主工具和当前实现；报告中的缺陷清单及迁移顺序保留为日期限定的调查入口，而非未经 freshness check 的当前行为声明。
