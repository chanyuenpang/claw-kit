# ADR: Release 0.1.18 publish and install protocol

## Status

Accepted

## Context

`release-0-1-18` 这个完成计划把一次正式发布收口成了可重复的发布协议。后续 `release-0-1-25` 又补上了一个更强的环境约束：发布流程不能假定宿主机已经提供可直接调用的 `npm` CLI，但仍然需要完成真实发布并验证最终安装烟测。`sync-latest-remote-and-publish-next-release` 这次完成计划继续把 release closeout 固化为正式协议：本地 release-guidance 工作先落成独立提交，再同步远端 `main`，并以“当前 merged HEAD 是否已经领先于已发布 artifact”来决定真实 release 目标版本。`release-0.1.33` 这次发布把 shared embedding cache / legacy `.claw/models` cleanup 作为正式 patch release 内容，再次验证了这条协议在本机刷新 CLI、同步 Codex plugin cache 和 registry 验证上的闭环。`release-0.1.34` 则再次把 workspace/package/plugin/changelog 版本对齐、双包发布顺序、安装烟测、CLI/plugin cache 刷新和 release commit 推送收口为同一条可复用的 closeout 协议。`release-0.1.39` 继续沿用这条协议，并把 researcher dispatch contract 的 host-light / wait-for-result 约束一并带入 release closeout 验证。`release-0.1.40` 又补上了一个更细的 closeout 现实约束：npm registry 传播可能短暂落后于 publish 成功时刻，因此本机 CLI 刷新需要允许“等版本可见后重试一次”，而本地 Codex plugin cache 仍继续用直接文件系统同步和逐文件 hash 校验来闭环。`release-0.1.47` 进一步确认：publish 输出里的 `bin[claw]` 归一化警告不能当作失败判据，真正的收口必须在 publish 后核对 registry metadata，再用本机全局安装解析、`claw --version` 和本地 Codex plugin cache manifest 版本做端到端验证。`release-0.1.48` 补充了 npm cache / propagation split-brain 处理：metadata 已可见但 tarball retrieval 报 `ETARGET` 时，先清理本地 npm cache 并重试 `npm pack`。`release-0.1.49` 则把 `workflowGuidance.delegateSubagents` wording patch 作为正式发布内容，并再次刷新全局 CLI 与本地 Codex plugin cache。`release-0.1.50` 继续沿用同一条 closeout 协议，但把默认 activation-task Goal Mode objective 修复作为 patch 发布内容，并把这轮真实发布、恢复与推送的失败边界固定下来：`@veewo/claw-core@0.1.50` 必须先于 `@veewo/claw@0.1.50` 发布，`@veewo/claw` 的依赖元数据必须锁定到 `@veewo/claw-core@0.1.50`，`scripts/install-cli.ps1` 超时后可以用 `npm install -g @veewo/claw@0.1.50 --no-audit --no-fund` 恢复本地 CLI，Codex plugin cache 刷新到 `0.1.50+codex.20260623210218` 后必须再核对源/缓存 hash 一致性，且 GitHub 推送在普通 TLS 路径失败时可以用 `git -c http.curloptResolve=github.com:443:140.82.112.4 push origin main` 作为一次性恢复路径。`release-next-version-and-refresh-local-installs` 这轮把这条协议推进到 `0.1.52`：先将本地工作区 rebased 到 `0.1.51` baseline，再把 root、`@veewo/claw-core`、`@veewo/claw`、`packages/openclaw-adapter`、`packages/opencode-adapter`、`packages/codex-adapter`、`package-lock.json` 和 `packages/codex-adapter/.codex-plugin/plugin.json` 一起对齐到 `0.1.52` / `0.1.52+codex.20260624215321`，并在发布后用本机 CLI 刷新和 Codex plugin cache 刷新把最终安装面收口。`0.1.53` 这一轮进一步把 release verification gate 固化为完整发布面验证：不仅要通过 `npm test` 和 `npm run check`，还要通过 Codex/OpenCode plugin bundle tests、两个包各自的 `npm pack --dry-run`，并在 publish 后直接核对 registry latest 与本地 Codex cache manifest 版本。这些 release 共同定义了现在的正式发布/安装协议。

