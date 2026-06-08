# Published npm Packages

## 状态

已确认的稳定真相，来自 `publish-claw-npm-package` 完成后的发布路径整理。

## 结论

`claw-kit` 现在有两层可发布的 npm 包：

- `@veewo/claw-core` 提供核心 `.claw` harness 原语。
- `@veewo/claw` 提供可发布的 CLI 入口，并依赖 `@veewo/claw-core`。

发布与安装相关的长期约束是：

- `packages/core/package.json` 的包名是 `@veewo/claw-core`，版本是 `0.1.12`，并通过 `publishConfig.access = public` 公开发布。
- `packages/cli/package.json` 的包名是 `@veewo/claw`，版本是 `0.1.12`，并通过 `dependencies["@veewo/claw-core"] = "0.1.12"` 绑定可发布的核心包，而不是本地 `file:` 链接。
- `packages/core/package.json` 只打包 `dist/src` 和 `README.md`，这样 `npm pack` 不会把测试工件带进发布包。
- `packages/cli/package.json` 只打包 `dist` 和 `README.md`，CLI 包体保持最小化。
- `README.md` 记录了发布包名、全局安装命令、`npm pack --dry-run` 验证步骤，以及先发 core 再发 CLI 的发布顺序。

## 相关代码

- [packages/core/package.json](D:/Users/chany/Documents/claw-kit/packages/core/package.json)
- [packages/cli/package.json](D:/Users/chany/Documents/claw-kit/packages/cli/package.json)
- [packages/core/README.md](D:/Users/chany/Documents/claw-kit/packages/core/README.md)
- [packages/cli/README.md](D:/Users/chany/Documents/claw-kit/packages/cli/README.md)
- [README.md](D:/Users/chany/Documents/claw-kit/README.md)

## 验证标准

- `npm test`
- `npm run check`
- `npm pack --dry-run` in `packages/core`
- `npm pack --dry-run` in `packages/cli`

