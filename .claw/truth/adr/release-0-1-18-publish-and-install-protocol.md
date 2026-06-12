# ADR: Release 0.1.18 publish and install protocol

## Status

Accepted

## Context

`release-0-1-18` 这个完成计划把一次正式发布收口成了可重复的发布协议。后续 `release-0-1-25` 又补上了一个更强的环境约束：发布流程不能假定宿主机已经提供可直接调用的 `npm` CLI，但仍然需要完成真实发布并验证最终安装烟测。`sync-latest-remote-and-publish-next-release` 这次完成计划继续把 release closeout 固化为正式协议：本地 release-guidance 工作先落成独立提交，再同步远端 `main`，并以“当前 merged HEAD 是否已经领先于已发布 artifact”来决定真实 release 目标版本。`release-0.1.33` 这次发布把 shared embedding cache / legacy `.claw/models` cleanup 作为正式 patch release 内容，再次验证了这条协议在本机刷新 CLI、同步 Codex plugin cache 和 registry 验证上的闭环。`release-0.1.34` 则再次把 workspace/package/plugin/changelog 版本对齐、双包发布顺序、安装烟测、CLI/plugin cache 刷新和 release commit 推送收口为同一条可复用的 closeout 协议。五次 release 共同定义了现在的正式发布/安装协议。

## Decision

采用以下发布与安装顺序：

- 如果本地已经有尚未推送的 release guidance / truth 变更，先单独提交，再同步远端 `main`，避免把预发布文档调整和远端 release 基线混在同一个未提交工作区里
- 先同步远端 `main`，确认发布基线正确，再执行版本 bump
- 如果同步 `origin/main` 时在 workflow guidance、CLI tests、Codex adapter docs/skills 或 `.claw/truth/` 上发生冲突，合并结果必须同时保留远端更新和本地已经验证过的 goal gate / positional-title 行为，再继续 release 流程
- 同步完成后，必须把 merged HEAD 与当前已发布 artifact 基线一起判断；如果 merged HEAD 已经领先于已发布的 `0.1.25`，就直接以 `0.1.26` 作为下一次正式 release 目标，而不是沿用 merge 前的本地预期版本
- 同步完成后，必须把 merged HEAD 与当前已发布 artifact 基线一起判断；如果 merged HEAD 已经领先于已发布的 `0.1.32`，就直接以 `0.1.33` 作为下一次正式 release 目标，而不是沿用 merge 前的本地预期版本
- 同步完成后，必须把 merged HEAD 与当前已发布 artifact 基线一起判断；如果 merged HEAD 已经领先于已发布的 `0.1.33`，就直接以 `0.1.34` 作为下一次正式 release 目标，而不是沿用 merge 前的本地预期版本
- 发布前必须完成 `npm test`、`npm run check`，以及本地安装脚本验证
- 双包发布保持固定顺序：先发 `@veewo/claw-core`，再发 `@veewo/claw`
- 在受管环境里，如果宿主机没有可直接调用的 `npm` CLI，也允许通过 bundled node、tar-based packaging 和 registry API 完成真实 publish
- Windows 本地安装继续通过 `scripts/install-cli.ps1`，并保持 `npm install -g @veewo/claw` 作为本地 CLI 安装路径
- 发布完成后仍必须验证 `@veewo/claw` 的安装烟测；`0.1.25` 的基线证据是安装 `@veewo/claw@0.1.25` 后成功运行 `claw init`
- 发布完成后仍必须验证 `@veewo/claw` 的安装烟测；`0.1.33` 的基线证据是安装 `@veewo/claw@0.1.33` 后成功运行 `claw --help`
- 发布完成后仍必须验证 `@veewo/claw` 的安装烟测；`0.1.34` 的基线证据是安装 `@veewo/claw@0.1.34` 后验证安装后的 CLI/本地插件缓存都已切到新版本
- 正式 publish 完成后，除了安装烟测，还要刷新并验证本地 CLI 与本地 Codex plugin cache，确保 npm 包与适配器缓存都已经切到新发布版本
- `0.1.33` release closeout 的 done 条件还包括本机全局 `claw` CLI 刷新、`packages/codex-adapter` 对应本地 Codex plugin cache 刷新，以及最终 release commit 推送到 `origin/main`
- `0.1.34` release closeout 的 done 条件继续包括本机全局 `claw` CLI 刷新、`packages/codex-adapter` 对应本地 Codex plugin cache 刷新，以及最终 release commit 推送到 `origin/main`
- 发布完成后删除本机临时 `npm token` 配置

## Consequences

- 发布链路变成先验证、后发布，降低把未验证状态直接推向 npm 的风险
- release sync 前的本地提交把“准备发布的本地 guidance 调整”和“从远端吸收最新基线”拆成两段，后续排查 merge 或回滚时更容易定位
- release sync 冲突的处理原则被固定下来：workflow guidance、测试、适配器文档/技能和 truth 文档都要以“保留远端更新 + 保留本地已验证行为”为准，而不是机械偏向单边版本
- release 目标版本不再只看本地预期，而是以 merged HEAD 相对已发布 registry artifact 的领先程度来决定；这让 `0.1.25` 之后的下一次正式发布被正确收口为 `0.1.26`
- `@veewo/claw-core` 与 `@veewo/claw` 的先后顺序被固定，避免依赖链倒置
- 正式发布不再被“PATH 上必须已有 npm CLI”这个宿主前提卡死，release automation 在更受限的 managed environment 里仍然可行
- Windows 本地安装路径保持可重复执行，不需要依赖真实发布来完成日常使用
- 安装烟测继续作为 release closeout 的必选项，避免 registry 成功但最终 CLI 安装链路失效
- 本地 CLI 与 Codex plugin cache 都被纳入 release closeout 验证范围，避免 registry 已更新但操作者机器仍停留在旧缓存
- `0.1.33` 的 shared embedding cache / legacy `.claw/models` cleanup 已经通过正式 release 进入发布历史，不再只是本地工作区里的临时变更
- 发布后清理 token 让本机环境回到更安全的状态

## Related code

- `DISTRIBUTION.md`
- `docs/2026-06-08-closeout-workflow.md`
- `scripts/install-cli.ps1`
- `packages/core/package.json`
- `packages/cli/package.json`
- `.claw/archive/tasks/release-0-1-18/plan.json`
- `.claw/archive/tasks/sync-latest-remote-and-publish-next-release/plan.json`

## Search Terms

- `release-0-1-18`
- `@veewo/claw-core`
- `@veewo/claw`
- `scripts/install-cli.ps1`
- `npm install -g @veewo/claw`
- `0.1.25`
- `0.1.26`
- `0.1.32`
- `0.1.33`
- `plugin cache refresh`
- `npm token`
