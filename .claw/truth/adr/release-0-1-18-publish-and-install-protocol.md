# ADR: Release 0.1.18 publish and install protocol

## Status

Accepted

## Context

`release-0-1-18` 这个完成计划把一次正式发布收口成了可重复的发布协议。后续 `release-0-1-25` 又补上了一个更强的环境约束：发布流程不能假定宿主机已经提供可直接调用的 `npm` CLI，但仍然需要完成真实发布并验证最终安装烟测。`sync-latest-remote-and-publish-next-release` 这次完成计划继续把 release closeout 固化为正式协议：本地 release-guidance 工作先落成独立提交，再同步远端 `main`，并以“当前 merged HEAD 是否已经领先于已发布 artifact”来决定真实 release 目标版本。`release-0.1.33` 这次发布把 shared embedding cache / legacy `.claw/models` cleanup 作为正式 patch release 内容，再次验证了这条协议在本机刷新 CLI、同步 Codex plugin cache 和 registry 验证上的闭环。`release-0.1.34` 则再次把 workspace/package/plugin/changelog 版本对齐、双包发布顺序、安装烟测、CLI/plugin cache 刷新和 release commit 推送收口为同一条可复用的 closeout 协议。`release-0.1.39` 继续沿用这条协议，并把 researcher dispatch contract 的 host-light / wait-for-result 约束一并带入 release closeout 验证。`release-0.1.40` 又补上了一个更细的 closeout 现实约束：npm registry 传播可能短暂落后于 publish 成功时刻，因此本机 CLI 刷新需要允许“等版本可见后重试一次”，而本地 Codex plugin cache 仍继续用直接文件系统同步和逐文件 hash 校验来闭环。`release-0.1.47` 进一步确认：publish 输出里的 `bin[claw]` 归一化警告不能当作失败判据，真正的收口必须在 publish 后核对 registry metadata，再用本机全局安装解析、`claw --version` 和本地 Codex plugin cache manifest 版本做端到端验证。`release-0.1.48` 补充了 npm cache / propagation split-brain 处理：metadata 已可见但 tarball retrieval 报 `ETARGET` 时，先清理本地 npm cache 并重试 `npm pack`。`release-0.1.49` 则把 `workflowGuidance.delegateSubagents` wording patch 作为正式发布内容，并再次刷新全局 CLI 与本地 Codex plugin cache。`release-0.1.50` 继续沿用同一条 closeout 协议，但把默认 activation-task Goal Mode objective 修复作为 patch 发布内容，并把这轮真实发布、恢复与推送的失败边界固定下来：`@veewo/claw-core@0.1.50` 必须先于 `@veewo/claw@0.1.50` 发布，`@veewo/claw` 的依赖元数据必须锁定到 `@veewo/claw-core@0.1.50`，`scripts/install-cli.ps1` 超时后可以用 `npm install -g @veewo/claw@0.1.50 --no-audit --no-fund` 恢复本地 CLI，Codex plugin cache 刷新到 `0.1.50+codex.20260623210218` 后必须再核对源/缓存 hash 一致性，且 GitHub 推送在普通 TLS 路径失败时可以用 `git -c http.curloptResolve=github.com:443:140.82.112.4 push origin main` 作为一次性恢复路径。`release-next-version-and-refresh-local-installs` 这轮把这条协议推进到 `0.1.52`：先将本地工作区 rebased 到 `0.1.51` baseline，再把 root、`@veewo/claw-core`、`@veewo/claw`、`packages/openclaw-adapter`、`packages/opencode-adapter`、`packages/codex-adapter`、`package-lock.json` 和 `packages/codex-adapter/.codex-plugin/plugin.json` 一起对齐到 `0.1.52` / `0.1.52+codex.20260624215321`，并在发布后用本机 CLI 刷新和 Codex plugin cache 刷新把最终安装面收口。`0.1.53` 这一轮进一步把 release verification gate 固化为完整发布面验证：不仅要通过 `npm test` 和 `npm run check`，还要通过 Codex/OpenCode plugin bundle tests、两个包各自的 `npm pack --dry-run`，并在 publish 后直接核对 registry latest 与本地 Codex cache manifest 版本。`0.1.58` 还确认了一条更细的 closeout 分流：当本次发布要保留单独的自动更新验证窗口时，可以在 release closeout 中有意不执行本地 CLI / plugin cache 刷新，但仍必须完成双包 publish 与 registry verification，确保发布物本身已经可见且可核验。`0.1.68` 把 persistent embedding worker reuse、delayed task archival、direct `sessionKey -> planPath` binding、flat subplan storage 及其 Truth/ADR 合同作为同一个 patch release 交付，并验证 npm、`origin/main`、global CLI 与 active Codex official cache 全部收敛到目标版本。`0.1.69` 再次确认发布源顺序：所有 release-scoped 变更必须先提交并推送到 `origin/main`，随后才运行仓库 release verifier 和真实 npm publish；publish 的 `bin[claw]` normalization warning 仍以 registry `bin` 元数据和真实 `claw` 命令为最终判据。`0.1.86` 将此前的特殊分流提升为一般边界：release 在 GitHub source/tag、npm 双包、committed Codex marketplace payload 与 clean-worktree gate 收敛后完成，本机全局 CLI 和 installed plugin 的刷新由后续独立用户端 `update` workflow 负责。这些 release 共同定义了现在的正式发布/安装协议。

