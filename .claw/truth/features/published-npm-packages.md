# Published npm Packages

## 状态

这是 `publish-claw-npm-package` 完成后沉淀下来的稳定发布事实。当前最新一轮 release 完成边界已验证到 `0.1.86`，并继续沿用同一条双包发布链与 committed GitHub marketplace Codex plugin 发布协议；全局 CLI 与本机 Codex plugin 的刷新由发布后的独立 `update` workflow 负责，不属于 release 本身的完成条件。

## 结论

`claw-kit` 当前有两层可发布 npm 包：

- `@veewo/claw-core` 提供核心 `.claw` harness 语义。
- `@veewo/claw` 提供可发布的 CLI 入口，并依赖 `@veewo/claw-core`。

当前最新已验证发布版本线为 `0.1.86`；以下历史版本事实保留为发布链证据：

- 这次 closeout 把 root、`packages/core`、`packages/cli`、`packages/codex-adapter`、`packages/openclaw-adapter`、`packages/opencode-adapter`、`package-lock.json` 和 `packages/codex-adapter/.codex-plugin/plugin.json` 一起推进到同一轮 release surface，其中 Codex plugin manifest 对齐到 `0.1.53+codex.20260626141302`。
- `@veewo/claw-core@0.1.53` 与 `@veewo/claw@0.1.53` 都已经成功发布到 npm registry。
- 通过 `npm view @veewo/claw-core version dist-tags.latest --json` 与 `npm view @veewo/claw version dist-tags.latest bin --json` 校验后，两个包当前都解析到 `0.1.53`，且 `@veewo/claw` registry metadata 继续保留 `bin.claw = "dist/bin.js"`。
- 0.1.53 release verification passed the full local gate: `npm test` passed with core `85/85` and CLI `50/50`, `npm run check` passed, `npm run test:codex-plugin` passed `5/5`, `npm run test:opencode-plugin` passed `5/5`, `npm pack --dry-run -w @veewo/claw-core` produced `veewo-claw-core-0.1.53.tgz`, and `npm pack --dry-run -w @veewo/claw` produced `veewo-claw-0.1.53.tgz`.
- `npm run install:codex-plugin` 已把本地 Codex plugin cache 刷新到 `C:\Users\chany\.codex\plugins\cache\claw-kit-local\claw-kit\0.1.53+codex.20260626141302`，安装后的 `.codex-plugin/plugin.json` 与仓库 manifest 版本一致，并携带新的低复杂度 skip-before-plan entry copy。
- `@veewo/claw-core@0.1.58` 与 `@veewo/claw@0.1.58` 已经成功发布到 npm registry；这轮 closeout 还一起验证了 `npm test`、`npm run check`、`npm whoami` 以及两个 `npm pack --dry-run` 都通过。
- 0.1.58 release verification 的关键补丁之一是：当 package 版本推进时，`packages/core/test/core.test.ts` 里与协议版本绑定的硬编码期望也要一起更新，否则会先在 `initProject` scaffold 和 `ensureProjectProtocol` rewrite 相关断言上失败。
- 这轮发布还确认了三条可持续的 release surface 会一起变动：`autoUpdate` 默认仍为 `true`，`SessionStart` 的 prompt / auth wording 与 update-first 顺序会继续围绕 `startupRecovery.versionSync` 收敛，而 `update` 继续保持 template-backed skill package 形态。其当前源码所有权已拆分到两个 adapter，见 `.claw/truth/features/host-specific-update-skills.md`。
- `npm publish` 偶尔会吐出 `bin[claw]` 之类的归一化警告，但这不能单独当成最终结论；发布后仍要用 `npm view @veewo/claw bin --json` 再核对 registry 里的 bin 映射，并跑真实的 `claw` 烟测确认命令面可用。
- 2026-06-24 的 release audit 重新确认了 npm registry 的 `latest` 仍停留在 `0.1.50`，因此下一次 patch target 变为 `0.1.51`；这一轮 release-surface alignment 继续覆盖 root `package.json`、`packages/core/package.json`、`packages/cli/package.json`、`packages/codex-adapter/package.json`、`packages/openclaw-adapter/package.json`、`packages/opencode-adapter/package.json`、`package-lock.json` 和 `packages/codex-adapter/.codex-plugin/plugin.json`，其中 Codex plugin manifest 目标版本是 `0.1.51+codex.20260624140756`。
- 0.1.51 release verification passed the full local gate: `npm test` passed with core `85/85` and CLI `50/50`, `npm run check` passed, `npm run test:codex-plugin` passed `5/5`, `npm run test:opencode-plugin` passed `5/5`, `npm pack --dry-run -w @veewo/claw-core` produced `veewo-claw-core-0.1.51.tgz`, and `npm pack --dry-run -w @veewo/claw` produced `veewo-claw-0.1.51.tgz`.
- `@veewo/claw-core@0.1.48` and `@veewo/claw@0.1.48` were published on 2026-06-23 and registry metadata now reports `version = latest = 0.1.48` for both packages.
- For `@veewo/claw@0.1.48`, registry metadata preserved `bin: { "claw": "dist/bin.js" }` and dependency `@veewo/claw-core: "0.1.48"` despite npm publish's auto-correct warning, so closeout should trust post-publish metadata over the warning text.
- Tarball metadata for `@veewo/claw@0.1.48` is `shasum = 6fcf756e3a85372b0203f0f510466c9615c9da65` and `integrity = sha512-dch0KwjKkLOEZrFwExGwAyKEQEq1udQ6ozh3PW3MPnSoEzw5tyMMuxRkSiriPFW58lHtW2pw2vWQKKz9h1Q+9g==`; `npm pack @veewo/claw@0.1.48` succeeded after the local npm cache was cleared.
- `@veewo/claw-core@0.1.49` and `@veewo/claw@0.1.49` were published on 2026-06-23 for the workflowGuidance wording patch, and registry metadata reports `latest = 0.1.49` for both packages.
- `@veewo/claw-core@0.1.58` and `@veewo/claw@0.1.58` are now the newest published pair; the 0.1.58 closeout used the same release protocol, but the verification gate specifically caught stale hard-coded protocol-version expectations in `packages/core/test/core.test.ts` before the final pass.
- 2026-07-11 的 release baseline verification 再次确认 npm registry 当前仍报告 `@veewo/claw-core@0.1.58` 与 `@veewo/claw@0.1.58`，workspace/package surface 也仍停在 `0.1.58`，因此这一轮的 next publish target 应推进到 `0.1.59`，而不是复用本地旧预期。
- 这轮 baseline 还确认 `.claw/project.json` 必须继续保持 `autoUpdate: true`，这样项目版本推进到新发布版本后，startup recovery 才会把版本漂移稳定路由到 `claw-kit:update`。
- 如果本轮目标是专门验证自动更新链路，release baseline 可以刻意不刷新本地 CLI 或本地 Codex plugin cache；但前提仍是 npm auth 已可用，并且 registry / workspace 基线、下一目标版本与 `autoUpdate` gate 都已经先被明确核对。
- `0.1.59` 的 release verification gates 已再次确认当前稳定闸门没有变化：`npm test` 通过，覆盖 `@veewo/claw-core` build/test 与 `@veewo/claw` test suites；`npm run check` 通过，覆盖 core build、CLI typecheck、adapter checks 与 truth encoding audit；`npm run test:codex-plugin` 与 `npm run test:opencode-plugin` 都通过；`npm pack --dry-run -w @veewo/claw-core` 与 `npm pack --dry-run -w @veewo/claw` 也都成功。
- `0.1.59` 这一轮还确认了 auto-update 验证回合的正式 publish closeout 分流：`npm publish -w @veewo/claw-core` 与 `npm publish -w @veewo/claw` 成功后，只要 `npm view @veewo/claw-core version` 与 `npm view @veewo/claw version` 都已经解析到新版本，就可以把 registry publish 视为完成；此时本地 CLI 仍停在 `0.1.58`、本地 Codex plugin cache 仍停在旧安装面，也不构成这类回合的发布失败。
- `0.1.59` 的最终 release surface 已对齐到同一版本线：workspace/package surfaces 与 `.claw/project.json` 都推进到 `0.1.59`，并继续保持 `.claw/project.json.autoUpdate = true`，这样“已发布新版本但本地安装面故意滞后”的状态才能稳定留给后续 auto-update 验证。
- For `@veewo/claw@0.1.49`, registry metadata still preserves `bin: { "claw": "dist/bin.js" }` and dependency `@veewo/claw-core: "0.1.49"`; npm tarball retrieval succeeded after clearing the local npm cache.
- `packages/codex-adapter/.codex-plugin/plugin.json` 和本地 Codex plugin cache 也同步到了 `0.1.40+codex.20260616130425`，并且与仓库 manifest 保持一致。
- 本机 `claw --version` 当前返回 `0.1.49`。
- `npm list -g @veewo/claw --depth=0` 当前解析到 `@veewo/claw@0.1.49`。
- 这轮 release scope/version audit 把 registry 基线明确锁定在 `0.1.49`，并把下一次 patch target 选为 `0.1.50`；后续 release 决策应继续先读 `npm view @veewo/claw-core version` 和 `npm view @veewo/claw version`，再决定 bump 号，而不要直接沿用本地 workspace 里的旧版本印象。

