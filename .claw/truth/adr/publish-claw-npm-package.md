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

从 `0.1.62` 起，真实 npm 发布还必须通过 `npm run verify:release` / `npm run publish:release` 的来源闸门：

- 仓库所有者默认直接在 `main` 上交付和发布；除非明确要求 review，否则不创建 feature branch、PR 或 draft PR
- 发布前必须位于 `main`，且 `HEAD` 必须与 `origin/main` 精确相等；有用内容须先提交并推送到 `main`
- 发布前和 npm publish 后工作区都必须干净；不得用 stash 绕过此门禁
- 所有 release 版本元数据必须对齐
- 实际生成的 Codex 插件 bundle 必须同时包含完整的 shared-materialized workflow skills 和 adapter-owned `update` package；各自声明的模板、fallback 与相邻资源都不能缺失
- Codex 插件资产与两个 npm 包必须使用同一 release 版本

## Consequences

- CLI 的 npm 发布名和本地命令名被明确分离，用户安装后仍然通过 `claw` 使用
- core 包成为可独立发布的运行时依赖，CLI 不再依赖临时的 `file:` 工作区链接作为发布前提
- 发布检查可以在本地完成闭环，降低凭据、权限和误发布风险
- 发布流程需要维护 `@veewo/claw-core` 与 `@veewo/claw` 的先后顺序
- npm registry 不再是唯一发布事实；可复现 release 必须同时具备 GitHub 已推送的源码提交和同版本 Codex 插件产物。
- 未提交、未推送或 bundle 内容不完整会在 npm publish 前失败，避免另一台电脑更新后退回旧 skill 集合。
- 所有者的常规交付路径保持单一且可审计：本地 `main`、`origin/main` 与发布源在开始和结束时没有漂移。
- 有用的本地改动必须成为仓库历史的一部分；stash 仅可用于非发布同步保护，不能作为发布门禁的绕过方式。

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
