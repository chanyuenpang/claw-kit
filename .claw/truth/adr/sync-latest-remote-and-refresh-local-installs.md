# ADR: Sync latest remote and refresh local installs

## Status

Accepted

## Context

`sync-latest-remote-and-refresh-local-installs` 这次完成计划不是在改源代码行为，而是在把当前工作站重新对齐到最新的 `origin/main` 之后，刷新两个长期依赖的本地分发面：全局 `claw` CLI 安装和本地 Codex plugin cache。这个流程的重点不是单次执行成功，而是让后续机器状态检查能持续确认“仓库基线、CLI 解析结果、插件缓存内容”三者始终一致。

## Decision

采用以下本地 closeout 顺序：

- 如果工作树包含 tracked 修改或未跟踪的计划文件，不能直接 pull 或先清理工作树；先用包含未跟踪文件的具名 stash 完整保护现场，再执行 `git pull --ff-only origin main`。远端同步完成且 `HEAD...origin/main` 已确认对齐后，恢复 stash；只有恢复结果和本地修改都核对无误后才删除该 stash
- 恢复 stash 时如果 `.claw/truth/SUMMARY.md`、`packages/cli/test/cli.test.ts`、`packages/core/test/core.test.ts` 等本地与远端共同修改的文本出现冲突，必须逐段保留双方仍然有效的语义，并只用 `apply_patch` 编辑冲突文本；不能用整文件 ours/theirs、reset、checkout 或清理命令丢弃用户修改
- stash 恢复后的最低验证包括：没有未合并路径、保护前的本地修改集合仍然存在、`git diff --check` 通过；验证完成前保留具名 stash 作为恢复保险，不能因为部分文件自动合并成功就提前删除
- 先把当前 checkout fast-forward 到最新 `origin/main`，或者明确验证它已经是最新；这一步是整个 closeout 的前置条件，不和后面的刷新动作交错执行
- 如果默认 `git fetch origin` 在 Windows 上报 `schannel: failed to receive handshake, SSL/TLS connection failed`，先不要直接判断为网络中断；先用 `Test-NetConnection github.com -Port 443` / `registry.npmjs.org -Port 443` 区分连通性，再用一次性的 `git -c http.sslbackend=openssl ls-remote origin refs/heads/main` 复核是否只是 `schannel` 后端问题，且不把这个旁路写进全局 Git 配置
- 如果这台 Windows 机器上 `github.com` 被本地解析到 `127.0.0.1`，不要改仓库状态或丢弃本地编辑来“绕过去”；优先用一次性的 `git -c http.curloptResolve=github.com:443:140.82.112.4 ...` 让 fetch/pull 直连已知 GitHub IP，再继续按正常 fast-forward 流程同步 `origin/main`
- 在真正刷新安装前，先记一次基线：本地 `HEAD`、`origin/main` 差异、registry latest、`npm list -g @veewo/claw --depth=0`、`(Get-Command claw).Source`、以及本地 Codex plugin cache 目录版本
- 再按仓库支持的安装流程刷新全局 `@veewo/claw` CLI，并确认 `claw` 命令实际解析到正确路径
- 如果仓库 helper `scripts/install-cli.ps1` 在 Windows 上因为超时而卡在卸载旧全局包和重新安装新版本之间，导致机器暂时没有 `claw` 命令，不要重复跑清理；直接执行 `npm install -g @veewo/claw` 完成恢复，然后再核对命令解析和版本
- 再从 `packages/codex-adapter` 刷新本地 Codex plugin cache，并确认 `.codex-plugin/`、`hooks/`、`references/`、`scripts/`、`skills/` 与 `package.json` 都已同步到目标缓存目录
- 本地 Codex plugin cache 只有在 cache 路径 / 版本和至少一个 repo-to-cache 内容 hash 都确认一致后，才算真正完成刷新；安装器只输出成功信息还不够
- 如果目标版本的 `update` skill-local `TEMPLATE.json` 不能被 subplan seed-template resolver 解析，不把失败的模板注册伪报为子计划成功；改为按模板定义的三个阶段等价执行本轮更新，并把注册不兼容明确保留为待修复的产品缺陷
- 最后统一复核仓库 SHA、CLI 版本/路径、插件缓存版本/路径，以及插件缓存内关键文件的逐文件 hash；只有 hash 与仓库副本一致时，才算缓存真的完成刷新
- 这类 sync/install round 的最终完成态还要回到 `git rev-list --left-right --count HEAD...origin/main = 0 0`，避免“本地装好了但 checkout 其实没追平远端”

## Consequences

- 本地工作站不会长期停留在旧 checkout、旧 CLI 或旧 plugin cache 上
- 脏工作树中的用户修改和未跟踪计划文件会在远端 fast-forward 前获得可恢复边界；同步后的冲突处理也不会以覆盖任一方整文件为代价
- `git fetch` 的 TLS 后端问题可以和真实网络故障快速分层，避免把 `schannel` 异常误判成 GitHub 或 npm 全站不可达
- 任何“安装成功但解析路径不对”或“缓存刷新但 manifest 未对齐”的偏差都会在 closeout 阶段暴露出来
- 这个流程保持为运维型约束，不引入新的源代码行为或运行时协议
- 在当前 Windows 环境里，GitHub DNS 仍可能需要按命令级别覆盖；`http.curloptResolve` 是已验证的局部恢复手段，比修改仓库或全局 Git 配置更安全
- 全局 `claw` CLI 的恢复也可以局部完成：helper 安装脚本被超时打断后，`npm install -g @veewo/claw` 是已验证的补救路径，随后用 `claw --version`、`npm list -g @veewo/claw --depth=0` 和 `Get-Command claw` 复核即可
- Codex plugin cache 的完成态也要双重验证：先确认 installer 输出的目标缓存路径和版本，再至少核对一个仓库文件与缓存副本的 SHA256 完全一致
- `update` 模板注册不兼容不会阻断已经明确的更新流程，但执行记录必须区分“按模板阶段等价完成”和“subplan seed 成功”，以免掩盖 resolver 的产品缺陷

## Related code

- `scripts/install-cli.ps1`
- `packages/codex-adapter`
- `.claw/archive/tasks/Sync-latest-remote-and-refresh-local-installs/plan.json`
- `.claw/archive/tasks/sync-latest-remote-and-update-0-1-62/plan.json`
- `.claw/truth/SUMMARY.md`
- `packages/cli/test/cli.test.ts`
- `packages/core/test/core.test.ts`

## Search Terms

- `sync latest remote`
- `refresh local installs`
- `claw command resolution`
- `plugin cache`
- `packages/codex-adapter`
- `schannel`
- `openssl`
- `named stash`
- `apply_patch conflict resolution`
