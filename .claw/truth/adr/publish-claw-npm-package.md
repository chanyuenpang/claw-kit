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
- 本次 readiness 验证只使用本地 `build`、`test` 和 `npm pack --dry-run`
- 本任务不执行真实的 npm publish

## Consequences

- CLI 的 npm 发布名和本地命令名被明确分离，用户安装后仍然通过 `claw` 使用
- core 包成为可独立发布的运行时依赖，CLI 不再依赖临时的 `file:` 工作区链接作为发布前提
- 发布检查可以在本地完成闭环，降低凭据、权限和误发布风险
- 发布流程需要维护 `@veewo/claw-core` 与 `@veewo/claw` 的先后顺序

## Related Code

- `packages/cli/package.json`
- `packages/core/package.json`
- `README.md`
- `.claw/archive/tasks/publish-claw-npm-package/plan.json`

## Search Terms

- `@veewo/claw`
- `@veewo/claw-core`
- `npm pack --dry-run`
- `publish-claw-npm-package`
