# ADR: Release 0.1.18 publish and install protocol

## Status

Accepted

## Context

`release-0-1-18` 这个完成计划把一次正式发布收口成了可重复的发布协议。后续 `release-0-1-25` 又补上了一个更强的环境约束：发布流程不能假定宿主机已经提供可直接调用的 `npm` CLI，但仍然需要完成真实发布并验证最终安装烟测。`sync-latest-remote-and-publish-next-release` 这次完成计划继续把 release closeout 固化为正式协议：本地 release-guidance 工作先落成独立提交，再同步远端 `main`，并以“当前 merged HEAD 是否已经领先于已发布 artifact”来决定真实 release 目标版本。`release-0.1.33` 这次发布把 shared embedding cache / legacy `.claw/models` cleanup 作为正式 patch release 内容，再次验证了这条协议在本机刷新 CLI、同步 Codex plugin cache 和 registry 验证上的闭环。`release-0.1.34` 则再次把 workspace/package/plugin/changelog 版本对齐、双包发布顺序、安装烟测、CLI/plugin cache 刷新和 release commit 推送收口为同一条可复用的 closeout 协议。`release-0.1.39` 继续沿用这条协议，并把 researcher dispatch contract 的 host-light / wait-for-result 约束一并带入 release closeout 验证。六次 release 共同定义了现在的正式发布/安装协议。

## Decision

采用以下发布与安装顺序：

- 如果本地已经有尚未推送的 release guidance / truth 变更，先单独提交，再同步远端 `main`，避免把预发布文档调整和远端 release 基线混在同一个未提交工作区里
- 先同步远端 `main`，确认发布基线正确，再执行版本 bump
- 如果同步 `origin/main` 时在 workflow guidance、CLI tests、Codex adapter docs/skills 或 `.claw/truth/` 上发生冲突，合并结果必须同时保留远端更新和本地已经验证过的行为，再继续 release 流程
- 同步完成后，必须把 merged HEAD 与当前已发布 artifact 基线一起判断；如果 merged HEAD 已经领先于已发布版本，就直接把整条 workspace/package/plugin 版本线推进到下一个正式 release 目标，而不是沿用 merge 前的本地预期版本
- 发布前必须完成 `npm test`、`npm run check`，以及本地安装脚本验证
- 双包发布保持固定顺序：先发 `@veewo/claw-core`，再发 `@veewo/claw`
- 在受管环境里，如果宿主机没有可直接调用的 `npm` CLI，也允许通过 bundled node、tar-based packaging 和 registry API 完成真实 publish
- Windows 本地安装继续通过 `scripts/install-cli.ps1`，并保持 `npm install -g @veewo/claw` 作为本地 CLI 安装路径
- 发布完成后仍必须验证 `@veewo/claw` 的安装烟测；当前 `0.1.39` 的基线证据是 `claw --version = 0.1.39`、命令解析到 `C:\nvm4w\nodejs\claw.ps1`，并且本地 Codex plugin cache 已切到 `0.1.39+codex.20260613195040`
- 正式 publish 完成后，除了安装烟测，还要刷新并验证本地 CLI 与本地 Codex plugin cache，确保 npm 包与适配器缓存都已经切到新发布版本
- `0.1.39` release closeout 的 done 条件继续包括本机全局 `claw` CLI 刷新、`packages/codex-adapter` 对应本地 Codex plugin cache 刷新、关键缓存文件与仓库副本 hash 一致，以及最终 release commit `05bfd20` 推送到 `origin/main`
- 如果 release round 同时包含 Codex workflow contract 变更，closeout 应把这些长期规则一并沉淀到 canonical truth；`0.1.39` 的新增规则是 researcher dispatch 前不要由 host 内联读取 search skill，且依赖 research 结果的主流程必须等待 `researcher` 返回
- 发布完成后删除本机临时 `npm token` 配置

## Consequences

- 发布链路变成先验证、后发布，降低把未验证状态直接推向 npm 的风险
- release sync 前的本地提交把“准备发布的本地 guidance 调整”和“从远端吸收最新基线”拆成两段，后续排查 merge 或回滚时更容易定位
- release sync 冲突的处理原则被固定下来：workflow guidance、测试、适配器文档/技能和 truth 文档都要以“保留远端更新 + 保留本地已验证行为”为准，而不是机械偏向单边版本
- release 目标版本不再只看本地预期，而是以 merged HEAD 相对已发布 registry artifact 的领先程度来决定
- `@veewo/claw-core` 与 `@veewo/claw` 的先后顺序被固定，避免依赖链倒置
- 正式发布不再被“PATH 上必须已有 npm CLI”这个宿主前提卡死，release automation 在更受限的 managed environment 里仍然可行
- Windows 本地安装路径保持可重复执行，不需要依赖真实发布来完成日常使用
- 安装烟测继续作为 release closeout 的必选项，避免 registry 成功但最终 CLI 安装链路失效
- 本地 CLI 与 Codex plugin cache 都被纳入 release closeout 验证范围，避免 registry 已更新但操作者机器仍停留在旧缓存
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
- `packages/codex-adapter/.codex-plugin/plugin.json`
- `packages/codex-adapter/skills/researcher/SKILL.md`
- `packages/codex-adapter/references/codex-subagent-dispatch.md`
- `packages/codex-adapter/hooks/subagent-contract.test.mjs`
- `.claw/archive/tasks/release-0-1-18/plan.json`
- `.claw/archive/tasks/sync-latest-remote-and-publish-next-release/plan.json`

## Search Terms

- `release-0-1-18`
- `release-0.1.39`
- `@veewo/claw-core`
- `@veewo/claw`
- `scripts/install-cli.ps1`
- `claw --version`
- `C:\nvm4w\nodejs\claw.ps1`
- `plugin cache refresh`
- `05bfd20`
- `do not read the search skill inline`
- `wait for the result`
