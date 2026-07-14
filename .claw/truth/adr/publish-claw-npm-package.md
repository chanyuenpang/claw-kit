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

- 工作区必须干净
- 所有 release 版本元数据必须对齐
- `HEAD` 必须已包含在 `origin/main`，以证明 release commit 已先推送到 GitHub
- 实际生成的 Codex 插件 bundle 必须包含完整共享 workflow skill 目录，包括 `planning`、`config`、`update`、`create-claw-skill` 及其模板或 fallback 资源
- Codex 插件资产与两个 npm 包必须使用同一 release 版本

## Consequences

- CLI 的 npm 发布名和本地命令名被明确分离，用户安装后仍然通过 `claw` 使用
- core 包成为可独立发布的运行时依赖，CLI 不再依赖临时的 `file:` 工作区链接作为发布前提
- 发布检查可以在本地完成闭环，降低凭据、权限和误发布风险
- 发布流程需要维护 `@veewo/claw-core` 与 `@veewo/claw` 的先后顺序
- npm registry 不再是唯一发布事实；可复现 release 必须同时具备 GitHub 已推送的源码提交和同版本 Codex 插件产物。
- 未提交、未推送或 bundle 内容不完整会在 npm publish 前失败，避免另一台电脑更新后退回旧 skill 集合。

## Related Code

- `packages/cli/package.json`
- `packages/core/package.json`
- `scripts/verify-release.mjs`
- `scripts/publish-release.mjs`
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
