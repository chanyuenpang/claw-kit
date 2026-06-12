# Published npm Packages

## 状态

这是 `publish-claw-npm-package` 之后、以及 0.1.35 release closeout 完成后沉淀下来的稳定发布事实。

## 结论

`claw-kit` 仍然有两层可发布 npm 包：

- `@veewo/claw-core` 提供核心 `.claw` harness 语义。
- `@veewo/claw` 提供可发布的 CLI 入口，并依赖 `@veewo/claw-core`。

0.1.35 的稳定发布结果是：

- `@veewo/claw-core@0.1.35` 已成功发布，`npm view @veewo/claw-core version --registry=https://registry.npmjs.org` 返回 `0.1.35`。
- `@veewo/claw@0.1.35` 已成功发布，`npm view @veewo/claw version --registry=https://registry.npmjs.org` 返回 `0.1.35`，`latest` dist-tag 也解析到 `0.1.35`。
- 本机全局 CLI 已用 `npm install -g @veewo/claw@0.1.35` 刷新，`npm list -g @veewo/claw --depth=0` 现在显示 `@veewo/claw@0.1.35`。
- `(Get-Command claw).Source` 仍解析到 `C:\Users\chany\AppData\Roaming\npm\claw.ps1`，`claw --help` 在刷新后成功。
- 本地 Codex plugin cache 已刷新到 `C:\Users\chany\.codex\plugins\cache\claw-kit-local\claw-kit\0.1.35+codex.20260612132837`，并与 `packages/codex-adapter/.codex-plugin/plugin.json` 的版本一致。

当前 workspace/package 版本线已经推进到 `0.1.35`，用于对齐 release target：

- 根 `package.json`、`package-lock.json`、`packages/core/package.json`、`packages/cli/package.json`、`packages/openclaw-adapter/package.json` 和 `packages/codex-adapter/package.json` 都对齐到 `0.1.35`。
- `packages/codex-adapter/.codex-plugin/plugin.json` 的插件版本是 `0.1.35+codex.20260612132837`。
- `CHANGELOG.md` 追加了 `0.1.35` 条目，说明 `delegateSubagents` 现在要求按字段逐项执行 dispatch contract。
- `npm install -g @veewo/claw@0.1.35` 在版本更新后成功运行，说明 lockfile 与 workspace 版本仍然一致。

release target 之所以从 registry 上的 `0.1.34` 前推到 `0.1.35`，是因为本地 workspace 已经包含发布就绪但尚未发布的变更。

## 相关代码

- `package.json`
- `package-lock.json`
- `packages/core/package.json`
- `packages/cli/package.json`
- `packages/openclaw-adapter/package.json`
- `packages/codex-adapter/package.json`
- `packages/codex-adapter/.codex-plugin/plugin.json`
- `CHANGELOG.md`