# Published npm Packages

## 状态

这是 `publish-claw-npm-package` 完成后沉淀下来的稳定发布事实。`0.1.40` 这一轮继续沿用同一条双包发布链，并把 registry 传播重试与本地 plugin cache 文件同步范围一起沉淀进 canonical truth。

## 结论

`claw-kit` 当前有两层可发布 npm 包：

- `@veewo/claw-core` 提供核心 `.claw` harness 语义。
- `@veewo/claw` 提供可发布的 CLI 入口，并依赖 `@veewo/claw-core`。

当前版本线已经同步到 `0.1.40`：

- 这次 closeout 不是重发旧版本，而是把 root、`packages/core`、`packages/cli`、`packages/codex-adapter`、`packages/openclaw-adapter` 统一推进到 `0.1.40`，并把 plugin manifest 对齐到 `0.1.40+codex.20260616130425`。
- 根 `package.json` 版本是 `0.1.40`。
- `packages/core/package.json` 版本是 `0.1.40`。
- `packages/cli/package.json` 版本是 `0.1.40`。
- `packages/codex-adapter/package.json` 版本是 `0.1.40`。
- `packages/openclaw-adapter/package.json` 版本是 `0.1.40`。
- `package-lock.json` 也已经把 workspace 包版本线同步到 `0.1.40`，包括根包、`@veewo/claw-core`、`@veewo/claw`、`@claw-kit/openclaw-adapter` 和 `@claw-kit/codex-adapter`。
- `@veewo/claw-core@0.1.40` 与 `@veewo/claw@0.1.40` 都已经成功发布到 npm registry。
- 通过 `npm view @veewo/claw-core version` 与 `npm view @veewo/claw version` 校验后，两个包当前都解析到 `0.1.40`。
- `npm publish` 偶尔会吐出 `bin[claw]` 之类的归一化警告，但这不能单独当成最终结论；发布后仍要用 `npm view @veewo/claw bin --json` 再核对 registry 里的 bin 映射，并跑真实的 `claw` 烟测确认命令面可用。
- `@veewo/claw-core@0.1.48` and `@veewo/claw@0.1.48` were published on 2026-06-23 and registry metadata now reports `version = latest = 0.1.48` for both packages.
- For `@veewo/claw@0.1.48`, registry metadata preserved `bin: { "claw": "dist/bin.js" }` and dependency `@veewo/claw-core: "0.1.48"` despite npm publish's auto-correct warning, so closeout should trust post-publish metadata over the warning text.
- Tarball metadata for `@veewo/claw@0.1.48` is `shasum = 6fcf756e3a85372b0203f0f510466c9615c9da65` and `integrity = sha512-dch0KwjKkLOEZrFwExGwAyKEQEq1udQ6ozh3PW3MPnSoEzw5tyMMuxRkSiriPFW58lHtW2pw2vWQKKz9h1Q+9g==`; `npm pack @veewo/claw@0.1.48` succeeded after the local npm cache was cleared.
- `packages/codex-adapter/.codex-plugin/plugin.json` 和本地 Codex plugin cache 也同步到了 `0.1.40+codex.20260616130425`，并且与仓库 manifest 保持一致。
- 本机 `claw --version` 当前返回 `0.1.48`。
- `npm list -g @veewo/claw --depth=0` 当前解析到 `@veewo/claw@0.1.48`。

当前发布链继续保持同一条稳定的 release target 判定规则：

