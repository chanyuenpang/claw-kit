# ADR: Use GitHub checkout plus PowerShell for Windows installs

<!-- document-state: historical -->

## Status

Historical

## Context

`install-script-and-publish` 当时决定让远端 Windows 机器走 GitHub clone，再通过本地 PowerShell 脚本完成安装、构建和 CLI 链接。该决定后来被 registry 驱动的正式安装路径取代；当前 release/install 协议由 `.claw/truth/adr/release-0-1-18-publish-and-install-protocol.md` 拥有。

## Decision

- 当时为远端 Windows 机器提供 `scripts/install-cli.ps1` 作为一键安装入口。
- 当时的安装脚本执行 `npm install`、`npm run build`、清理旧的全局 `claw` 链接，再用 `npm link --force .\packages\cli` 让 `claw` 可用。
- 当时的 `README.md` 将远端安装说明指向该脚本，同时保留 `@veewo/claw` 和 `@veewo/claw-core` 作为发布就绪包名。

## Consequences

- Windows 远端可以通过 GitHub checkout 获得可用 CLI，不必等待 npm 发布流程。
- 安装语义与发布语义分离，`@veewo/claw-core` 和 `@veewo/claw` 仍然是可发布包名。
- 后续若要正式对外分发，仍可沿用既有发布流程，但安装脚本不需要改成 publish 驱动。

<!-- state: history -->
## Evolution history

<!-- dated: 2026-07-20 -->
### Superseded by the published npm installation path

Current `scripts/install-cli.ps1` removes prior global installs or links and runs `npm install -g @veewo/claw`; it no longer builds or links the checkout. A workspace CLI link is now only a narrow, temporary pre-release template-bootstrap exception, and must be replaced by the formal npm installation after publication.

## Related Code

- `scripts/install-cli.ps1`
- `README.md`
- `packages/cli/package.json`
- `packages/core/package.json`
- `.claw/archive/tasks/install-script-and-publish/plan.json`
