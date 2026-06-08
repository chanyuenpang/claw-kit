# ADR: Use GitHub checkout plus PowerShell for Windows installs

## Status

Accepted

## Context

`install-script-and-publish` 这次完成的长期决策不是把安装路径切到 `npm publish`，而是让远端 Windows 机器继续走 GitHub clone，然后通过本地 PowerShell 脚本完成安装、构建和 CLI 链接。现有的发布 ADR 仍然负责 `@veewo/claw-core` 与 `@veewo/claw` 的 npm 发布语义，但这条安装路径本身不依赖真实的 `npm publish`。

## Decision

- 为远端 Windows 机器提供 `scripts/install-cli.ps1` 作为一键安装入口。
- 安装脚本按顺序执行 `npm install`、`npm run build`、清理旧的全局 `claw` 链接，再用 `npm link --force .\packages\cli` 让 `claw` 可用。
- `README.md` 将远端安装说明指向该脚本，同时保留 `@veewo/claw` 和 `@veewo/claw-core` 作为发布就绪包名。
- 本任务只推进并推送仓库状态，不把真实 `npm publish` 作为安装前置或本次完成条件。

## Consequences

- Windows 远端可以通过 GitHub checkout 获得可用 CLI，不必等待 npm 发布流程。
- 安装语义与发布语义分离，`@veewo/claw-core` 和 `@veewo/claw` 仍然是可发布包名。
- 后续若要正式对外分发，仍可沿用既有发布流程，但安装脚本不需要改成 publish 驱动。

## Related Code

- `scripts/install-cli.ps1`
- `README.md`
- `packages/cli/package.json`
- `packages/core/package.json`
- `.claw/archive/tasks/install-script-and-publish/plan.json`