- 如果合并后的 `HEAD` 已经领先于 npm registry 里的已发布 artifact，但 workspace 包版本号仍停留在旧值，则下一次发布必须先把整条 workspace/package 版本线整体推进到下一个补丁版本，再进入发布流程。
- release version bump scope must cover every workspace/package/plugin surface that can publish or package release payloads: root `package.json`, `packages/core/package.json`, `packages/cli/package.json`, `packages/codex-adapter/package.json`, `packages/openclaw-adapter/package.json`, `packages/opencode-adapter/package.json`, CLI/OpenClaw dependency pins on `@veewo/claw-core`, `package-lock.json`, and `packages/codex-adapter/.codex-plugin/plugin.json`.
- The Codex plugin manifest keeps the `semver+codex.<timestamp>` release shape; the 2026-06-23 `0.1.48` bump used `0.1.48+codex.20260623165853`.
- After editing package versions and internal dependency pins, regenerate lockfile metadata with `npm install --package-lock-only --ignore-scripts` so `package-lock.json` records the same release line before verification.
- Release-ready changes should be committed before publish so the registry artifact has a traceable source commit; the 2026-06-23 `0.1.48` source commit is `1e0911c` (`Release claw-kit 0.1.48`), covering config skill work, project config compatibility, task retention, shared skill sync, docs/truth/ADR, package metadata, lockfile, and Codex plugin manifest changes.
- The 2026-06-23 `0.1.48` release verification matrix included `npm run check`, core tests `78/78`, CLI tests `50/50`, Codex bundle tests `5/5`, OpenCode bundle tests `5/5`, npm pack dry-runs, temp `project.json` compatibility fixtures, registry metadata/tarball checks, global CLI install, and local Codex cache manifest plus `skills/config/SKILL.md` inspection.
- 如果 `npm view` 还没看到新版本，就不要把第一次 `npm run install:local-cli` 仍装到旧版本当成 release 失败；正确 closeout 是等 registry 可见后重跑一次本地 CLI 刷新。
- 如果 `npm view` 已经能看到新版本和 tarball metadata，但 `npm pack` 或安装仍报 `ETARGET`，先执行 `npm cache clean --force` 再重试 tarball retrieval；这类本地 cache / propagation split-brain 不等同于 registry publish 失败。
- 本地 Codex plugin cache 继续使用直接文件系统同步：把 `packages/codex-adapter` 下的 `.codex-plugin`、`hooks`、`references`、`scripts`、`skills` 与 `package.json` 同步进版本化缓存目录，再核对内容一致性。

发布前的本地验证闸门保持同一条稳定路径：

- `npm test` 必须通过。
- `npm run check` 必须通过。
- `npm view @veewo/claw-core version` 必须返回新版本。
- `npm view @veewo/claw version` 必须返回新版本。

正式发布后的本地刷新与验证也已经形成稳定事实：

- 发布完成后还需要把本地 CLI 刷新到刚发布的新版本；这轮稳定路径是 `npm run install:local-cli`。
- 如果 registry 可见性有短暂延迟，本地 CLI 刷新允许在新版本可见后重试一次；这轮第一次安装仍拿到 `0.1.39`，重试后才稳定切到 `0.1.40`。
- 这条安装验证已经成功，说明已发布的 CLI 包可以在本机继续稳定刷新；当前已验证版本是 `@veewo/claw@0.1.48`。

本地安装和缓存刷新仍然遵循同一条稳定路径：

- `npm run install:local-cli` 是这轮验证过的本机 CLI 刷新入口。
- 本地 Codex 插件缓存版本线需要和 `packages/codex-adapter/.codex-plugin/plugin.json` 保持一致；当前目标版本是 `0.1.48+codex.20260623165853`。
- `0.1.48` closeout verified the cache at `C:\Users\chany\.codex\plugins\cache\claw-kit-local\claw-kit\0.1.48+codex.20260623165853`, including matching manifest version and the generated `skills/config/SKILL.md` entry.
- 同步本地 Codex 插件缓存后，还要再次核对缓存目录里的 manifest 与仓库 `packages/codex-adapter/.codex-plugin/plugin.json` 完全一致。
- 同步时仍应复制 `.codex-plugin`、`hooks`、`references`、`scripts`、`skills` 和 `package.json`，避免缓存里的版本、提示词和钩子滞后。
- 如果 release round 明确把关键文件 hash 校验列为 closeout 证据，则本地 plugin cache 与仓库副本应继续保持 hash 一致。

## 相关代码

- [package.json](D:/Users/chany/Documents/claw-kit/package.json)
- [packages/core/package.json](D:/Users/chany/Documents/claw-kit/packages/core/package.json)
- [packages/cli/package.json](D:/Users/chany/Documents/claw-kit/packages/cli/package.json)
- [packages/codex-adapter/package.json](D:/Users/chany/Documents/claw-kit/packages/codex-adapter/package.json)
- [packages/openclaw-adapter/package.json](D:/Users/chany/Documents/claw-kit/packages/openclaw-adapter/package.json)
- [packages/opencode-adapter/package.json](D:/Users/chany/Documents/claw-kit/packages/opencode-adapter/package.json)
- [packages/codex-adapter/.codex-plugin/plugin.json](D:/Users/chany/Documents/claw-kit/packages/codex-adapter/.codex-plugin/plugin.json)
- [scripts/install-cli.ps1](D:/Users/chany/Documents/claw-kit/scripts/install-cli.ps1)

## 验证标准

- `npm run test`
- `npm run check`
- `npm run install:local-cli`
- `npm view @veewo/claw-core version`
- `npm view @veewo/claw version`
- `npm view @veewo/claw bin dependencies --json`
- `npm view @veewo/claw@<version> dist.tarball dist.integrity dist.shasum --json`
- `npm pack @veewo/claw@<version>`
- `claw --version`
- `npm list -g @veewo/claw --depth=0`