The completed template-version workflow closed a separate release drift gap: package and plugin versions could be aligned while skill-local `TEMPLATE.json` files or the built-in default still advertised an older CLI template contract. Because shared templates are later materialized into adapter payloads, correcting versions after shared-skill synchronization would duplicate work and make partial-copy mistakes easier to miss.

The repository also needs one maintainer entry that can execute the accepted release protocol and then hand off to the already host-specific Codex update contract. That final installation stage depends on Codex marketplace identity, source/cache, restart, and new-task evidence, so the combined orchestration is not host-neutral shared skill content.

## Decision

本文拥有仓库级 release / install 顺序、来源闸门、direct-`main` 交付与 closeout 条件。`@veewo/claw-core`、`@veewo/claw` 的包身份、依赖关系及 core-before-CLI 顺序由 `.claw/truth/adr/publish-claw-npm-package.md` 拥有；本文引用该顺序作为 release protocol 的前置决策，不另设 competing owner。

采用以下发布与安装顺序：

- 如果本地已经有尚未推送的 release guidance / truth 变更，先单独提交，再同步远端 `main`，避免把预发布文档调整和远端 release 基线混在同一个未提交工作区里
- 先同步远端 `main`，确认发布基线正确，再执行版本 bump
- 如果同步 `origin/main` 时在 workflow guidance、CLI tests、Codex adapter docs/skills 或 `.claw/truth/` 上发生冲突，合并结果必须同时保留远端更新和本地已经验证过的行为，再继续 release 流程
- 同步完成后，必须把 merged HEAD 与当前已发布 artifact 基线一起判断；如果 merged HEAD 已经领先于已发布版本，就直接把整条 workspace/package/plugin 版本线推进到下一个正式 release 目标，而不是沿用 merge 前的本地预期版本
- release version bump must include the complete current packaging surface: root/package-lock metadata, `@veewo/claw-core`, `@veewo/claw`, Codex/OpenClaw/OpenCode adapter package versions, CLI/OpenClaw dependency pins on `@veewo/claw-core`, and the Codex plugin manifest `semver+codex.<timestamp>` version
- Treat root `package.json.version` as the release authority for every plugin `TEMPLATE.json` and the built-in default template. Run the maintained `npm run sync:template-versions` updater before `npm run sync:shared-skills`, then use `npm run check:template-versions` as the read-only confirmation step.
- Publishing must never repair stale templates implicitly. `npm run verify:release` and `npm run publish:release` reuse the read-only assertion, report every stale path and expected version, and stop before shared-skill/publish readiness checks; this keeps generated changes reviewable and prevents a subset of adapter copies from becoming a release artifact.
- If that template compatibility gate creates a pre-release bootstrap cycle in which the currently published CLI cannot load the next-version workspace templates, release development may temporarily link the already-built workspace CLI/core into the global `claw` command. This exception is limited to preparing and validating the release source; after the target is visible in npm, restore the formal registry installation. It never authorizes installing the Codex plugin from unpublished workspace content.
- after version edits, run `npm install --package-lock-only --ignore-scripts` or equivalent lockfile regeneration before verification so package-lock metadata matches the target release line
- before publishing, commit the release-ready source state so registry artifacts can be traced back to one source commit; the commit should include the version bump, generated plugin metadata, release docs/truth/ADR residue, and release-scoped runtime fixes
- release verifier 与 `npm run publish:release` 只能在上述 release-ready commit 已推送、且本地 `main` 与 `origin/main` 精确一致后运行；不得先发布 artifact、再补推它的源码基线
- 发布验证遵循根 `AGENTS.md` 的比例化原则：先按具体改动风险选择 focused checks，再由 `npm run verify:release` / `npm run publish:release` 执行稳定的版本对齐、shared-skill 同步、committed marketplace payload、隔离 template smoke、clean worktree 与 exact `main == origin/main` gate；只有现实回归风险足以支撑成本时，才扩展到完整测试、全部 adapter bundle tests 或额外安装验证
- 当发布范围或风险要求检查真实 npm tarball 内容时，分别对 `@veewo/claw-core` 与 `@veewo/claw` 运行 `npm pack --dry-run`；不要仅为复制旧发布矩阵而机械运行与本轮风险无关的检查
- 双包发布保持固定顺序：先发 `@veewo/claw-core`，再发 `@veewo/claw`
- 在受管环境里，如果宿主机没有可直接调用的 `npm` CLI，也允许通过 bundled node、tar-based packaging 和 registry API 完成真实 publish
- 发布后的独立用户端 `update` workflow 在 Windows 上继续通过仓库支持的 `npm run install:local-cli` 路径刷新全局 CLI，并通过 official GitHub marketplace 刷新当前 Codex 安装面
- 如果 publish 刚完成时 `npm view @veewo/claw version` 还没看到新版本，release closeout 以 registry 传播状态为准；待新版本可见后再进入独立 `update` workflow，不把第一次本地安装拿到旧版本误判为 release 回滚
- `0.1.40` 曾在同一 closeout 中验证安装烟测：`npm view @veewo/claw-core version = 0.1.40`、`npm view @veewo/claw version = 0.1.40`、`claw --version = 0.1.40`，以及 `npm list -g @veewo/claw --depth=0` 解析到 `@veewo/claw@0.1.40`；当前协议将 CLI 与 plugin 安装验收移到发布后的独立 `update` workflow
- publish 输出里出现 `bin[claw]` normalization warning 时，closeout 仍以 `npm view @veewo/claw version`、`npm view @veewo/claw bin --json` 和实际 CLI/安装解析结果为准，不把该 warning 本身当作失败或回滚证据
- registry verification must cover both metadata and retrieval/install paths: `version` / `dist-tags.latest`, `bin` / `dependencies`, `dist.tarball` / `dist.integrity` / `dist.shasum`, plus an actual `npm pack` or install smoke before treating a publish as fully propagated
- 如果 `npm view @veewo/claw@<version> dist.tarball dist.integrity dist.shasum --json` 已返回新 tarball metadata，但本机 `npm pack` / install 仍报 `ETARGET`，先运行 `npm cache clean --force` 再重试；不要把本地 cache stale 误判为 publish 回滚
- 正式 publish 完成后，release 本身继续直接核对 registry `dist-tags.latest` / `version`、GitHub source/tag、committed marketplace payload 与 clean-worktree 状态；global CLI、active Codex identity、marketplace source/cache 和 restart/new-task loaded locator 属于随后独立 `update` workflow 的完成证据
- 如果 release round 包含 `workflowGuidance` wording 或 config 变更，release closeout 验证 source config、built `dist/workflow-guidance.config.json`、committed marketplace payload 与 registry package 携带同一合同；随后独立 `update` closeout 再验证 installed global CLI guidance output 与 official Codex plugin cache payload。`0.1.49` 曾在同一次历史 closeout 中验证关键句 `When dispatching a subagent, each entry is a required structured contract whose fields must be honored directly.`，不构成当前 release 必须刷新本机安装面的规则
- 独立 `update` 的 local runtime refresh verification 必须包含实际 Windows shim path、`claw --version`、`npm list -g @veewo/claw --depth=0`，以及证明 protocol repair 不会把 flat config 改回 legacy nested fields 的 repo-local `claw context` smoke check
- release closeout 的 done 条件不包括本机全局 `claw` CLI 或 installed Codex plugin 刷新；`scripts/publish-release.mjs` 在双包 publish 后提示调用 `claw-kit:update`，并明确禁止从未发布的 workspace content 安装
- 完整维护者编排由 Codex adapter 自有的 `release-claw-kit` skill/template 承担，而不是进入 `shared/skills`。其 8 个线性任务以 artifact release 和 published-source Codex update 为先后两个完成边界：第 6 个任务完成 GitHub/npm/committed-plugin release 验收后，第 7 至 8 个任务才复用 Codex update 合同；模板不设置 route choice，也不把本机安装证据提升为 release artifact 的完成条件。
- 后续 Codex update 验证必须 identity-aware：只允许 official `claw-kit@claw-kit`，并核对 official repository marketplace source、matching cache、所需 skill payload 与 restart/new-task loaded locator；cache 目录存在或较新但未启用不能作为 update completion 证据
- when adapter skills change, plugin cache verification should inspect both the manifest version and the expected skill files; `0.1.48` specifically required `skills/config/SKILL.md` to be present in the local Codex cache
- 如果 release round 同时包含 Codex workflow contract 变更，closeout 应把这些长期规则一并沉淀到 canonical truth；`0.1.39` 的新增规则是 researcher dispatch 前不要由 host 内联读取 search skill，且依赖 research 结果的主流程必须等待 `researcher` 返回
- `release-next-version-and-refresh-local-installs` 这轮把 release baseline 明确卡在 `0.1.51`，因此 `0.1.52` 的版本 bump 必须覆盖 root/package-lock metadata、`@veewo/claw-core`、`@veewo/claw`、Codex/OpenClaw/OpenCode adapter package versions、CLI/OpenClaw dependency pins on `@veewo/claw-core`，以及 `packages/codex-adapter/.codex-plugin/plugin.json` 的 `0.1.52+codex.20260624215321` 版本；发布后仍要验证 `npm test`、`npm run check`、`npm pack --dry-run`、`claw --version`、`npm list -g @veewo/claw --depth=0` 和本地 Codex plugin cache 的实际刷新结果
- `0.1.58` 的 auto-update 特例是 release / update 分离的历史前身；从 `0.1.86` 起，本地 CLI 与 plugin refresh 一般性地属于发布后的独立用户端 workflow，release 本身仍必须完成 GitHub source/tag、双包 publish、registry verification、committed Codex payload 与 clean-worktree 收敛
- 发布完成后删除本机临时 `npm token` 配置