当前发布链继续保持同一条稳定的 release target 判定规则：

- 如果合并后的 `HEAD` 已经领先于 npm registry 里的已发布 artifact，但 workspace 包版本号仍停留在旧值，则下一次发布必须先把整条 workspace/package 版本线整体推进到下一个补丁版本，再进入发布流程。
- release version bump scope must cover every workspace/package/plugin surface that can publish or package release payloads: root `package.json`, `packages/core/package.json`, `packages/cli/package.json`, `packages/codex-adapter/package.json`, `packages/openclaw-adapter/package.json`, `packages/opencode-adapter/package.json`, CLI/OpenClaw dependency pins on `@veewo/claw-core`, `package-lock.json`, and `packages/codex-adapter/.codex-plugin/plugin.json`.
- Release template version alignment is part of that same surface. `scripts/update-template-versions.mjs` discovers every `TEMPLATE.json` below `shared/skills`, `packages/codex-adapter/skills`, and `packages/opencode-adapter/skills`, and also owns the built-in default at `packages/core/src/templates/plans/default.ts`; all must equal root `package.json.version`.
- The maintained update order is `npm run sync:template-versions`, then `npm run sync:shared-skills`, then `npm run check:template-versions`. The checker is read-only: stale or missing versions fail with every exact path and the expected version instead of silently rewriting release inputs.
- `npm run verify:release` / `npm run publish:release` call the same template-version assertion before shared-skill consistency and publish readiness checks, so a partially updated adapter copy or stale built-in default blocks release.
- The Codex plugin manifest keeps the `semver+codex.<timestamp>` release shape; the 2026-06-23 `0.1.48` bump used `0.1.48+codex.20260623165853`.
- After editing package versions and internal dependency pins, regenerate lockfile metadata with `npm install --package-lock-only --ignore-scripts` so `package-lock.json` records the same release line before verification.
- Release-ready changes should be committed before publish so the registry artifact has a traceable source commit; the 2026-06-23 `0.1.48` source commit is `1e0911c` (`Release claw-kit 0.1.48`), covering config skill work, project config compatibility, task retention, shared skill sync, docs/truth/ADR, package metadata, lockfile, and Codex plugin manifest changes.
- The 2026-06-23 `0.1.48` release verification matrix included `npm run check`, core tests `78/78`, CLI tests `50/50`, Codex bundle tests `5/5`, OpenCode bundle tests `5/5`, npm pack dry-runs, temp `project.json` compatibility fixtures, registry metadata/tarball checks, global CLI install, and local Codex cache manifest plus `skills/config/SKILL.md` inspection.
- The 2026-06-23 `0.1.49` source commit is `a593180` (`Release claw-kit 0.1.49`); its release verification matrix included `npm run check`, core tests `78/78`, CLI tests `50/50`, Codex bundle tests `5/5` after serial rerun, OpenCode bundle tests `5/5`, npm pack dry-runs for core and CLI, registry metadata/tarball checks, global CLI install, local Codex cache install, and verification that `dist/workflow-guidance.config.json` plus all-tasks-done `claw plan edit` expose the new delegateSubagents note.
- `0.1.50` 这轮版本元数据 bump 已同步覆盖 root `package.json`、`@veewo/claw-core`、`@veewo/claw`、`packages/codex-adapter`、`packages/openclaw-adapter`、`packages/opencode-adapter`、`package-lock.json` 以及 `packages/codex-adapter/.codex-plugin/plugin.json`；其中 CLI 对 `@veewo/claw-core` 的依赖和 `openclaw` adapter 的依赖都已对齐到 `0.1.50`。
- `packages/codex-adapter/.codex-plugin/plugin.json` 这轮被设为 `0.1.50+codex.20260623210218`，后续本地 Codex plugin cache 也应以这个 manifest 版本为目标值。
- `npm install --package-lock-only` 在这台 Windows 工作区里曾因超时而中断，但在先前 `npm view` 给出的 0.1.49 registry 基线下，package-lock 已按 workspace 语义重新对齐，最终没有留下任何 `0.1.49` 的包元数据。
- 如果 `npm view` 还没看到新版本，就不要把第一次 `npm run install:local-cli` 仍装到旧版本当成 release 失败；正确 closeout 是等 registry 可见后重跑一次本地 CLI 刷新。
- 如果 `npm view` 已经能看到新版本和 tarball metadata，但 `npm pack` 或安装仍报 `ETARGET`，先执行 `npm cache clean --force` 再重试 tarball retrieval；这类本地 cache / propagation split-brain 不等同于 registry publish 失败。
- 本地 Codex plugin cache 继续使用直接文件系统同步：把 `packages/codex-adapter` 下的 `.codex-plugin`、`hooks`、`references`、`scripts`、`skills` 与 `package.json` 同步进版本化缓存目录，再核对内容一致性。
- 这次 `0.1.50` closeout 已完成真实发布与推送闭环：`npm view @veewo/claw-core version` 和 `npm view @veewo/claw version` 都解析到 `0.1.50`，`npm view @veewo/claw dependencies --json` 也确认 `@veewo/claw-core: 0.1.50`；`npm run check` 在修复 `.claw/truth/adr/sqlite-memory-store-concurrency-and-busy-error-semantics.md` 的 UTF-8 BOM 后通过，`npm test` 通过（core `85/85`、CLI `50/50`），`npm pack --dry-run -w @veewo/claw-core` 与 `npm pack --dry-run -w @veewo/claw` 都产出了 `0.1.50` tarball 预览，`claw --version` 最终回到 `0.1.50`，本地 CLI 路径为 `C:\nvm4w\nodejs\claw.ps1`，本地 Codex plugin cache 位于 `C:\Users\chany\.codex\plugins\cache\claw-kit-local\claw-kit\0.1.50+codex.20260623210218`，最终 `HEAD` 与 `origin/main` 都停在 `d3bdb0dcf60440daafae3493a80f4fe377015a04`。

早期 release 使用过以下完整验证矩阵；当前发布按具体风险比例化选择这些 checks，并始终运行 canonical release gate：

- `npm test`、`npm run check`、`npm run test:codex-plugin`、`npm run test:opencode-plugin` 与两个 workspace 的 `npm pack --dry-run` 都是可按改动风险选用的检查，不再机械要求每轮完整复刻。
- `npm run verify:release` / `npm run publish:release` 始终负责版本对齐、shared-skill 同步、committed marketplace payload、隔离 template smoke、clean worktree 与 exact `main == origin/main` gate。
- `npm view @veewo/claw-core version` 必须返回新版本。
- `npm view @veewo/claw version` 必须返回新版本。

正式发布后的独立用户端 update 与验证也已经形成稳定事实：

- release 完成后另行调用 `claw-kit:update`；该 workflow 通过 `npm run install:local-cli` 刷新全局 CLI，并从 official GitHub marketplace 刷新 Codex plugin。
- 如果 registry 可见性有短暂延迟，本地 CLI 刷新允许在新版本可见后重试一次；这轮第一次安装仍拿到 `0.1.39`，重试后才稳定切到 `0.1.40`。
- `0.1.49` closeout 当时已验证发布后的 CLI 包可以在本机稳定刷新到 `@veewo/claw@0.1.49`；这是版本化历史证据，不是当前安装版本声明。
- release closeout 与 update closeout 是两个完成边界；本地 CLI 与 installed plugin 在 release 回合继续停留旧版本不构成 publish 未完成。

