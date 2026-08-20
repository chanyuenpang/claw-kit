# Published npm Packages

<!-- state: current -->
## 当前行为

- `claw-kit` 发布三个 npm 包：`@veewo/claw-core` 提供核心 `.claw` harness 语义，`@veewo/claw-client` 提供 client API，`@veewo/claw` 提供 CLI 并精确依赖同版本的 Core 与 Client。
- 当前本文已有完成证据的最新 CLI/Core npm 发布版本为 `0.2.19`；`@veewo/claw-core`、`@veewo/claw-client` 与 `@veewo/claw` 均已发布，immutable `v0.2.19` tag、公开 GitHub Release 和 npm 真实取包均已验证。Cindy `0.2.19.0` 与 Codex `0.2.19.1` 是独立发布的 marketplace artifact，不属于 npm 完成边界，也不证明本机安装已刷新。
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
- `npm run check:template-versions`
- `npm view @veewo/claw-core version dist-tags.latest --json`
- `npm view @veewo/claw-client version dist-tags.latest --json`
- `npm view @veewo/claw version dist-tags.latest bin dependencies --json`
- `git rev-list --left-right --count main...origin/main`
- `git status --porcelain`

<!-- state: history -->
## 演进记录

<!-- dated: 2026-08-20 -->
### 0.2.22 CLI/Core/Client 发布完成态

- `@veewo/claw-core`、`@veewo/claw-client` 与 `@veewo/claw` `0.2.22` 已发布；三个 npm 包的 `latest`、真实 tarball 取包、`v0.2.22` 和公开 GitHub Release 均已完成验证。
- 该记录仅覆盖 npm artifact family。Codex `0.2.22.1` 和 Cindy `0.2.22.0` 保持各自独立的 marketplace source release 边界，且不包含任何本机安装刷新。

<!-- dated: 2026-08-15 -->
### 0.2.19 CLI/Core/Client 发布完成态

- `@veewo/claw-core`、`@veewo/claw-client` 与 `@veewo/claw` `0.2.19` 已发布，三个 registry `latest`、真实安装的 `claw --version`、`v0.2.19` 和公开 GitHub Release 已完成验证。
- 该记录只覆盖 npm artifact family；Codex `0.2.19.1` 与 Cindy `0.2.19.0` 的 marketplace source releases 保持各自独立完成边界，未包含任何本机安装刷新。

<!-- dated: 2026-08-09 -->
### 0.2.17 CLI/Core 发布完成态

- `@veewo/claw-core` 与 `@veewo/claw` `0.2.17` 已发布并完成 npm 真实取包验证；immutable `v0.2.17` tag 与 GitHub Release 属于同一完成边界。
- 该次 npm 证据不推断 Client 已发布，也不把 Codex `0.2.17.1`、Cindy `0.2.17.0` 的独立 marketplace 发布或任何本机安装刷新纳入 npm 完成态。

<!-- dated: 2026-08-03 -->
### 0.2.9 CLI/Core/Client 与独立 Cindy source release

- `@veewo/claw-core`、`@veewo/claw-client` 与 `@veewo/claw` `0.2.9` 已发布并可从 npm 获取；`v0.2.9` 与 GitHub Release 指向 `11f1294`。
- Cindy marketplace source `0.2.9.1` 已在其独立仓库的 `main` 提交并打上 `vcindy-0.2.9.1`。该 source release 不包含 Cindy 安装；Codex 仅版本对齐而未发布。

<!-- dated: 2026-08-04 -->
### 0.2.11 CLI/Core/Client 与独立 marketplace releases

- `@veewo/claw-core`、`@veewo/claw-client` 与 `@veewo/claw` `0.2.11` 已从 `78faeec` 发布并可真实获取；`v0.2.11` 与非 draft、非 prerelease GitHub Release 指向同一 commit。
- Cindy marketplace `0.2.11.1` 从独立仓库 commit `b194613` 以 `vcindy-0.2.11.1` 发布，不含 `.cindy` 或 GitHub Release。Codex marketplace `0.2.11.1` 从主仓库 commit `653a06c` 以 `vcodex-0.2.11.1` 和零资产 GitHub Release 发布。
- 三条 source/artifact completion 均不包含本机 CLI、Cindy 或 Codex 安装刷新；该采用证明仍属于另行授权的 update workflow。

<!-- dated: 2026-08-07 -->
### 0.2.15 CLI/Core 与独立 marketplace releases

- `@veewo/claw-core` 与 `@veewo/claw` `0.2.15` 已发布并完成 npm 真实取包验证；immutable `v0.2.15` tag 与 GitHub Release 属于同一完成边界。
- Cindy 与 Codex `0.2.15.1` 已作为独立 marketplace artifact 发布。该记录不把任何本机 CLI 或 plugin 安装刷新表述为完成。
