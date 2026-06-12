# ADR: Sync latest remote and refresh local installs

## Status

Accepted

## Context

`sync-latest-remote-and-refresh-local-installs` 这次完成计划不是在改源代码行为，而是在把当前工作站重新对齐到最新的 `origin/main` 之后，刷新两个长期依赖的本地分发面：全局 `claw` CLI 安装和本地 Codex plugin cache。这个流程的重点不是单次执行成功，而是让后续机器状态检查能持续确认“仓库基线、CLI 解析结果、插件缓存内容”三者始终一致。

## Decision

采用以下本地 closeout 顺序：

- 先把当前 checkout fast-forward 到最新 `origin/main`，或者明确验证它已经是最新
- 再按仓库支持的安装流程刷新全局 `@veewo/claw` CLI，并确认 `claw` 命令实际解析到正确路径
- 再从 `packages/codex-adapter` 刷新本地 Codex plugin cache，并确认缓存目录与 manifest 版本对齐
- 最后同时记录并复核仓库 SHA、CLI 版本/路径、以及插件缓存版本/路径

## Consequences

- 本地工作站不会长期停留在旧 checkout、旧 CLI 或旧 plugin cache 上
- 任何“安装成功但解析路径不对”或“缓存刷新但 manifest 未对齐”的偏差都会在 closeout 阶段暴露出来
- 这个流程保持为运维型约束，不引入新的源代码行为或运行时协议

## Related code

- `scripts/install-cli.ps1`
- `packages/codex-adapter`
- `.claw/archive/tasks/Sync-latest-remote-and-refresh-local-installs/plan.json`

## Search Terms

- `sync latest remote`
- `refresh local installs`
- `claw command resolution`
- `plugin cache`
- `packages/codex-adapter`