本地安装和缓存刷新仍然遵循同一条稳定路径：

- `npm run install:local-cli` 是这轮验证过的本机 CLI 刷新入口。
- 本地 Codex 插件缓存版本线需要和 `packages/codex-adapter/.codex-plugin/plugin.json` 保持一致；`0.1.49` closeout 当时的目标版本是 `0.1.49+codex.20260623172440`。
- `0.1.48` closeout verified the cache at `C:\Users\chany\.codex\plugins\cache\claw-kit-local\claw-kit\0.1.48+codex.20260623165853`, including matching manifest version and the generated `skills/config/SKILL.md` entry.
- `0.1.49` closeout installed the local Codex plugin cache at `C:\Users\chany\.codex\plugins\cache\claw-kit-local\claw-kit\0.1.49+codex.20260623172440`.
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
- [scripts/update-template-versions.mjs](D:/Users/chany/Documents/claw-kit/scripts/update-template-versions.mjs)
- [packages/core/src/templates/plans/default.ts](D:/Users/chany/Documents/claw-kit/packages/core/src/templates/plans/default.ts)
- [scripts/install-cli.ps1](D:/Users/chany/Documents/claw-kit/scripts/install-cli.ps1)

## 验证标准

- `npm run test`
- `npm run check`
- `npm run check:template-versions`
- `npm run install:local-cli`
- `npm view @veewo/claw-core version`
- `npm view @veewo/claw version`
- `npm view @veewo/claw bin dependencies --json`
- `npm view @veewo/claw@<version> dist.tarball dist.integrity dist.shasum --json`
- `npm pack @veewo/claw@<version>`
- `claw --version`
- `npm list -g @veewo/claw --depth=0`

## 2026-07-13：0.1.61 发布与本地刷新完成态

- `@veewo/claw-core@0.1.61` 与 `@veewo/claw@0.1.61` 已发布；npm registry 的 `latest` 均确认指向 `0.1.61`。
- Registry metadata 已确认 CLI 的 `bin.claw` 仍映射为 `dist/bin.js`，因此发布后的命令入口合同未漂移。
- 本机首次全局安装超时时，没有遗留可用的 `claw` shim。恢复时只终止该次孤立的安装进程链，然后直接重新执行全局安装；不需要清理或改写仓库内容。
- 最终全局 CLI 为 `0.1.61`，实际解析路径是 `C:\Users\chany\AppData\Roaming\npm\claw.ps1`。
- 本地 Codex plugin cache 已刷新到 `C:\Users\chany\.codex\plugins\cache\claw-kit-local\claw-kit\0.1.61+codex.20260713153132`，cache 内包含由共享源生成的 `skills/config/SKILL.md`。
## 2026-07-14：受 GitHub 提交约束的 0.1.62 发布闸门

### 长期规则

npm registry 发布不能单独证明其他机器可获得相同源代码或 Codex skill。发布必须通过 `npm run verify:release`；真正发布只允许使用 `npm run publish:release`。两者共用 `scripts/publish-release.mjs`，它在执行任何 `npm publish` 前强制检查：

- 根目录、`packages/core`、`packages/cli`、Codex/OpenClaw/OpenCode adapter 的版本与 release version 一致；CLI 对 `@veewo/claw-core` 的依赖和 Codex manifest 的 `<version>+codex.<timestamp>` 也必须对齐。
- `git status --porcelain` 必须为空，防止未提交的 skill、模板或版本改动进入只有本机可见的发布状态。
- `HEAD` 必须是 `origin/main` 的祖先；脚本会先 `git fetch origin --prune`，未推送到 GitHub 的 commit 会直接阻止 npm 发布。
- 在临时目录实际生成 Codex bundle，并验证 shared-materialized skills 与 adapter-owned `update` 都保留完整入口和声明资源。`update` 不再来自 shared staging；其 Codex package 必须直接随已提交的 adapter payload 进入 bundle。

`--publish` 通过上述闸门后，按 `@veewo/claw-core`、`@veewo/claw` 的顺序发布。发布后仍应使用 `npm view` 确认 registry 版本及 CLI metadata。

### 已验证基线

release commit `472635e` 已推送至 `origin/main`，tag 为 `v0.1.62`；`@veewo/claw-core@0.1.62` 和 `@veewo/claw@0.1.62` 已发布。该流程修复了此前 npm 包可能领先 GitHub source、导致其他电脑安装旧 Codex 插件并缺失 skill 的发布断链。

本机 closeout 进一步验证：全局 `@veewo/claw@0.1.62` 解析到 `C:\Users\chany\AppData\Roaming\npm\claw.ps1`；Codex cache 为 `0.1.62+codex.20260714120000`，包含 10 个 skills，并携带 `update`、`create-claw-skill` 及其模板；Codex bundle test 通过 6/6。

这组证据证明发布物和本机安装面的版本、文件覆盖完整，但不证明 skill-local 模板已经接入 CLI 的 seed-template resolver。`update` 的 `--template update` 自举缺陷及端到端验收边界见 `.claw/truth/features/shared-planning-skill-source.md`。

### 关联代码

- `scripts/publish-release.mjs`
- `scripts/codex-plugin-bundle.mjs`
- `package.json` (`verify:release`、`publish:release`)
- `packages/codex-adapter/.codex-plugin/plugin.json`
### GitHub Release 插件资产

`v0.1.62` 的 GitHub Release 除 source/tag 外还附带 `claw-kit-codex-plugin-0.1.62.zip`。该 zip 是供其他电脑安装相同 Codex 插件内容的分发资产；安装后应确认本地 cache 中的 skill 数量为 10，并包含发布闸门要求的 `planning`、`config`、`update`、`create-claw-skill`。因此跨电脑更新不能只刷新 npm CLI，必须选择与目标 release tag 对应的 Codex 插件资产。

## 2026-07-15：CLI 与 Codex 插件命令面一致性

发布门禁除了校验 GitHub source、npm 版本和 bundle 文件覆盖外，还必须校验 bundle 中 skill 文本引用的 CLI 命令已存在于**同一 release 版本**的已安装 `claw`。插件 cache 可以因本地未发布提交而领先 registry CLI；仅以 cache manifest、skill 数量或 npm version 相同不能证明运行时合同一致。

一次 divergence audit 的实测基线是：全局 `claw --version` 为 `0.1.62`，而 `claw template validate --help` 返回 `Unknown help topic: template`；同时本地 Codex plugin 的 `create-claw-skill` guidance 已引用 `claw template validate`。因此在合并并发布包含新 skill/template guidance 的版本前，该 guidance 不可被视为可由当前已发布 CLI 执行。

后续 release 验收应在从 registry 安装或全局刷新后的 CLI 上，对每个新增或修改的 skill 所引用的 CLI command/subcommand 运行 `--help`（或等价 focused smoke）。这项命令面 smoke 与 bundle 完整性检查互补：前者验证可执行合同，后者验证文件分发合同。
## 2026-07-15：仓库所有者的直接发布治理

该仓库的默认 release 路径是直接从当前检出的 `main` 发布：不创建 feature/release branch，也不创建 PR；只有仓库所有者明确要求时才改用 branch/PR 审核路径。此前集成分支直接推送到 `origin/main` 后，GitHub 自动将 draft PR #1 标记为 merged，这个 PR 状态只是该策略的结果，不构成后续发布所需的步骤。

发布前必须确认没有任何仍有价值的未提交本地源码内容；发布完成后也必须再次确认工作区没有遗留仍有价值的未提交源码内容。若发现这类内容，先纳入当前 `main` 的可追溯提交并推送，再发布或宣布 closeout；不得用 branch/PR 来替代这一完整性检查。

现有 GitHub-source gate 继续适用：`git status --porcelain` 为空，且 `HEAD` 已包含在 `origin/main`。直接发布政策只改变默认协作路径，不降低 source、版本、bundle、registry 或 CLI 命令面验证要求。

