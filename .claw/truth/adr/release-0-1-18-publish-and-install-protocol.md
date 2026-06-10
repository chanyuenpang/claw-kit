# ADR: Release 0.1.18 publish and install protocol

## Status

Accepted

## Context

`release-0-1-18` 这个完成计划把一次正式发布收口成了可重复的发布协议。后续 `release-0-1-25` 又补上了一个更强的环境约束：发布流程不能假定宿主机已经提供可直接调用的 `npm` CLI，但仍然需要完成真实发布并验证最终安装烟测。两次 release 共同定义了现在的正式发布/安装协议。

## Decision

采用以下发布与安装顺序：

- 如果本地已经有尚未推送的 release guidance / truth 变更，先单独提交，再同步远端 `main`，避免把预发布文档调整和远端 release 基线混在同一个未提交工作区里
- 先同步远端 `main`，确认发布基线正确，再执行版本 bump
- 如果同步 `origin/main` 时在 workflow guidance、CLI tests、Codex adapter docs/skills 或 `.claw/truth/` 上发生冲突，合并结果必须同时保留远端更新和本地已经验证过的 goal gate / positional-title 行为，再继续 release 流程
- 发布前必须完成 `npm test`、`npm run check`，以及本地安装脚本验证
- 双包发布保持固定顺序：先发 `@veewo/claw-core`，再发 `@veewo/claw`
- 在受管环境里，如果宿主机没有可直接调用的 `npm` CLI，也允许通过 bundled node、tar-based packaging 和 registry API 完成真实 publish
- Windows 本地安装继续通过 `scripts/install-cli.ps1`，并保持 `npm install -g @veewo/claw` 作为本地 CLI 安装路径
- 发布完成后仍必须验证 `@veewo/claw` 的安装烟测；`0.1.25` 的基线证据是安装 `@veewo/claw@0.1.25` 后成功运行 `claw init`
- 发布完成后删除本机临时 `npm token` 配置

## Consequences

- 发布链路变成先验证、后发布，降低把未验证状态直接推向 npm 的风险
- release sync 前的本地提交把“准备发布的本地 guidance 调整”和“从远端吸收最新基线”拆成两段，后续排查 merge 或回滚时更容易定位
- release sync 冲突的处理原则被固定下来：workflow guidance、测试、适配器文档/技能和 truth 文档都要以“保留远端更新 + 保留本地已验证行为”为准，而不是机械偏向单边版本
- `@veewo/claw-core` 与 `@veewo/claw` 的先后顺序被固定，避免依赖链倒置
- 正式发布不再被“PATH 上必须已有 npm CLI”这个宿主前提卡死，release automation 在更受限的 managed environment 里仍然可行
- Windows 本地安装路径保持可重复执行，不需要依赖真实发布来完成日常使用
- 安装烟测继续作为 release closeout 的必选项，避免 registry 成功但最终 CLI 安装链路失效
- 发布后清理 token 让本机环境回到更安全的状态

## Related code

- `DISTRIBUTION.md`
- `docs/2026-06-08-closeout-workflow.md`
- `scripts/install-cli.ps1`
- `packages/core/package.json`
- `packages/cli/package.json`
- `.claw/archive/tasks/release-0-1-18/plan.json`

## Search Terms

- `release-0-1-18`
- `@veewo/claw-core`
- `@veewo/claw`
- `scripts/install-cli.ps1`
- `npm install -g @veewo/claw`
- `npm token`
