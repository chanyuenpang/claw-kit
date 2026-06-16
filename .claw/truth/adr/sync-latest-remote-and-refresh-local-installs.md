# ADR: Sync latest remote and refresh local installs

## Status

Accepted

## Context

`sync-latest-remote-and-refresh-local-installs` 这次完成计划不是在改源代码行为，而是在把当前工作站重新对齐到最新的 `origin/main` 之后，刷新两个长期依赖的本地分发面：全局 `claw` CLI 安装和本地 Codex plugin cache。这个流程的重点不是单次执行成功，而是让后续机器状态检查能持续确认“仓库基线、CLI 解析结果、插件缓存内容”三者始终一致。

## Decision

采用以下本地 closeout 顺序：

- 先把当前 checkout fast-forward 到最新 `origin/main`，或者明确验证它已经是最新；这一步是整个 closeout 的前置条件，不和后面的刷新动作交错执行
- 如果默认 `git fetch origin` 在 Windows 上报 `schannel: failed to receive handshake, SSL/TLS connection failed`，先不要直接判断为网络中断；先用 `Test-NetConnection github.com -Port 443` / `registry.npmjs.org -Port 443` 区分连通性，再用一次性的 `git -c http.sslbackend=openssl ls-remote origin refs/heads/main` 复核是否只是 `schannel` 后端问题，且不把这个旁路写进全局 Git 配置
- 在真正刷新安装前，先记一次基线：本地 `HEAD`、`origin/main` 差异、registry latest、`npm list -g @veewo/claw --depth=0`、`(Get-Command claw).Source`、以及本地 Codex plugin cache 目录版本
- 再按仓库支持的安装流程刷新全局 `@veewo/claw` CLI，并确认 `claw` 命令实际解析到正确路径
- 再从 `packages/codex-adapter` 刷新本地 Codex plugin cache，并确认 `.codex-plugin/`、`hooks/`、`references/`、`scripts/`、`skills/` 与 `package.json` 都已同步到目标缓存目录
- 最后统一复核仓库 SHA、CLI 版本/路径、插件缓存版本/路径，以及插件缓存内关键文件的逐文件 hash；只有 hash 与仓库副本一致时，才算缓存真的完成刷新
- 这类 sync/install round 的最终完成态还要回到 `git rev-list --left-right --count HEAD...origin/main = 0 0`，避免“本地装好了但 checkout 其实没追平远端”

## Consequences

- 本地工作站不会长期停留在旧 checkout、旧 CLI 或旧 plugin cache 上
- `git fetch` 的 TLS 后端问题可以和真实网络故障快速分层，避免把 `schannel` 异常误判成 GitHub 或 npm 全站不可达
- 任何“安装成功但解析路径不对”或“缓存刷新但 manifest 未对齐”的偏差都会在 closeout 阶段暴露出来
- 这个流程保持为运维型约束，不引入新的源代码行为或运行时协议

## Related code

- `scripts/install-cli.ps1`
- `packages/codex-adapter`
- `.claw/archive/tasks/Sync-latest-remote-and-refresh-local-installs/plan.json`
- `.claw/truth/SUMMARY.md`

## Search Terms

- `sync latest remote`
- `refresh local installs`
- `claw command resolution`
- `plugin cache`
- `packages/codex-adapter`
- `schannel`
- `openssl`