## 2026-07-15：0.1.63 正式发布与双 Codex cache 验收

本节记录当前最新已验证发布完成态，并取代文首较旧的“最新版本为 `0.1.58`”描述。

### 发布结果

- `npm run publish:release` 已按固定顺序正式发布 `@veewo/claw-core@0.1.63` 与 `@veewo/claw@0.1.63`；npm registry 的 `latest` 对两个包均已更新到 `0.1.63`。
- `npm publish` 将 CLI package 中的 bin 路径从 `./dist/bin.js` 规范化为 `dist/bin.js`。该归一化不是命令入口丢失：发布后的 registry manifest 仍包含 `bin.claw = "dist/bin.js"`。
- 从 registry 真实执行 `npm install -g @veewo/claw@0.1.63` 后，`claw --version` 返回 `0.1.63`，证明 registry metadata、tarball 与全局 CLI 运行面一致。

### Codex 插件安装面

- 维护者本地开发 cache 已安装到 `C:\Users\chany\.codex\plugins\cache\claw-kit-local\claw-kit\0.1.63+codex.20260715132514`。
- Codex 官方 marketplace cache 已存在于 `C:\Users\chany\.codex\plugins\cache\claw-kit\claw-kit\0.1.63+codex.20260715132514`。这两个目录代表不同安装入口，但 manifest 版本应保持一致。
- 从 marketplace cache 实际执行模板验证时，`update/TEMPLATE.json` 与 `create-claw-skill/TEMPLATE.json` 均验证成功，响应中的 `choiceRequiredTasks` 与模板任务约束一致。
- 该轮 marketplace cache 同时包含 `planning`、`config`、`update`、`create-claw-skill`；在 `0.1.63` 时四者仍按 shared skill 统计。当前 `update` 已改为 adapter-owned package，但该历史 cache 证据仍证明 marketplace 安装保留了模板与 helper 资源。

### 长期验证规则

- publish 输出中的 `bin[claw]` 路径归一化只能视为 npm metadata 修正，不能单独判定发布失败；必须继续核对 registry manifest 的 `bin.claw`，并通过从 registry 全局安装后的真实 `claw --version` 烟测闭环。
- 该轮曾区分 `claw-kit-local` 维护者开发 cache 与 `claw-kit` official marketplace cache；这只是 `0.1.63` 的版本化历史。当前 update 完成态只接受 enabled `claw-kit@claw-kit` 的 official source/cache，`claw-kit@claw-kit-local` 不再是受支持的 release 或 update 证据。
- marketplace cache 验收不能只统计 skill 目录；还必须分别验证 shared-materialized skills 与 adapter-owned `update` 的 `TEMPLATE.json`、helper 等声明资源，并用 cache 中的真实模板执行 `claw template validate`，检查 `choiceRequiredTasks`。
- 本轮正式发布完成时，`main` 与 `origin/main` 的 ahead/behind 为 `0/0`，且发布 closeout 工作树干净。该 Git 状态是发布源可追溯性的结束证据；后续 truth deposition 自身产生的文档修改不改变这一已完成发布事实。

### 验证锚点

- `npm view @veewo/claw-core version dist-tags.latest --json`
- `npm view @veewo/claw version dist-tags.latest bin --json`
- `npm install -g @veewo/claw@0.1.63`
- `claw --version`
- `C:\Users\chany\.codex\plugins\cache\claw-kit-local\claw-kit\0.1.63+codex.20260715132514`
- `C:\Users\chany\.codex\plugins\cache\claw-kit\claw-kit\0.1.63+codex.20260715132514`
- `skills/update/TEMPLATE.json`
- `skills/create-claw-skill/TEMPLATE.json`
- `skills/create-claw-skill/scripts/create-claw-skill-stub.mjs`
- `git rev-list --left-right --count main...origin/main`
- `git status --porcelain`

### 补充检索词

- `0.1.63 publish:release`
- `bin.claw dist/bin.js`
- `claw-kit-local marketplace cache`
- `choiceRequiredTasks marketplace template validate`
- `main origin/main 0/0 clean`

### GitHub Release 资产

- GitHub Release `v0.1.63` 已创建：`https://github.com/chanyuenpang/claw-kit/releases/tag/v0.1.63`。
- 已上传跨机器 Codex 插件资产 `claw-kit-codex-plugin-0.1.63.zip`，文件大小为 `45086` bytes，SHA256 为 `cba118e3e7f60c5a930afa9e604c367bbc1e749fb43d2ec9e90fedcd4697a7f5`。
- 下载或分发该 release asset 时，应同时核对 tag、精确文件名、文件大小与 SHA256；仅看到 release 页面或同名 zip 不足以证明资产未被截断或替换。

## 2026-07-16：0.1.64 发布与本机分发 closeout