## Decision

采用以下发布与安装顺序：

- 如果本地已经有尚未推送的 release guidance / truth 变更，先单独提交，再同步远端 `main`，避免把预发布文档调整和远端 release 基线混在同一个未提交工作区里
- 先同步远端 `main`，确认发布基线正确，再执行版本 bump
- 如果同步 `origin/main` 时在 workflow guidance、CLI tests、Codex adapter docs/skills 或 `.claw/truth/` 上发生冲突，合并结果必须同时保留远端更新和本地已经验证过的行为，再继续 release 流程
- 同步完成后，必须把 merged HEAD 与当前已发布 artifact 基线一起判断；如果 merged HEAD 已经领先于已发布版本，就直接把整条 workspace/package/plugin 版本线推进到下一个正式 release 目标，而不是沿用 merge 前的本地预期版本
- release version bump must include the complete current packaging surface: root/package-lock metadata, `@veewo/claw-core`, `@veewo/claw`, Codex/OpenClaw/OpenCode adapter package versions, CLI/OpenClaw dependency pins on `@veewo/claw-core`, and the Codex plugin manifest `semver+codex.<timestamp>` version
- after version edits, run `npm install --package-lock-only --ignore-scripts` or equivalent lockfile regeneration before verification so package-lock metadata matches the target release line
- before publishing, commit the release-ready source state so registry artifacts can be traced back to one source commit; the commit should include the version bump, generated plugin metadata, release docs/truth/ADR residue, and release-scoped runtime fixes
- 发布前必须完成完整本地验证门：`npm test`、`npm run check`、`npm run test:codex-plugin`、`npm run test:opencode-plugin`，以及本地安装脚本验证
- 发布前必须分别对 `@veewo/claw-core` 与 `@veewo/claw` 运行 `npm pack --dry-run`，确认两个真实发布面都能产出目标版本 tarball 预览
- 双包发布保持固定顺序：先发 `@veewo/claw-core`，再发 `@veewo/claw`
- 在受管环境里，如果宿主机没有可直接调用的 `npm` CLI，也允许通过 bundled node、tar-based packaging 和 registry API 完成真实 publish
- Windows 本地安装继续通过仓库支持的 `npm run install:local-cli` 路径刷新全局 CLI
- 如果 publish 刚完成时 `npm view @veewo/claw version` 还没看到新版本，closeout 不把第一次本地安装拿到旧版本视为失败；应在 registry 可见新版本后重跑 `npm run install:local-cli`
- 发布完成后仍必须验证 `@veewo/claw` 的安装烟测；当前 `0.1.40` 这轮的基线证据是 `npm view @veewo/claw-core version = 0.1.40`、`npm view @veewo/claw version = 0.1.40`、`claw --version = 0.1.40`，以及 `npm list -g @veewo/claw --depth=0` 解析到 `@veewo/claw@0.1.40`
- publish 输出里出现 `bin[claw]` normalization warning 时，closeout 仍以 `npm view @veewo/claw version`、`npm view @veewo/claw bin --json` 和实际 CLI/安装解析结果为准，不把该 warning 本身当作失败或回滚证据
- registry verification must cover both metadata and retrieval/install paths: `version` / `dist-tags.latest`, `bin` / `dependencies`, `dist.tarball` / `dist.integrity` / `dist.shasum`, plus an actual `npm pack` or install smoke before treating a publish as fully propagated
- 如果 `npm view @veewo/claw@<version> dist.tarball dist.integrity dist.shasum --json` 已返回新 tarball metadata，但本机 `npm pack` / install 仍报 `ETARGET`，先运行 `npm cache clean --force` 再重试；不要把本地 cache stale 误判为 publish 回滚
- 正式 publish 完成后，除了安装烟测，还要刷新并验证本地 CLI 与本地 Codex plugin cache，确保 npm 包与适配器缓存都已经切到新发布版本
- 正式 publish 完成后，还要直接核对 registry `dist-tags.latest` / `version` 与本地 Codex plugin cache manifest 版本，避免“包已发布但缓存仍停留在旧插件版本”的假完成态
- 如果 release round 包含 `workflowGuidance` wording 或 config 变更，closeout 必须同时验证 source config、built `dist/workflow-guidance.config.json`、installed global CLI guidance output，以及本地 Codex plugin cache payload；`0.1.49` 的关键句是 `When dispatching a subagent, each entry is a required structured contract whose fields must be honored directly.`
- local runtime refresh verification must include the actual Windows shim path, `claw --version`, `npm list -g @veewo/claw --depth=0`, and a repo-local `claw context` smoke check that proves protocol repair does not rewrite flat config back to legacy nested fields
- release closeout 的 done 条件继续包括本机全局 `claw` CLI 刷新、`packages/codex-adapter` 对应本地 Codex plugin cache 刷新、关键缓存文件与仓库副本 hash 一致，并把缓存目标版本固定到本次 release 对应的插件 manifest 版本
- 本地 Codex plugin cache 的稳定刷新语义保持不变：把 `packages/codex-adapter` 下的 `.codex-plugin`、`hooks`、`references`、`scripts`、`skills` 与 `package.json` 直接同步到版本化的 `claw-kit-local` 缓存目录，再做内容一致性复核
- when adapter skills change, plugin cache verification should inspect both the manifest version and the expected skill files; `0.1.48` specifically required `skills/config/SKILL.md` to be present in the local Codex cache
- 如果 release round 同时包含 Codex workflow contract 变更，closeout 应把这些长期规则一并沉淀到 canonical truth；`0.1.39` 的新增规则是 researcher dispatch 前不要由 host 内联读取 search skill，且依赖 research 结果的主流程必须等待 `researcher` 返回
- `release-next-version-and-refresh-local-installs` 这轮把 release baseline 明确卡在 `0.1.51`，因此 `0.1.52` 的版本 bump 必须覆盖 root/package-lock metadata、`@veewo/claw-core`、`@veewo/claw`、Codex/OpenClaw/OpenCode adapter package versions、CLI/OpenClaw dependency pins on `@veewo/claw-core`，以及 `packages/codex-adapter/.codex-plugin/plugin.json` 的 `0.1.52+codex.20260624215321` 版本；发布后仍要验证 `npm test`、`npm run check`、`npm pack --dry-run`、`claw --version`、`npm list -g @veewo/claw --depth=0` 和本地 Codex plugin cache 的实际刷新结果
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
- 安装烟测继续作为 release closeout 的必选项，避免 registry 成功但最终 CLI 安装链路失效
- plugin bundle tests 与双包 dry-run 进入固定验证门后，release readiness 不再只证明源码可测，还要证明两个 host plugin payload 和两个 npm tarball 发布面都处于可交付状态
- 本地 CLI 与 Codex plugin cache 都被纳入 release closeout 验证范围，避免 registry 已更新但操作者机器仍停留在旧缓存
- workflowGuidance wording patch 不能只停在源码层；final release state 以 registry package、global CLI 和 local plugin cache 都暴露同一合同为准
- plugin cache 的 direct filesystem sync 范围被继续固定下来，后续 closeout 可以明确判断“缓存没刷新”与“缓存目录已切换但 payload 不一致”这两类不同故障
- 0.1.50 这轮把真实 publish / restore / push 的失败恢复边界也固定了：core 先发、CLI 后发，helper 安装脚本超时后用显式 global npm install 恢复 `claw`，GitHub 连接异常时可用 `http.curloptResolve` 作为一次性 push 恢复手段
- `release-next-version-and-refresh-local-installs` 这轮验证后，`0.1.52` 的本机刷新结果是 `scripts/install-cli.ps1` 完成、`claw --version = 0.1.52`、`Get-Command claw` 解析到 `C:\nvm4w\nodejs\claw.ps1`，并且本地 Codex plugin cache 刷新到 `C:\Users\chany\.codex\plugins\cache\claw-kit-local\claw-kit\0.1.52+codex.20260624215321`
- researcher dispatch contract 进入 release closeout 事实后，未来 release 不会只验证 artifact 版本，还会同时复核与发布一起交付的长期 workflow 规则
- 发布后清理 token 让本机环境回到更安全的状态

## Related code

- `DISTRIBUTION.md`
- `docs/2026-06-08-closeout-workflow.md`
- `scripts/install-cli.ps1`
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
