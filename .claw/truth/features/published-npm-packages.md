# Published npm Packages

## 状态

这是 `publish-claw-npm-package` 完成后沉淀下来的稳定发布事实。`0.1.39` 这一轮继续沿用同一条双包发布链，并把 researcher dispatch contract 的宿主轻量 / research gate 规则与 release closeout 一起沉淀进 canonical truth。

## 结论

`claw-kit` 当前有两层可发布 npm 包：

- `@veewo/claw-core` 提供核心 `.claw` harness 语义。
- `@veewo/claw` 提供可发布的 CLI 入口，并依赖 `@veewo/claw-core`。

当前版本线已经同步到 `0.1.39`：

- 这次 closeout 不是重发旧版本，而是把 root、`packages/core`、`packages/cli`、`packages/codex-adapter`、`packages/openclaw-adapter` 统一推进到 `0.1.39`，并把 plugin manifest 对齐到 `0.1.39+codex.20260613195040`。
- 根 `package.json` 版本是 `0.1.39`。
- `packages/core/package.json` 版本是 `0.1.39`。
- `packages/cli/package.json` 版本是 `0.1.39`。
- `packages/codex-adapter/package.json` 版本是 `0.1.39`。
- `packages/openclaw-adapter/package.json` 版本是 `0.1.39`。
- `package-lock.json` 也已经把 workspace 包版本线同步到 `0.1.39`，包括根包、`@veewo/claw-core`、`@veewo/claw`、`@claw-kit/openclaw-adapter` 和 `@claw-kit/codex-adapter`。
- `@veewo/claw-core@0.1.39` 与 `@veewo/claw@0.1.39` 都已经成功发布到 npm registry。
- 通过 `npm view @veewo/claw-core version --registry=https://registry.npmjs.org` 与 `npm view @veewo/claw version --registry=https://registry.npmjs.org` 校验后，两个包当前都解析到 `0.1.39`。
- `packages/codex-adapter/.codex-plugin/plugin.json` 和本地 Codex plugin cache 也同步到了 `0.1.39+codex.20260613195040`，缓存目录是 `C:\Users\chany\.codex\plugins\cache\claw-kit-local\claw-kit\0.1.39+codex.20260613195040`，并且与仓库 manifest 保持一致。
- 本机 `claw --version` 当前返回 `0.1.39`，命令解析路径是 `C:\nvm4w\nodejs\claw.ps1`。
- 最终 release commit 已推送到 `origin/main`，提交号是 `05bfd20`。

当前发布链继续保持同一条稳定的 release target 判定规则：

- 如果合并后的 `HEAD` 已经领先于 npm registry 里的已发布 artifact，但 workspace 包版本号仍停留在旧值，则下一次发布必须先把整条 workspace/package 版本线整体推进到下一个补丁版本，再进入发布流程。
- 这次 closeout 的 durable 语义除了版本推进与发布验证，还包括 researcher dispatch contract：host 不应在派发前内联读取 search skill，研究型 gate 必须等待 `researcher` 返回。

发布前的本地验证闸门保持同一条稳定路径：

- `npm test` 必须通过。
- `npm run check` 必须通过。
- `npm whoami` 必须返回发布账号 `chanyuenpang`。
- `npm pack --dry-run` 需要分别在 `packages/core` 和 `packages/cli` 产出当前版本 tarball，用来证明双包当前都能被正确打包。

正式发布后的安装与命令解析验证也已经形成稳定事实：

- 发布完成后还需要把本地 CLI 刷新到刚发布的新版本，并确认命令解析继续指向真实全局 shim；当前稳定解析路径是 `C:\nvm4w\nodejs\claw.ps1`。
- 这条安装验证已经成功，说明已发布的 CLI 包可以在本机继续以全局 shim 形式稳定解析；当前已验证版本是 `@veewo/claw@0.1.39`。

本地安装和缓存刷新仍然遵循同一条稳定路径：

- `scripts/install-cli.ps1` 是远程 Windows 机器的推荐安装入口，会清理旧的全局 `@veewo/claw` 链接并重新安装当前版本。
- 本地 Codex 插件缓存版本线需要和 `packages/codex-adapter/.codex-plugin/plugin.json` 保持一致；当前目标版本是 `0.1.39+codex.20260613195040`。
- 同步本地 Codex 插件缓存时，当前 canonical 目标目录是 `C:\Users\chany\.codex\plugins\cache\claw-kit-local\claw-kit\0.1.39+codex.20260613195040`；同步后还要再次核对缓存目录里的 manifest 与仓库 `packages/codex-adapter/.codex-plugin/plugin.json` 完全一致。
- 同步时仍应复制 `.codex-plugin`、`hooks`、`references`、`scripts`、`skills` 和 `package.json`，避免缓存里的版本、提示词和钩子滞后。
- 如果 release round 明确把关键文件 hash 校验列为 closeout 证据，则本地 plugin cache 与仓库副本应继续保持 hash 一致。

## 相关代码

- [package.json](D:/Users/chany/Documents/claw-kit/package.json)
- [packages/core/package.json](D:/Users/chany/Documents/claw-kit/packages/core/package.json)
- [packages/cli/package.json](D:/Users/chany/Documents/claw-kit/packages/cli/package.json)
- [packages/codex-adapter/package.json](D:/Users/chany/Documents/claw-kit/packages/codex-adapter/package.json)
- [packages/openclaw-adapter/package.json](D:/Users/chany/Documents/claw-kit/packages/openclaw-adapter/package.json)
- [packages/codex-adapter/.codex-plugin/plugin.json](D:/Users/chany/Documents/claw-kit/packages/codex-adapter/.codex-plugin/plugin.json)
- [packages/codex-adapter/skills/researcher/SKILL.md](D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/researcher/SKILL.md)
- [packages/codex-adapter/references/codex-subagent-dispatch.md](D:/Users/chany/Documents/claw-kit/packages/codex-adapter/references/codex-subagent-dispatch.md)
- [packages/codex-adapter/hooks/subagent-contract.test.mjs](D:/Users/chany/Documents/claw-kit/packages/codex-adapter/hooks/subagent-contract.test.mjs)
- [scripts/install-cli.ps1](D:/Users/chany/Documents/claw-kit/scripts/install-cli.ps1)

## 验证标准

- `npm test`
- `npm run check`
- `npm whoami`
- `npm pack --dry-run` in `packages/core`
- `npm pack --dry-run` in `packages/cli`
- `npm view @veewo/claw-core version`
- `npm view @veewo/claw version`
- `claw --version`
- `(Get-Command claw).Source`
