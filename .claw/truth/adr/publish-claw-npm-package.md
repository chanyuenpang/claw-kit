# ADR: Publish `@veewo/claw` and `@veewo/claw-core`

## Status

Accepted

## Context

`publish-claw-npm-package` 这个完成计划已经把 `claw` CLI 的发布路径和运行时依赖链整理到可发布状态。这个发布面需要同时覆盖两个 npm 包：对外安装的 CLI 包和它依赖的 core 运行时包，并且要保证本地验证足够完整，避免把未验证的发布链路直接推到真实 npm 发布。

## Decision

采用以下发布决策：

- CLI 以 `@veewo/claw` 作为发布包名，保留本地可执行命令名 `claw`
- 运行时依赖以 `@veewo/claw-core` 作为独立发布包名
- 发布顺序必须先发布 `@veewo/claw-core`，再发布 `@veewo/claw`
- 发布前以本地 `build`、`test` 和 `npm pack --dry-run` 验证包内容

本文拥有两个 npm 包的身份、依赖关系与发布顺序。`0.1.62` 起使用 `npm run verify:release` / `npm run publish:release` 的来源闸门、direct-`main` 交付、clean-worktree、push-before-publish、版本对齐及 Codex bundle 完整性规则，由 `.claw/truth/adr/release-0-1-18-publish-and-install-protocol.md` 统一拥有；本文只消费该协议，不重复定义它。

## Consequences

- CLI 的 npm 发布名和本地命令名被明确分离，用户安装后仍然通过 `claw` 使用
- core 包成为可独立发布的运行时依赖，CLI 不再依赖临时的 `file:` 工作区链接作为发布前提
- 发布检查可以在本地完成闭环，降低凭据、权限和误发布风险
- 发布流程需要维护 `@veewo/claw-core` 与 `@veewo/claw` 的先后顺序
- npm registry 之外的 GitHub source、Codex artifact 与 clean-delivery consequences 由 release protocol ADR 统一解释，避免包结构决策与仓库发布门禁形成两个当前 owner。

## Related Code

- `packages/cli/package.json`
- `packages/core/package.json`
- `scripts/verify-release.mjs`
- `scripts/publish-release.mjs`
- `AGENTS.md`
- `scripts/codex-plugin-bundle.mjs`
- `package.json`
- `README.md`
- `.claw/archive/tasks/publish-claw-npm-package/plan.json`

## Search Terms

- `@veewo/claw`
- `@veewo/claw-core`
- `npm pack --dry-run`
- `publish-claw-npm-package`
- `verify:release`
- `publish:release`
- `origin/main`
- `Codex plugin bundle`
