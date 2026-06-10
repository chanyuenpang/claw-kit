# Published npm Packages

## 状态

这是 `publish-claw-npm-package` 完成后沉淀下来的稳定发布事实。

## 结论

`claw-kit` 当前有两层可发布 npm 包：

- `@veewo/claw-core` 提供核心 `.claw` harness 语义。
- `@veewo/claw` 提供可发布的 CLI 入口，并依赖 `@veewo/claw-core`。

当前版本线已经同步到 `0.1.26`：

- 这次 closeout 不是重发旧的 `0.1.25` 包，而是在合并了已经领先于已发布 `0.1.25` artifact 的代码之后，把整条 workspace/package 版本线从 `0.1.25` 统一推进到 `0.1.26`。

- 根 `package.json` 版本是 `0.1.26`。
- `packages/core/package.json` 版本是 `0.1.26`。
- `packages/cli/package.json` 版本是 `0.1.26`。
- `package-lock.json` 也已经把 workspace 包版本线同步到 `0.1.26`，包括根包、`@veewo/claw-core`、`@veewo/claw`、`@claw-kit/openclaw-adapter` 和 `@claw-kit/codex-adapter`。
- `packages/codex-adapter/.codex-plugin/plugin.json` 使用 `0.1.26+codex.20260610193003` 作为适配器版本号。
- `@veewo/claw-core@0.1.26` 与 `@veewo/claw@0.1.26` 都已经成功发布。
- 通过 `npm view @veewo/claw-core version` 与 `npm view @veewo/claw version` 校验后，两个包当前的 `latest` dist-tag 都解析到 `0.1.26`。

当前发布链也形成了一条稳定的 release target 判定规则：

- 如果合并后的 `HEAD` 已经领先于 npm registry 里的已发布 artifact，但 workspace 包版本号仍停留在旧值，则下一次发布必须先把整条 workspace/package 版本线整体推进到下一个补丁版本，再进入发布流程。
- 这次合并后的代码面已经超过已发布 `0.1.25` artifact，而根包、core、cli 以及 lockfile 仍都写着 `0.1.25`，因此正确目标版本是 `0.1.26`，而不是重发 `0.1.25`。

发布前的本地验证闸门保持同一条稳定路径：

- `npm test` 必须通过。
- `npm run check` 必须通过。
- `npm whoami` 必须返回发布账号 `chanyuenpang`。
- `npm pack --dry-run` 需要分别在 `packages/core` 和 `packages/cli` 产出 `veewo-claw-core-0.1.26.tgz` 与 `veewo-claw-0.1.26.tgz`，用来证明双包当前都能被正确打包。

正式发布后的安装与命令解析验证也已经形成稳定事实：

- 验证是在临时目录里自举 npm CLI 后完成的，不依赖宿主环境预先把 `npm` 放进 `PATH`。
- 验证路径是：临时安装刚发布的 `@veewo/claw` 到独立 prefix，再在全新的 smoke project 中运行 `claw init`。
- 发布完成后还需要把本地 CLI 刷新到刚发布的新版本，并确认命令解析继续指向真实全局 shim；当前稳定解析路径是 `C:\nvm4w\nodejs\claw.ps1`。
- 这条安装验证已经成功，说明已发布的 CLI 包可以在干净环境里完成初始化；当前已验证版本是 `@veewo/claw@0.1.26`。

当前这条发布链还保留一个稳定环境约束：

- 本次受管环境缺少可直接调用的 `npm` CLI `PATH` 入口。
- 即便如此，真实发布仍可通过 registry API、bundled node，以及基于 tar 的打包流程完成，不需要把发布能力绑定到宿主机上现成的 `npm` 命令。

本地安装和缓存刷新仍然遵循同一条稳定路径：

- `scripts/install-cli.ps1` 是远程 Windows 机器的推荐安装入口，会清理旧的全局 `@veewo/claw` 链接并重新安装当前版本。
- 本地 Codex 插件缓存版本线需要和 `packages/codex-adapter/.codex-plugin/plugin.json` 保持一致；当前目标版本是 `0.1.26+codex.20260610193003`。
- 同步本地 Codex 插件缓存时，当前 canonical 目标目录是 `C:\Users\chany\.codex\plugins\cache\claw-kit-local\claw-kit\0.1.26+codex.20260610193003`；同步后还要再次核对缓存目录里的 manifest 与仓库 `packages/codex-adapter/.codex-plugin/plugin.json` 完全一致。
- 同步时仍应复制 `.codex-plugin`、`hooks`、`references`、`scripts`、`skills` 和 `package.json`，避免缓存里的版本、提示词和钩子滞后。

## 相关代码

- [package.json](D:/Users/chany/Documents/claw-kit/package.json)
- [packages/core/package.json](D:/Users/chany/Documents/claw-kit/packages/core/package.json)
- [packages/cli/package.json](D:/Users/chany/Documents/claw-kit/packages/cli/package.json)
- [packages/codex-adapter/.codex-plugin/plugin.json](D:/Users/chany/Documents/claw-kit/packages/codex-adapter/.codex-plugin/plugin.json)
- [packages/codex-adapter/hooks/hooks.json](D:/Users/chany/Documents/claw-kit/packages/codex-adapter/hooks/hooks.json)
- [scripts/install-cli.ps1](D:/Users/chany/Documents/claw-kit/scripts/install-cli.ps1)
- [packages/core/README.md](D:/Users/chany/Documents/claw-kit/packages/core/README.md)
- [packages/cli/README.md](D:/Users/chany/Documents/claw-kit/packages/cli/README.md)
- [README.md](D:/Users/chany/Documents/claw-kit/README.md)

## 验证标准

- `npm test`
- `npm run check`
- `npm whoami`
- `npm pack --dry-run` in `packages/core`
- `npm pack --dry-run` in `packages/cli`
- `npm view @veewo/claw-core version`
- `npm view @veewo/claw version`