## Consequences

- 发布链路变成先验证、后发布，降低把未验证状态直接推向 npm 的风险
- release sync 前的本地提交把“准备发布的本地 guidance 调整”和“从远端吸收最新基线”拆成两段，后续排查 merge 或回滚时更容易定位
- release sync 冲突的处理原则被固定下来：workflow guidance、测试、适配器文档/技能和 truth 文档都要以“保留远端更新 + 保留本地已验证行为”为准，而不是机械偏向单边版本
- release 目标版本不再只看本地预期，而是以 merged HEAD 相对已发布 registry artifact 的领先程度来决定
- `@veewo/claw-core` 与 `@veewo/claw` 的先后顺序被固定，避免依赖链倒置
- 正式发布不再被“PATH 上必须已有 npm CLI”这个宿主前提卡死，release automation 在更受限的 managed environment 里仍然可行
- Windows 本地安装路径保持可重复执行，不需要依赖真实发布来完成日常使用
- npm registry 的短暂传播延迟被正式纳入 closeout 协议，因此“publish 已成功但第一次本地安装仍拿到旧版本”不再会被误判成 release 回滚或安装脚本损坏
- 安装烟测成为独立 `update` closeout 的必选项，避免 registry 成功被误写为操作者机器已经采用新版本
- canonical release gate 固定验证 committed Codex marketplace payload 与隔离 template smoke；完整 plugin bundle tests 和双包 dry-run 由本轮具体风险决定是否追加
- Template compatibility now advances as one release surface: source templates are updated once before materialization, while the release gate remains side-effect free and exposes exact stale owners for correction.
- The temporary workspace CLI link breaks a release-development bootstrap cycle without weakening the published-source boundary: it is reversible, version-scoped, and must be replaced by the registry install before the machine is treated as updated.
- release 与本机 update 形成有序的两个完成边界：release 证明 GitHub、npm 与 committed Codex payload 可交付；随后 `claw-kit:update` 证明操作者机器的 CLI、official identity、source/cache 与新任务 loaded locator 已采用该发布
- `release-claw-kit` 为 Codex 维护者提供一个可重复入口，同时通过任务边界而不是合并验收条件来串联 release 与 update；其他 host 若需要同类编排，必须拥有自己的安装阶段，而不能复用 Codex marketplace 细节。
- active identity 与 source/cache 一致性只在 update 完成态中作为安装证据，避免把本机缓存状态误写成 registry/GitHub release 的必要条件
- workflowGuidance wording patch 不能只停在源码层；release state 要证明 committed marketplace payload 与 registry package 携带同一合同，随后 update state 再证明 global CLI 和 official plugin cache 已采用该合同
- plugin cache 的 direct filesystem sync 范围被继续固定下来，后续 closeout 可以明确判断“缓存没刷新”与“缓存目录已切换但 payload 不一致”这两类不同故障
- 0.1.50 这轮把真实 publish / restore / push 的失败恢复边界也固定了：core 先发、CLI 后发，helper 安装脚本超时后用显式 global npm install 恢复 `claw`，GitHub 连接异常时可用 `http.curloptResolve` 作为一次性 push 恢复手段
- `release-next-version-and-refresh-local-installs` 这轮验证后，`0.1.52` 的本机刷新结果是 `scripts/install-cli.ps1` 完成、`claw --version = 0.1.52`、`Get-Command claw` 解析到 `C:\nvm4w\nodejs\claw.ps1`，并且本地 Codex plugin cache 刷新到 `C:\Users\chany\.codex\plugins\cache\claw-kit-local\claw-kit\0.1.52+codex.20260624215321`
- 0.1.58 的“先发布并核验 registry，再独立刷新”最初只服务 auto-update 验证；0.1.86 将其收敛为一般协议，因此任何 release 都不再以本机 CLI / plugin cache 已刷新作为完成条件
- researcher dispatch contract 进入 release closeout 事实后，未来 release 不会只验证 artifact 版本，还会同时复核与发布一起交付的长期 workflow 规则
- 发布后清理 token 让本机环境回到更安全的状态

