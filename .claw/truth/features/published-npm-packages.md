# Published npm Packages

## 状态

这是 `publish-claw-npm-package` 完成后沉淀下来的稳定发布事实。

## 结论

`claw-kit` 当前有两层可发布 npm 包：

- `@veewo/claw-core` 提供核心 `.claw` harness 语义。
- `@veewo/claw` 提供可发布的 CLI 入口，并依赖 `@veewo/claw-core`。

当前版本线已经同步到 `0.1.22`：

- 根 `package.json` 版本是 `0.1.22`。
- `packages/core/package.json` 版本是 `0.1.22`。
- `packages/cli/package.json` 版本是 `0.1.22`。
- `packages/codex-adapter/.codex-plugin/plugin.json` 使用 `0.1.22+codex.20260609022301` 作为适配器版本号。

本地安装和刷新仍然遵循同一条稳定路径：

- `scripts/install-cli.ps1` 是远程 Windows 机器的推荐安装入口，会清理旧的全局 `@veewo/claw` 链接并重新安装当前版本。
- 这次刷新后，`npm install -g @veewo/claw` 对应的全局 CLI 已经回到 `@veewo/claw@0.1.22`。
- 刷新 Codex 插件缓存时，`packages/codex-adapter/.codex-plugin/`、`hooks/`、`references/`、`scripts/`、`skills/` 和 `package.json` 需要一起同步，避免缓存里的 `plugin.json`、`hooks.json`、提示词和版本信息滞后。

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
