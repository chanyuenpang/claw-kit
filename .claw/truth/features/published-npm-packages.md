# Published npm Packages

<!-- state: current -->
## 当前行为

- `claw-kit` 发布三个 npm 包：`@veewo/claw-core` 提供核心 `.claw` harness 语义，`@veewo/claw-client` 提供 client API，`@veewo/claw` 提供 CLI 并精确依赖同版本的 Core 与 Client。
- 当前本文已有完成证据的最新 CLI/Core/Client npm 发布版本为 `0.2.32`；`@veewo/claw-core`、`@veewo/claw-client` 与 `@veewo/claw` 均已发布。独立的 Codex `0.2.32.0` 官方 marketplace artifact 与 DSH `0.2.32.0` source release（npm `0.2.32-rc.0`）也已发布；这些 artifact 的发布完成态不代表本机全局 CLI、Codex installation 或 DSH profile 已刷新。
- CLI release version bump 覆盖 root、lockfile、Core、Client、CLI、各 adapter baseline、内部 `@veewo/claw-core` / `@veewo/claw-client` 依赖和 Codex plugin manifest。root `package.json.version` 同时是全部 plugin `TEMPLATE.json` 与 built-in default template 的版本权威。
- 模板版本维护顺序固定为 `npm run sync:template-versions`、`npm run sync:shared-skills`、`npm run check:template-versions`。`npm run verify:release` 与 `npm run publish:release` 复用只读版本断言，禁止发布时隐式修复 stale template。
- owner 直接从 `main` 交付。发布前必须提交并推送有价值内容，使本地 `main` 精确等于 `origin/main` 且 `git status --porcelain` 为空；不得用 stash、临时分支或 PR 绕过门禁。
- canonical release gate 固定覆盖版本与内部依赖对齐、shared-skill 同步、committed Codex marketplace payload、隔离 template smoke、clean worktree 与 exact `main == origin/main`。完整测试、adapter bundle tests 和三个 npm 包的 dry-run 按本轮实际风险比例化追加。
- npm 发布顺序固定为 `@veewo/claw-core`、`@veewo/claw-client`、`@veewo/claw`。release 完成态直接核对 GitHub source/tag、三个 npm 包与 `dist-tags.latest`、committed Codex marketplace payload 和 clean worktree。
- release 与用户端 `update` 是两个有序完成边界。release 不要求刷新本机全局 CLI 或 installed Codex plugin；发布后由独立 `claw-kit:update` 从已发布 npm 与 official GitHub marketplace 刷新，并只允许 `claw-kit@claw-kit` identity。
- `release-claw-kit` 是仓库本地的 artifact-family router，不随 Codex plugin 发布。CLI/npm 发布由 `release-claw-cli` 执行；Codex、Cindy、OpenClaw 与 OpenCode 各由独立 platform release skill 执行。artifact-specific ownership 和 Cindy installer/update 合同由 `.claw/truth/features/artifact-specific-plugin-release-and-cindy-update.md` 及其 ADR 拥有。
- 新模板协议可能让旧的正式 CLI 无法加载待发布模板。release 开发阶段可以临时把全局 `claw` link 到已构建的 workspace CLI/core 以解除自举阻塞，但这不是发布或 update 完成证据；registry 可见后必须恢复正式 npm 安装，Codex plugin 仍不得从未发布 workspace payload 刷新。
- npm registry 传播可能短暂滞后。若 metadata 尚未看到新版本，应等待可见后再进入独立 update；若 metadata 已可见但 tarball retrieval 报 `ETARGET`，先清理本地 npm cache 再重试，不能把本地 cache stale 误判为 publish 回滚。

## 实现锚点

- `package.json`
- `packages/core/package.json`
- `packages/client/package.json`
- `packages/cli/package.json`
- `packages/codex-adapter/.codex-plugin/plugin.json`
- `.agents/skills/release-claw-kit/SKILL.md`
- `.agents/skills/release-claw-cli/SKILL.md`
- `.agents/skills/release-claw-cli/TEMPLATE.json`
- `packages/codex-adapter/skills/update/SKILL.md`
- `scripts/publish-release.mjs`
- `scripts/update-template-versions.mjs`
- `scripts/install-cli.ps1`
- `packages/core/src/templates/plans/default.ts`

## 验证规则