- `0.1.64` 的可追溯 source commits 为 `753f92a`（rebase 后的 workflow optimization）、`c4cd18a`（package / manifest / test version alignment）和 `bfbff96`（`.claw/project.json` 对齐到 `0.1.64`）；发布 source 已推送，`origin/main` 与本地 `main` 对齐。
- 发布前 gate 通过 core `114/114`、CLI `63/63`、Codex bundle `11/11`、OpenCode bundle `5/5`，以及包含 truth encoding audit 的 `npm run check`；`@veewo/claw-core` 与 `@veewo/claw` 的 dry-run tarball 均成功。
- npm publish 继续按 `@veewo/claw-core` 后 `@veewo/claw` 的依赖顺序执行。Registry `latest` 对两个包都已解析到 `0.1.64`。
- CLI registry metadata 已验证 `bin = { "claw": "dist/bin.js" }` 且依赖 `@veewo/claw-core = "0.1.64"`。Published tarball shasum 分别为 core `7ded28caa10341f434141d9abd390b433de62c74`、CLI `de398a58b5235d9e85fbc881f8f112b9e1502fc0`。
- 全局 npm install 已刷新到 `@veewo/claw@0.1.64`；`claw --version` 返回 `0.1.64`，shim 为 `C:\Users\chany\AppData\Roaming\npm\claw.ps1`。`claw context` 同时确认 `cliVersion = projectVersion = 0.1.64` 且 protocol check 为 `ok`。
- Codex development marketplace source 为 `C:\Users\chany\.agents\plugins\claw-kit-local\plugins\claw-kit`，versioned cache 为 `C:\Users\chany\.codex\plugins\cache\claw-kit-local\claw-kit\0.1.64+codex.20260716013733`。Repo、marketplace source 与 cache 三处 manifest 一致；排除 `*.test.mjs` 后，`29` 个 payload 文件的 SHA256 全部一致。
- 已安装 global workflow config 实测为 truth writer `required = false`、`dispatchCondition = main_agent_confirms_reusable_truth`，ADR writer `required = true`；cache 中的 planning skill 也包含由 main agent 自主判断是否拆分 verification 与 closure task 的当前合同。
- GitHub Release [`v0.1.64`](https://github.com/chanyuenpang/claw-kit/releases/tag/v0.1.64) 已创建并上传 `claw-kit-codex-plugin-0.1.64.zip`；资产大小为 `46421` bytes，SHA256 为 `a52bdde9dc8962e527a04ddc18ec0df8404c9ac0adf92d9ccf34034632301c83`。

## 2026-07-16：0.1.65 发布与本机分发 closeout

- 发布提交 `130ce37` 已推送到 `main`。发布前验证通过 core `114/114`、CLI `63/63`、Codex bundle `11/11`、OpenCode bundle `6/6`、`npm run check`，以及 core / CLI pack dry-run。
- 对 npm registry 的无缓存直查确认 `@veewo/claw-core@0.1.65` 与 `@veewo/claw@0.1.65` 均为 `latest = 0.1.65`；精确 CLI package metadata 保留 `bin = { "claw": "dist/bin.js" }`。
- 全局 npm 已安装 `@veewo/claw@0.1.65`，shim 为 `C:\Users\chany\AppData\Roaming\npm\claw.ps1`，`claw -v` 输出 `0.1.65`。
- Codex development cache 位于 `C:\Users\chany\.codex\plugins\cache\claw-kit-local\claw-kit\0.1.65+codex.20260716022702`，其中 manifest version 与该 cache 目录版本匹配。
- GitHub Release [`v0.1.65`](https://github.com/chanyuenpang/claw-kit/releases/tag/v0.1.65) 已创建并上传 `claw-kit-codex-plugin-0.1.65.zip`；资产大小为 `46439` bytes，SHA256 为 `1e5238cc50a0703ce80879ec1c3fb9f1d48af425ba908696c5bddcea08ec46f3`。

## 2026-07-16：0.1.66 发布与自包含 writer 合同 closeout

- `0.1.66` 的 source commit 是 `f62de32b8005229c3341b5584c56866d134ba233`；fetch 后本地 `main`、`origin/main` 与 `git ls-remote` 均匹配该提交。
- npm registry 已确认 `@veewo/claw-core` 与 `@veewo/claw` 的 `latest` 都是 `0.1.66`。在全新隔离目录执行 `npm install @veewo/claw@0.1.66` 后生成了 `claw`、`claw.cmd`、`claw.ps1` 三种 shim，registry metadata 保持 `bin = { "claw": "dist/bin.js" }`。
- GitHub Release [`v0.1.66`](https://github.com/chanyuenpang/claw-kit/releases/tag/v0.1.66) 已发布，状态为非 draft、非 prerelease。
- GitHub Release `v0.1.66` 已附带跨机器 Codex 插件资产 [`claw-kit-codex-plugin-0.1.66.zip`](https://github.com/chanyuenpang/claw-kit/releases/download/v0.1.66/claw-kit-codex-plugin-0.1.66.zip)；文件大小为 `44517` bytes，SHA256 为 `cda2337ba9e6edaf30835cf05e922128263007f10993465be88f0e5141323770`。
- 本机全局 `claw -v` 返回 `0.1.66`；Codex development cache 版本为 `0.1.66+codex.20260716052528`，OpenCode 已安装 adapter package 版本为 `0.1.66`。
- Release verification 已通过完整 core / CLI tests、`npm run check`、Codex bundle `11/11`、OpenCode bundle `6/6`、`git diff --check`，以及 `npm run verify:release` 的隔离安装与模板验证。
- 本轮发布的长期内容包括：Truth / ADR writer skills 成为自包含单文件 subagent contracts；writer 记录仓库位置时统一使用项目根相对路径；Summary 创建与维护职责已移除，遗留 `SUMMARY.md` 继续被 search indexing 排除。详细合同见 `.claw/truth/features/delegated-review-and-deposition.md`。

## 2026-07-16：0.1.67 asset-free Git marketplace release

- Release source commit 是 `ce64583fbb9f3308c8a03eb0330c0d3225313da6`；该提交位于 `main`，并在 publish 前推送到 `origin/main`。
- Release verification 通过完整 core / CLI tests、`npm run check`、Codex bundle `12/12`、OpenCode bundle `6/6`、shared skill sync tests `3/3`、core / CLI 两个 npm pack dry-run，以及受 source gate 保护的 `npm run verify:release`。
- npm registry 的 `latest` 已确认是 `@veewo/claw-core@0.1.67` 与 `@veewo/claw@0.1.67`；本机全局 `claw -v` 返回 `0.1.67`。
- GitHub Release [`v0.1.67`](https://github.com/chanyuenpang/claw-kit/releases/tag/v0.1.67) 已发布，状态为非 draft、非 prerelease，并且精确包含 `0` 个 assets。
- 真实 Codex repository flow 已通过：`codex plugin marketplace add chanyuenpang/claw-kit --ref main`，随后执行 `codex plugin add claw-kit@claw-kit`。
- Active official identity 是 `claw-kit@claw-kit`，已安装并启用到 `0.1.67+codex.20260716054831`；Git marketplace snapshot manifest 与 official cache manifest 均匹配该版本。
- 旧的 `claw-kit@claw-kit-local` identity 已移除且不再安装。其 development source / cache 仅刷新到 `0.1.67` 供维护者检查，没有重新启用该 identity。
- OpenCode 已安装 adapter 版本为 `0.1.67`。

## 2026-07-16：0.1.68 official identity 与本机安装面

- Release commit 是 `6decd9a`，已位于 `origin/main`；npm registry 的 `latest` 已验证为 `@veewo/claw-core@0.1.68` 与 `@veewo/claw@0.1.68`，本机全局 `claw` 也已验证为 `0.1.68`。
- 当前真正启用的 Codex identity 是 `claw-kit@claw-kit`；`claw-kit@claw-kit-local` 没有启用。判断 active runtime 必须看 identity 状态，不能因为 development source/cache 存在就推断 local identity 正在生效。
- 维护命令 `npm run install:codex-plugin` 负责刷新 development local source 与 versioned cache；它不会自动把 active official identity 切换成 local identity，也不能单独证明当前运行的是刚刷新的 payload。
- 当 `codex plugin list` 不可访问时，可用 repository bundle installer 将 repository bundle materialize 到 official `claw-kit@claw-kit` cache；这条恢复路径的验收仍需核对 active identity、official source manifest 与 official cache manifest，而不是只看 installer 成功退出。
- 本轮 active source 证据是 `origin/main` 的 manifest `0.1.68+codex.20260716225625`，official cache manifest 与其完全同版；official active source/cache 内均已确认存在 `planning`、`config`、`update` 与 `create-claw-skill`。
- official 与 development 两套 artifact 可以同时存在，但只有启用的 identity 决定当前 Codex 加载面。release/update closeout 应分别报告 global CLI、active identity、active source manifest、active cache manifest 与 required skills presence。

## 2026-07-17：0.1.69 发布与 direct-development 安装面

### 已验证完成态

- Release source commit `cf884c0` 已推送到 `origin/main`；发布 closeout 时 `origin/main...HEAD` 的 ahead/behind 为 `0/0`，工作区为空。
- npm registry 已确认 `@veewo/claw-core` 与 `@veewo/claw` 的 `version`、`dist-tags.latest` 都是 `0.1.69`；CLI registry metadata 保持 `bin = { "claw": "dist/bin.js" }`。
- 本机全局 npm 安装解析为 `@veewo/claw@0.1.69`，`claw --version` 返回 `0.1.69`。真实 `claw help plan start` 已暴露原子 plan 命令面，说明当前全局 shim 不只是版本元数据更新，实际命令路由也来自新版本。
- Codex direct-development source manifest 与 versioned cache manifest 均为 `0.1.69+codex.20260717011110`，两份 manifest 的 SHA256 相同；`planning`、`config`、`update`、`create-claw-skill` 在 source 与 cache 两侧均存在。
- 当前 Codex 配置已启用 `claw-kit@claw-kit-local`，并停用旧的 `claw-kit@claw-kit`。因此本轮预期加载面从 official identity 切换到 direct-development identity；不能再用旧 official cache 的存在推断 active runtime。

### 加载验证边界

- source/cache manifest、SHA256、skill presence 与 identity 配置只能证明待加载安装面已经一致，不能证明当前长任务已经重新加载该 locator。
- Codex 必须先重启，并在重启后新建任务，才能验证实际加载 locator；新任务应直接核对运行时暴露的 plugin locator / skill source 是否指向 `claw-kit@claw-kit-local` 的 `0.1.69+codex.20260717011110` cache。
- 在完成上述重启后新任务验收前，closeout 应明确报告“direct-development 安装面已刷新且配置已切换，但实际 loaded locator 待验证”，不能把 source/cache 文件一致性升级成运行时加载证据。

### 验证锚点

- `npm view @veewo/claw-core@0.1.69 version dist-tags.latest --json`
- `npm view @veewo/claw@0.1.69 version dist-tags.latest bin --json`
- `npm list -g @veewo/claw --depth=0`
- `claw --version`
- `claw help plan start`
- `packages/codex-adapter/.codex-plugin/plugin.json`
- `skills/planning/SKILL.md`
- `skills/config/SKILL.md`
- `skills/update/SKILL.md`
- `skills/create-claw-skill/SKILL.md`
- `git rev-list --left-right --count origin/main...HEAD`
- `git status --porcelain`

### 关键检索词

- `0.1.69 cf884c0 direct-development`
- `claw help plan start atomic commands`
- `claw-kit@claw-kit-local enabled`
- `claw-kit@claw-kit disabled`
- `0.1.69+codex.20260717011110 source cache hash`
- `restart new task loaded locator`

## 2026-07-17：0.1.70 发布与本机安装验证

### 已验证完成态

- Release commit `5fe06e2b9eff5e0437551b112ad4a812423a5a34` 同时位于本地 `main` 与 `origin/main`。
- npm registry 已确认 `@veewo/claw-core` 与 `@veewo/claw` 的 `version`、`dist-tags.latest` 均为 `0.1.70`。npm publish 虽输出 bin normalization warning，但 registry 最终元数据仍是 `{ "claw": "dist/bin.js" }`；发布判断应以 registry 回读为准，而不是仅凭 warning 推断 bin 损坏。
- release 验证通过 core `126/126`、CLI `72/72`、Codex bundle `13/13`、OpenCode bundle `7/7`、完整 `npm run check`、truth encoding audit、core / CLI `npm pack --dry-run`，以及仓库 `npm run verify:release`。
- 本机 `Get-Command claw` 解析到 `C:\Users\chany\AppData\Roaming\npm\claw.ps1`；`claw --version` 与全局 npm list 均确认 `0.1.70`。
- Codex plugin cache 安装在 `C:\Users\chany\.codex\plugins\cache\claw-kit-local\claw-kit\0.1.70+codex.20260717024830`；cache 内的 `using-claw-kit` 已包含 claw plan mutation 与 schema-compatible `hostActions` 在同一个 code-mode call 中消费的合同。
- `claw context` 同时报告 project / CLI `0.1.70`、protocol check `ok`、`updateAvailable = false`。这与 registry、全局 shim、plugin cache 和 source commit 证据共同构成本轮本地发布收敛证明。

### 验证锚点

- `npm view @veewo/claw-core@0.1.70 version dist-tags.latest --json`
- `npm view @veewo/claw@0.1.70 version dist-tags.latest bin --json`
- `npm list -g @veewo/claw --depth=0`
- `Get-Command claw`
- `claw --version`
- `claw context`
- `npm run verify:release`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `git rev-parse main`
- `git rev-parse origin/main`

### 关键检索词

- `0.1.70 5fe06e2b release registry latest`
- `0.1.70+codex.20260717024830 same-call hostActions`
- `npm bin normalization warning registry bin`
- `verify:release protocol ok updateAvailable false`

## 2026-07-17：0.1.70 当前运行时边界与质量复验

- 本轮复验时，npm registry 的 `@veewo/claw` / `@veewo/claw-core`、全局 CLI 与全局安装包、仓库 `packages/cli` / `packages/core`、`.claw/project.json` 均对齐到 `0.1.70`；仓库位于 `main`，HEAD 为 `f0bcc05d9757162e907a3fb1c8ce66fd998b0716`。
- 当前线程实际绑定的 plugin snapshot 为 `0.1.70+codex.20260717024830`；全局命令 shim 为 `C:\\Users\\chany\\AppData\\Roaming\\npm\\claw.ps1`。真实 `claw plan start --help` 与原子命令 smoke 均成功，因此这次边界确认同时覆盖版本字符串、安装来源、线程 snapshot 与关键 capability，而不是只比较 package version。
- `npm test` 通过 core `126/126`、CLI `72/72`，合计 `198/198`，wall time `63.923s`；`npm run check` 通过全部 adapters 与 truth encoding audit，wall time `9.003s`。
- 后续复验 `0.1.70` 时，最低证据仍应同时覆盖 registry 双包、全局包与 shim、仓库双包、`.claw/project.json`、线程 plugin snapshot、仓库 HEAD，以及新增命令的真实 help / smoke。

### 关键检索词

- `0.1.70 f0bcc05d runtime boundary`
- `0.1.70+codex.20260717024830 plan start smoke`
- `198/198 truth encoding audit`

## 2026-07-17：0.1.71 发布与固定 Codex consumer 安装验证

### 已验证完成态

- Release commit `0415269` 已推送到 `origin/main`；发布 closeout 时 `origin/main...main` 的 ahead/behind 为 `0/0`，证明本地与远端 source 已收敛。
- npm registry 回读确认 `@veewo/claw-core` 与 `@veewo/claw` 的 `version`、`dist-tags.latest` 均为 `0.1.71`；CLI package 的 bin metadata 为 `{ "claw": "dist/bin.js" }`。
- 本机全局命令 shim 为 `C:\Users\chany\AppData\Roaming\npm\claw.ps1`，全局 npm package 与真实 CLI 运行面均为 `0.1.71`。
- direct-development Codex cache 为 `C:\Users\chany\.codex\plugins\cache\claw-kit-local\claw-kit\0.1.71+codex.20260717033049`。cache 已确认包含 `scripts/code-mode-host-action-consumer.mjs`，且 `skills/using-claw-kit/SKILL.md` 包含内嵌固定 `runClawPlanMutation` driver；这证明本轮新增的程序化 consumer 同时进入 versioned plugin payload 与实际 skill 执行合同。
- `claw context` 同时报告 project / CLI `0.1.71` 且 `updateAvailable = false`。registry 双包、全局 package/shim、Codex cache payload、project/CLI context 和 Git `0/0` 共同构成本轮发布闭环。

### 验证锚点

- `npm view @veewo/claw-core@0.1.71 version dist-tags.latest --json`
- `npm view @veewo/claw@0.1.71 version dist-tags.latest bin --json`
- `npm list -g @veewo/claw --depth=0`
- `Get-Command claw`
- `claw --version`
- `claw context`
- `scripts/code-mode-host-action-consumer.mjs`
- `skills/using-claw-kit/SKILL.md`
- `git rev-list --left-right --count origin/main...main`

### 关键检索词

- `0.1.71 0415269 registry latest`
- `0.1.71+codex.20260717033049 runClawPlanMutation`
- `code-mode-host-action-consumer plugin cache`
- `origin/main main 0/0 updateAvailable false`

## 2026-07-17：0.1.72 `ensure_goal` target-state 发布闭环

### 已验证完成态

- Release commit `9e34285` 已推送到 `origin/main`。发布 closeout 时本地 `main` 与 `origin/main` 的 ahead/behind 为 `0/0`，且 `git status --porcelain` 为空；source、远端与工作树已经完整收敛。
- npm registry 回读确认 `@veewo/claw-core` 与 `@veewo/claw` 的 `version`、`dist-tags.latest` 均为 `0.1.72`；CLI registry metadata 继续保留 `bin = { "claw": "dist/bin.js" }`。
- 本机全局 npm package 与真实 `claw --version` 均为 `0.1.72`，证明 registry artifact、全局安装面与 CLI 运行面一致。
- 该 `0.1.72` 发布回合当时启用的 Codex identity 是 `claw-kit@claw-kit-local`。development source manifest 与 versioned cache manifest 均为 `0.1.72+codex.20260717024800`；两侧 payload 都包含 `scripts/code-mode-host-action-consumer.mjs`、`skills/using-claw-kit/SKILL.md` 中的固定 driver，以及本轮关键 skills。
- 本轮 cache/source 验收不仅比较 manifest：固定 consumer 与 driver 已包含 schema v2 `ensure_goal` target-state 合同，证明 active identity 对应的安装面实际携带本轮 Codex Goal 收敛实现。

### 验证锚点

- `npm view @veewo/claw-core@0.1.72 version dist-tags.latest --json`
- `npm view @veewo/claw@0.1.72 version dist-tags.latest bin --json`
- `npm list -g @veewo/claw --depth=0`
- `claw --version`
- `packages/codex-adapter/.codex-plugin/plugin.json`
- `packages/codex-adapter/scripts/code-mode-host-action-consumer.mjs`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `git rev-list --left-right --count main...origin/main`
- `git status --porcelain`

### 关键检索词

- `0.1.72 9e34285 registry latest`
- `0.1.72+codex.20260717024800 claw-kit-local`
- `ensure_goal consumer driver source cache`
- `main origin/main 0/0 clean`

## 2026-07-17：0.1.76 发布与 SDK-owned knowledge closeout 安装验证

### 已验证完成态

- Release commit `10881b9` 已推送到 `origin/main`；发布 closeout 时本地 `main` 与 `origin/main` 完全一致，且工作区干净。
- npm registry 已确认 `@veewo/claw-core@0.1.76` 与 `@veewo/claw@0.1.76` 发布完成；CLI registry metadata 继续保留 `bin.claw = "dist/bin.js"`。
- 本机全局 CLI shim 为 `C:\Users\chany\AppData\Roaming\npm\claw.ps1`，真实 CLI 版本为 `0.1.76`。
- 当前启用的 Codex identity 是 `claw-kit@claw-kit-local`；本机 Codex plugin cache 已刷新到 `0.1.76+codex.20260717200812`，其 SDK runtime 版本为 `0.144.5`。Codex 需要重启并新建任务后才会加载这份新插件版本。
- 本轮完整验证通过 core `132/132`、CLI `90/90`、Codex bundle `13/13`、OpenCode bundle `7/7`，合计 `242/242`；完成计划为 `6/6`、状态 `end.completed`。

### 验证锚点

- `npm view @veewo/claw-core@0.1.76 version dist-tags.latest --json`
- `npm view @veewo/claw@0.1.76 version dist-tags.latest bin --json`
- `C:\Users\chany\AppData\Roaming\npm\claw.ps1`
- `packages/codex-adapter/.codex-plugin/plugin.json`
- `git rev-list --left-right --count main...origin/main`
- `git status --porcelain`

### 关键检索词

- `0.1.76 10881b9 registry latest`
- `0.1.76+codex.20260717200812 claw-kit-local`
- `Codex SDK runtime 0.144.5 knowledge closeout`
- `core 132 CLI 90 Codex 13 OpenCode 7`

## 2026-07-17：发布后才运行 update skill，Codex 只允许 GitHub identity

- 项目发布流程必须先完成版本发布并验证 GitHub/npm，再调用 update skill 更新本机安装面；禁止用未发布的工作区内容提前刷新插件。
- Codex 唯一受支持的 identity 是 `claw-kit@claw-kit`。`claw-kit@claw-kit-local` 必须保持 disabled，不能再作为开发、发布或更新成功路径。
- `npm run install:codex-plugin` 改为克隆已发布的 GitHub `main` marketplace，将 payload 写入 official cache `~/.codex/plugins/cache/claw-kit/claw-kit/<version>`，启用 official identity 并禁用 local identity。
- release 脚本在 npm publish 成功后明确提示下一步调用 update skill，从而把“发布”和“安装更新”固定为有序的两个阶段。

## 2026-07-18：0.1.80 session-scoped knowledge-writer 发布与真实 worker 验收

- Release commit `33b78e795fde1d06f334402ad4b3c3c5c03de737` 已推送到 `origin/main`；该 release closeout 边界内 `main = origin/main` 且工作树干净。其后的本地修改属于更新的工作树状态，不能反向改写这条历史 release 证据。
- npm registry 已确认 `@veewo/claw-core@0.1.80` 与 `@veewo/claw@0.1.80`；发布包中的 `@veewo/claw` 依赖固定为 `@veewo/claw-core: 0.1.80`。
- 全局 CLI 已刷新到 `0.1.80`；official Codex identity `claw-kit@claw-kit` 已安装并启用 `0.1.80+codex.20260718175907`。
- 刷新后的新任务从正式 versioned cache 加载 `knowledge-writer`，自动创建用户级 `scope: session` plan，完成四阶段 route，保持 Truth/ADR 修改 `0/0` 的 evidence-backed no-op，并且没有递归触发 knowledge finalization。
- 真实安装还暴露并修复了重复安装时向 `config.toml` 写入重复 `enabled` 键的幂等性缺陷；修复及回归测试包含在同一 `0.1.80` 发布边界。
- 官方 marketplace full clone 在 Windows GitHub pack transfer 上停滞时，已验证的局部恢复是 fast-forward 现有 clean official checkout 后重新执行 plugin add；完成判定仍要求 source revision、identity、cache manifest、skill contents 与新任务 loaded locator 一起对齐，不能把该恢复手段升级为无条件跳过 clean/source 检查的通用捷径。

## 2026-07-18：0.1.81 OpenCode knowledge finalization 加固发布

- Release commit `3602fef404623d9af33dd326f5a3109e3e9c0228` 已直接推送到 `origin/main`；发布前 `npm run verify:release` 证明 committed Git marketplace snapshot、版本对齐和隔离 template smoke 均通过。
- npm registry 回读确认 `@veewo/claw-core@0.1.81` 与 `@veewo/claw@0.1.81` 的 `dist-tags.latest` 均为 `0.1.81`；CLI metadata 保留 `bin.claw = "dist/bin.js"` 并固定依赖 `@veewo/claw-core: 0.1.81`。两包 shasum 分别为 `649b61c14d75a0c8e86121e216e0ac6efd435bb1` 与 `76cca43cfcf8d7f6376e01239c8fa088fc9993b9`。
- 本轮完整验证通过 core `133/133`、CLI `109/109`、Codex bundle `17/17`、OpenCode bundle `10/10`，并通过 TypeScript、manifest、Truth encoding 与 diff checks。
- 全局 CLI 已刷新到 `0.1.81`。安装验证边界内 official GitHub marketplace checkout 与 release payload revision 均为 `3602fef404623d9af33dd326f5a3109e3e9c0228`；后续纯 Truth closeout commit 不改变该插件 payload。唯一启用的 claw-kit identity 是 `claw-kit@claw-kit`，source/cache manifest 均为 `0.1.81+codex.20260718214738`，knowledge-writer skill hash 一致，所需 shared skills 齐全且 retired `truth-writer` / `adr-writer` 不存在。
- OpenCode finalizer 的硬完成条件现在要求独立 session 中的 `knowledge-writer` plan 达到 `end.completed` 且所有 template tasks 为 `done`；runner 会移除父 Codex session identity，并从真实 OpenCode CLI NDJSON 顶层事件恢复 child `sessionID`。OpenCode writer agent 是 `mode: primary` 的自包含入口，只加载 `claw-kit:knowledge-writer`。

## 2026-07-19：0.1.82 host-owned workflow skill 发布

- Release commit `6c68605a6afb1787c10bede6adf4c168c0a5100a` 已直接推送到 `origin/main`；完成边界内本地 `main`、`origin/main` 与工作树完全收敛。
- npm registry 已确认 `@veewo/claw-core@0.1.82` 与 `@veewo/claw@0.1.82` 发布完成；GitHub Release `v0.1.82` 已发布。
- 本机全局 CLI 已刷新到 `0.1.82`；唯一启用的 Codex identity 是 `claw-kit@claw-kit`，official source/cache manifest 均为 `0.1.82+codex.20260719000436`，`claw-kit@claw-kit-local` 保持 disabled。
- 本轮长期交付包括：Codex 与 OpenCode 各自拥有独立 `update` skill package；`create-claw-skill` 按 whole-task、independent-stage 与 mixed-stage ownership 路由，并依赖 core 的显式-template session-scope 自动选择；`using-claw-kit` 创建 plan 后只跟随 CLI 返回的 `workflowGuidance`。
- 完整验证、专项回归、两个 npm pack dry-run 与 release dry-run 均通过。仓库根目录直接解析裸 `--template update` 时可能同时发现 Codex/OpenCode 两个同名 template 并报告歧义；后续精确文件入口使已加载的 host skill 可以直接选择相邻 `TEMPLATE.json`，无需共享平台选择 workflow。

## 2026-07-19：0.1.83 精确 skill 模板来源发布

- Release commit `49f2c2f` 已直接推送到 `origin/main`；本轮 knowledge closeout 的只读新鲜度检查确认本地 `main`、`origin/main` 仍指向该提交且没有更晚或重叠的工作树差异。
- npm registry 在发布完成边界确认 `@veewo/claw-core@0.1.83` 与 `@veewo/claw@0.1.83`；GitHub Release `v0.1.83` 已发布，全局 CLI 已刷新到 `0.1.83`。
- official Codex source/cache 在完成边界均为 `0.1.83+codex.20260719013549`；唯一启用的 identity 是 `claw-kit@claw-kit`，`claw-kit@claw-kit-local` 保持 disabled。运行时采用新 skill 仍以重启 Codex 后创建新任务为边界。
- `plan create` 与 `subplan create` 新增互斥于 `--template` 的 `--template-file` 精确来源，并把解析出的 `templateFile` 持久化到 plan；裸 template id 发现和 session-scope 自动逻辑保持兼容。template-backed skills 与 `create-claw-skill` generator 解析当前已加载 `SKILL.md` 的目录并传入相邻 `TEMPLATE.json`，不再依赖同名模板的全局扫描顺序。
- template guidance 可以直接引用 effective project config 的 canonical 标量叶子；自定义变量由 `project.json.var` 命名空间拥有，例如 `{{var.releaseChannel}}`，标准字段仍直接使用 `{{externalPlanningSkill}}`。
- 完成报告记录的验证结果为 core `134/134`、CLI `113/113`、插件专项 `34/34`；这些是 `0.1.83` 发布完成边界的版本化证据，不替代后续版本的当前验证。

## 2026-07-19：0.1.84 发布完成态

- Release commit `ac308e5870fde61b6147d0ceb35f4f12439bd534` 已直接推送到 `origin/main`，tag 为 `v0.1.84`；发布完成边界内本地 `main`、`origin/main` 与工作树完全收敛。
- npm registry 已确认 `@veewo/claw-core@0.1.84` 与 `@veewo/claw@0.1.84` 发布完成；CLI、core、Codex/OpenClaw/OpenCode adapter package surfaces 均对齐到 `0.1.84`，Codex plugin manifest 为 `0.1.84+codex.20260719151633`。
- 完成报告记录的验证结果为 core `134/134`、CLI `116/116`、Codex `17/17`、OpenCode `11/11`。这些是 `0.1.84` 发布完成边界的版本化证据，不替代后续版本的当前验证。
- npm 的 moderate audit 提示与 package field normalization warning 未阻止本轮发布；当前协议仍以 release gate、registry 回读、Git/source/tag 收敛和插件产物验证作为完成判据。

## 2026-07-19：0.1.84 本机 update 完成态

- 发布后的独立 update workflow 已把全局 `@veewo/claw` CLI 刷新到 `0.1.84`，并把官方 Codex plugin 刷新到 `0.1.84+codex.20260719151633`；唯一启用的 identity 是 `claw-kit@claw-kit`，`claw-kit@claw-kit-local` 保持 disabled。
- 该完成边界内，GitHub source manifest 与 official cache manifest hash 一致；active cache 包含 `planning`、`config`、`update`、`create-claw-skill` 和 `knowledge-writer`，已退休的 `truth-writer`、`adr-writer` 不存在。
- 当时 Git clone 通道持续停滞，因此安装使用了经目标版本校验的 GitHub 官方 `main.zip` 快照，再交给维护的 cache/identity installer；没有使用开发工作区内容。这个版本化结果不改变 `.claw/truth/features/host-specific-update-skills.md` 所拥有的当前恢复边界，也不证明完成 update 的旧任务已经热加载新 skill；运行时采用仍以重启 Codex 后新建任务为界。

## 2026-07-19：0.1.85 发布与 official source recovery 完成态

- Release commit `b594d4aa34c98e34402eb6c7c1c7f875ab25f562` 已推送到 `origin/main`，tag 为 `v0.1.85`；该完成边界内 `main = origin/main` 且工作树干净。npm registry 已确认 `@veewo/claw-core@0.1.85` 与 `@veewo/claw@0.1.85`。
- 本机全局 CLI 已刷新到 `0.1.85`；Codex appserver 识别 `claw-kit@claw-kit` 的 `0.1.85+codex.20260719162741` 为 installed/enabled，`claw-kit@claw-kit-local` 保持 disabled。
- official marketplace full clone 两次停在 `index-pack` 后，对同一官方 GitHub origin 的现有 checkout 使用 HTTP/1.1 filtered shallow fetch，成功把 marketplace `main` 恢复到 `b594d4aa34c98e34402eb6c7c1c7f875ab25f562`。随后从该实际 source 重装 versioned cache；source/cache 各 28 个文件，raw tree SHA-256 均为 `69439b64710267adb9c18c5f79dae716c61d75869ce09126515ce4b3624b6186`，零差异。
- active cache 包含 `planning`、`config`、`update`、`create-claw-skill` 与 `knowledge-writer`，已退休的 `truth-writer`、`adr-writer` 不存在。`config.toml` 的旧 `last_revision` 提示字段没有被超时的 appserver 写回，因此它不是完成判据；marketplace HEAD、appserver identity、manifest 与 source/cache payload 一致性共同构成这次版本化完成证据。
- 完成报告记录完整测试、Codex adapter `12/12`、Codex bundle `17/17`、OpenCode bundle `11/11` 和 release verifier 通过；这些是 `0.1.85` 完成边界的版本化证据。运行时采用新 skill 仍以重启 Codex 后新建任务为界。

## 2026-07-20：0.1.86 发布完成态

- Release commit `2f7481c915381ea9d34902bf8a7a39df66466cde` 已直接推送到 `origin/main`，tag 为 `v0.1.86`；该 release 完成边界内 `main = origin/main` 且工作树干净。后续出现的工作树内容属于更晚状态，不能反向改写这条历史完成证据。
- npm registry 在完成报告边界确认 `@veewo/claw-core@0.1.86` 与 `@veewo/claw@0.1.86` 均为 `latest`。当前 checkout 的 root、core、CLI 与 Codex/OpenClaw/OpenCode adapter package surfaces 仍为 `0.1.86`，CLI 依赖固定为 `@veewo/claw-core: 0.1.86`。
- committed Codex marketplace payload 的 manifest 为 `0.1.86+codex.20260720013140`。release gate 已确认版本对齐、committed marketplace snapshot、必要 skill 资源、隔离 template smoke，以及发布前后的 clean-worktree / exact `main == origin/main` 条件。
- 本轮发布采用比例化验证：针对改动运行 focused checks，并由 `npm run verify:release` / `npm run publish:release` 承担稳定的版本、Git source、Codex bundle 与 clean-worktree gate；不把机械扩大的验证矩阵作为每次 release 的固定要求。
- 本轮没有刷新本机全局 CLI 或已安装 Codex plugin。当前发布协议把这两项留给发布后的独立用户端 `update` workflow；release 脚本在 npm publish 后也只提示调用 `claw-kit:update`，不得使用未发布的 workspace payload 代替该流程。

## 2026-07-20：0.1.86 独立 update 安装面与运行时采用完成

- 发布后的独立 `update` workflow 已把全局 `@veewo/claw` CLI 刷新到 `0.1.86`；完成报告同时记录 `claw --version = 0.1.86`。
- Codex 更新面只启用 official identity `claw-kit@claw-kit`，并禁用 `claw-kit@claw-kit-local`。official marketplace 使用 `chanyuenpang/claw-kit` 的 `main` revision `2f7481c`，source/cache manifest 均为 `0.1.86+codex.20260720013140`，且两份 manifest 的 hash 一致。
- active cache 包含 `planning`、`config`、`update`、`create-claw-skill` 与 `knowledge-writer`；已退休的 `truth-writer`、`adr-writer` 不存在。这是该版本安装面的完成证据，不改变 `.claw/truth/features/host-specific-update-skills.md` 对当前更新合同的所有权。
- 后续独立新任务已实际加载 `C:\Users\chany\.codex\plugins\cache\claw-kit\claw-kit\0.1.86+codex.20260720013140\skills\using-claw-kit\SKILL.md`，并确认 installed source/cache 两端该 skill 的 SHA-256 一致。该 loaded locator 完成了 restart/new-task runtime adoption 边界；空的 `claw-kit-local` cache 壳既未出现在 enabled plugin identity 中，也不构成竞争安装面。
- CLI 安装留下旧 sharp DLL 临时目录未清理的 warning，但 CLI 与 plugin 两个更新面均已通过上述版本、identity、manifest 与 skill-presence 检查；该 warning 是本轮版本化安装附注，不是当前 update 合同的新完成判据。
