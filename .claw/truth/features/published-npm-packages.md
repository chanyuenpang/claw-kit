# Published npm Packages

## 状态

这是 `publish-claw-npm-package` 完成后沉淀下来的稳定发布事实。

## 结论

`claw-kit` 当前有两层可发布 npm 包：

- `@veewo/claw-core` 提供核心 `.claw` harness 语义。
- `@veewo/claw` 提供可发布的 CLI 入口，并依赖 `@veewo/claw-core`。

当前版本线已经同步到 `0.1.25`：

- 根 `package.json` 版本是 `0.1.25`。
- `packages/core/package.json` 版本是 `0.1.25`。
- `packages/cli/package.json` 版本是 `0.1.25`。
- `package-lock.json` 也已经把 workspace 包版本线同步到 `0.1.25`，包括根包、`@veewo/claw-core`、`@veewo/claw`、`@claw-kit/openclaw-adapter` 和 `@claw-kit/codex-adapter`。
- `packages/codex-adapter/.codex-plugin/plugin.json` 使用 `0.1.25+codex.20260610012622` 作为适配器版本号。
- `@veewo/claw-core@0.1.25` 与 `@veewo/claw@0.1.25` 都已经成功发布。
- 两个包当前的 `latest` dist-tag 都解析到 `0.1.25`。

发布前的本地验证闸门保持同一条稳定路径：

- `npm test` 必须通过。
- `npm run check` 必须通过。
- `npm whoami` 必须返回发布账号 `chanyuenpang`。
- `npm pack --dry-run` 需要分别在 `packages/core` 和 `packages/cli` 产出 `veewo-claw-core-0.1.25.tgz` 与 `veewo-claw-0.1.25.tgz`，用来证明双包当前都能被正确打包。

正式发布后的安装验证也已经形成稳定事实：

- 验证是在临时目录里自举 npm CLI 后完成的，不依赖宿主环境预先把 `npm` 放进 `PATH`。
- 验证路径是：临时安装 `@veewo/claw@0.1.25` 到独立 prefix，再在全新的 smoke project 中运行 `claw init`。
- 这条安装验证已经成功，说明已发布的 CLI 包可以在干净环境里完成初始化。

当前这条发布链还保留一个稳定环境约束：

- 本次受管环境缺少可直接调用的 `npm` CLI `PATH` 入口。
- 即便如此，真实发布仍可通过 registry API、bundled node，以及基于 tar 的打包流程完成，不需要把发布能力绑定到宿主机上现成的 `npm` 命令。

本地安装和缓存刷新仍然遵循同一条稳定路径：

- `scripts/install-cli.ps1` 是远程 Windows 机器的推荐安装入口，会清理旧的全局 `@veewo/claw` 链接并重新安装当前版本。
- 本地 Codex 插件缓存版本线需要和 `packages/codex-adapter/.codex-plugin/plugin.json` 保持一致；当前目标版本是 `0.1.25+codex.20260610012622`。同步时仍应复制 `.codex-plugin`、`hooks`、`references`、`scripts`、`skills` 和 `package.json`，避免缓存里的版本、提示词和钩子滞后。

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
- `npm pack --dry-run` in `packages/core`
- `npm pack --dry-run` in `packages/cli`