`0.1.64` closeout 已完成并验证 npm 双包、GitHub Release、全局 CLI，以及 Codex active marketplace source 与 versioned cache。当时提出的 truth `{ dispatch: "when_reusable_truth_confirmed" }` 与 ADR `{ dispatch: "required" }` 后续曾实现，但现已由 hook-owned two-phase finalization 取代；这里只保留为该 release 的版本化历史证据。

<!-- state: history -->
## Decision evolution

<!-- dated: 2026-07-20 -->
### 0.1.87 template-version bootstrap exception

The `0.1.87` release was the first recorded use of the narrow workspace-link exception after template versions became a CLI compatibility gate. The global `claw` command temporarily used the built workspace CLI/core so next-version templates could be processed, then returned to the formal `@veewo/claw@0.1.87` npm installation after registry publication. The Codex marketplace payload remained committed GitHub content and was not refreshed from the workspace.

## Related code

- `DISTRIBUTION.md`
- `packages/codex-adapter/skills/release-claw-kit/SKILL.md`
- `packages/codex-adapter/skills/release-claw-kit/TEMPLATE.json`
- `packages/codex-adapter/skills/release-claw-kit/references/release-protocol.md`
- `docs/2026-06-08-closeout-workflow.md`
- `scripts/install-cli.ps1`
- `scripts/update-template-versions.mjs`
- `packages/core/src/templates/plans/default.ts`
- `package.json`
- `packages/core/package.json`
- `packages/cli/package.json`
- `packages/codex-adapter/package.json`
- `packages/openclaw-adapter/package.json`
- `packages/opencode-adapter/package.json`
- `packages/codex-adapter/.codex-plugin/plugin.json`
- `packages/codex-adapter/skills/researcher/SKILL.md`
- `packages/codex-adapter/references/codex-subagent-dispatch.md`
- `packages/codex-adapter/hooks/subagent-contract.test.mjs`
- `.claw/archive/tasks/release-0-1-18/plan.json`
- `.claw/archive/tasks/sync-latest-remote-and-publish-next-release/plan.json`
- `.claw/archive/tasks/release-next-version-and-refresh-local-installs/plan.json`
- `.claw/archive/tasks/release-next-version-and-refresh-local-installs/meta.json`
- `.claw/tasks/发布新版本并刷新-Codex-插件/plan.json`
- `.claw/tasks/release-workflow-toggles-and-refresh-local-plugin/plan.json`
- `.claw/tasks/Publish-claw-kit-release-and-refresh-local-Codex-plugin/plan.json`
- `.claw/tasks/发布新版本并更新本地安装/plan.json`

## Search Terms

- `release-0-1-18`
- `release-0.1.39`
- `release-0.1.40`
- `release-0.1.49`
- `release-0.1.50`
- `release-next-version-and-refresh-local-installs`
- `0.1.52`
- `0.1.52+codex.20260624215321`
- `@veewo/claw-core`
- `@veewo/claw`
- `npm run install:local-cli`
- `claw --version`
- `0.1.40+codex.20260616130425`
- `plugin cache refresh`
- `delegateSubagents`
- `required structured contract`
- `workflowGuidance.config.json`
- `registry propagation`
- `do not read the search skill inline`
- `wait for the result`
- `bin[claw] normalization warning`
- `dist-tags.latest`
- `dist.tarball`
- `dist.integrity`
- `dist.shasum`
- `npm pack`
- `npm cache clean --force`
- `ETARGET`
- `0.1.68`
- `0.1.69`
- `release-ready commit pushed before publish`
- `active Codex identity`
- `official marketplace cache`
- `sync:template-versions`
- `check:template-versions`
- `release-claw-kit`
- `Codex-owned release template`
- `artifact release before published-source update`