- `npm run verify:release`
- `npm run publish:release`
- `verify:release` / `publish:release` now gate only Core, Client, and CLI. Coordinated marketplace, adapter-version, shared-skill, plugin-bundle, and cross-artifact template checks run only through explicit `verify:batch-release` / `publish:batch-release`.
- `npm run check:template-versions`
- `npm view @veewo/claw-core version dist-tags.latest --json`
- `npm view @veewo/claw-client version dist-tags.latest --json`
- `npm view @veewo/claw version dist-tags.latest bin dependencies --json`
- `git rev-list --left-right --count main...origin/main`
- `git status --porcelain`

<!-- state: history -->
## 演进记录

<!-- dated: 2026-08-28 -->
### 0.2.32 CLI/Core/Client、Codex 与 DSH 发布完成态

- `@veewo/claw-core`、`@veewo/claw-client` 与 `@veewo/claw` `0.2.32` 已从主仓提交 `ca5ceaa` 发布；公开 npm 安装、CLI 执行、`v0.2.32` 与 GitHub Release 均已核验。
- Codex `0.2.32.0` 已以无 ZIP 附件的 `vcodex-0.2.32.0` GitHub Release 发布。DSH `0.2.32.0` 已以 immutable `vdsh-0.2.32.0` source tag 和 npm `@veewo/dsh-claw-kit@0.2.32-rc.0` 发布；本轮没有刷新本机全局 CLI、Codex installation 或 DSH profile。

<!-- dated: 2026-08-28 -->
### 0.2.31 CLI/Core/Client 与独立 Codex 发布完成态

- `@veewo/claw-core`、`@veewo/claw-client` 与 `@veewo/claw` `0.2.31` 已从主仓 `d4e7868` 发布；focused verification、package smoke、registry retrieval、`v0.2.31` 和 GitHub Release 均已核验。
- Codex `0.2.31.1` 已以独立 `vcodex-0.2.31.1` GitHub Release 发布。DSH 的 `vdsh-0.2.31.0` source tag 已推送，但 npm 仅为 `0.2.31-rc.0`，不应将其表述为正式 npm 发布；Cindy 的源码 gitlink 已纳入本轮主仓提交但未发布 Cindy artifact。

<!-- dated: 2026-08-24 -->
### 0.2.27 CLI 与官方 Codex plugin 用户端刷新

- 全局 `@veewo/claw` 已刷新到 `0.2.27`，官方 `claw-kit@claw-kit` Codex plugin 已刷新到 `0.2.27.0`。
- 刷新使用 `chanyuenpang/claw-kit` GitHub marketplace，且本地开发 identity 已清除；该记录是用户端 update 完成证据，不改变 npm 与 marketplace artifact 各自的发布边界。

<!-- dated: 2026-08-20 -->
### 0.2.23 CLI/Core/Client 发布完成态

- `@veewo/claw-core`、`@veewo/claw-client` 与 `@veewo/claw` `0.2.23` 已发布；三个 npm 包的真实 registry 获取、`v0.2.23` 和公开 GitHub Release 均已完成验证。
- 该记录仅覆盖 npm artifact family。Codex `0.2.23.1` 和 Cindy `0.2.23.0` 保持各自独立的 marketplace source release 边界，且不包含任何本机安装刷新。

<!-- dated: 2026-08-20 -->
### 0.2.22 CLI/Core/Client 发布完成态

- `@veewo/claw-core`、`@veewo/claw-client` 与 `@veewo/claw` `0.2.22` 已发布；三个 npm 包的 `latest`、真实 tarball 取包、`v0.2.22` 和公开 GitHub Release 均已完成验证。
- 该记录仅覆盖 npm artifact family。Codex `0.2.22.1` 和 Cindy `0.2.22.0` 保持各自独立的 marketplace source release 边界，且不包含任何本机安装刷新。

<!-- dated: 2026-08-15 -->
### 0.2.19 CLI/Core/Client 发布完成态

- `@veewo/claw-core`、`@veewo/claw-client` 与 `@veewo/claw` `0.2.19` 已发布，三个 registry `latest`、真实安装的 `claw --version`、`v0.2.19` 和公开 GitHub Release 已完成验证。
- 该记录只覆盖 npm artifact family；Codex `0.2.19.1` 与 Cindy `0.2.19.0` 的 marketplace source releases 保持各自独立完成边界，未包含任何本机安装刷新。
