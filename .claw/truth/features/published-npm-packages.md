# Published npm Packages

<!-- document-state: current -->

<!-- state: current -->
## 当前行为

- `claw-kit` 发布两个 npm 包：`@veewo/claw-core` 提供核心 `.claw` harness 语义，`@veewo/claw` 提供 `claw` CLI 并精确依赖同版本的 `@veewo/claw-core`。
- 当前最新已验证发布版本线为 `0.1.87`。release commit `aaa00adf6dbb86b79e1055bdea0320de011f0009` 同时是本地 `main`、`origin/main` 与 tag `v0.1.87`；Codex marketplace manifest 为 `0.1.87+codex.20260720175041`。
- release version bump 覆盖 root、lockfile、core、CLI、Codex/OpenClaw/OpenCode adapters、内部 `@veewo/claw-core` 依赖和 Codex plugin manifest。root `package.json.version` 同时是全部 plugin `TEMPLATE.json` 与 built-in default template 的版本权威。
- 模板版本维护顺序固定为 `npm run sync:template-versions`、`npm run sync:shared-skills`、`npm run check:template-versions`。`npm run verify:release` 与 `npm run publish:release` 复用只读版本断言，禁止发布时隐式修复 stale template。
- owner 直接从 `main` 交付。发布前必须提交并推送有价值内容，使本地 `main` 精确等于 `origin/main` 且 `git status --porcelain` 为空；不得用 stash、临时分支或 PR 绕过门禁。
- canonical release gate 固定覆盖版本与内部依赖对齐、shared-skill 同步、committed Codex marketplace payload、隔离 template smoke、clean worktree 与 exact `main == origin/main`。完整测试、adapter bundle tests 和双包 dry-run 按本轮实际风险比例化追加。
- 双包发布顺序固定为先 `@veewo/claw-core`、后 `@veewo/claw`。release 完成态直接核对 GitHub source/tag、npm 双包与 `dist-tags.latest`、committed Codex marketplace payload 和 clean worktree。
- release 与用户端 `update` 是两个有序完成边界。release 不要求刷新本机全局 CLI 或 installed Codex plugin；发布后由独立 `claw-kit:update` 从已发布 npm 与 official GitHub marketplace 刷新，并只允许 `claw-kit@claw-kit` identity。
- Codex 维护者的完整发布入口是 `claw plan create --template release-claw-kit --title release-claw-kit`。相邻的 `release-claw-kit` template 以 8 个无 choice 的线性任务串联版本准备、比例化验证、direct-`main` 推送、guarded publish、GitHub/npm/committed-plugin 验收与 published-source Codex 更新；第 6 个任务先完成 artifact release，第 7 至 8 个任务才进入独立安装更新边界。
- 新模板协议可能让旧的正式 CLI 无法加载待发布模板。release 开发阶段可以临时把全局 `claw` link 到已构建的 workspace CLI/core 以解除自举阻塞，但这不是发布或 update 完成证据；registry 可见后必须恢复正式 npm 安装，Codex plugin 仍不得从未发布 workspace payload 刷新。
- npm registry 传播可能短暂滞后。若 metadata 尚未看到新版本，应等待可见后再进入独立 update；若 metadata 已可见但 tarball retrieval 报 `ETARGET`，先清理本地 npm cache 再重试，不能把本地 cache stale 误判为 publish 回滚。

## 实现锚点

- `package.json`
- `packages/core/package.json`
- `packages/cli/package.json`
- `packages/codex-adapter/.codex-plugin/plugin.json`
- `packages/codex-adapter/skills/release-claw-kit/SKILL.md`
- `packages/codex-adapter/skills/release-claw-kit/TEMPLATE.json`
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
- `npm view @veewo/claw version dist-tags.latest bin dependencies --json`
- `git rev-list --left-right --count main...origin/main`
- `git status --porcelain`

<!-- state: history -->
## 演进记录

<!-- dated: 2026-07-19 -->
### 0.1.84 发布完成态

- Release commit `ac308e5870fde61b6147d0ceb35f4f12439bd534` 已直接推送到 `origin/main`，tag 为 `v0.1.84`；发布完成边界内本地 `main`、`origin/main` 与工作树完全收敛。
- npm registry 已确认 `@veewo/claw-core@0.1.84` 与 `@veewo/claw@0.1.84` 发布完成；CLI、core、Codex/OpenClaw/OpenCode adapter package surfaces 均对齐到 `0.1.84`，Codex plugin manifest 为 `0.1.84+codex.20260719151633`。
- 完成报告记录的验证结果为 core `134/134`、CLI `116/116`、Codex `17/17`、OpenCode `11/11`。这些是 `0.1.84` 发布完成边界的版本化证据，不替代后续版本的当前验证。
- npm 的 moderate audit 提示与 package field normalization warning 未阻止本轮发布；当前协议仍以 release gate、registry 回读、Git/source/tag 收敛和插件产物验证作为完成判据。

<!-- dated: 2026-07-19 -->
### 0.1.84 本机 update 完成态

- 发布后的独立 update workflow 已把全局 `@veewo/claw` CLI 刷新到 `0.1.84`，并把官方 Codex plugin 刷新到 `0.1.84+codex.20260719151633`；唯一启用的 identity 是 `claw-kit@claw-kit`，`claw-kit@claw-kit-local` 保持 disabled。
- 该完成边界内，GitHub source manifest 与 official cache manifest hash 一致；active cache 包含 `planning`、`config`、`update`、`create-claw-skill` 和 `knowledge-writer`，已退休的 `truth-writer`、`adr-writer` 不存在。
- 当时 Git clone 通道持续停滞，因此安装使用了经目标版本校验的 GitHub 官方 `main.zip` 快照，再交给维护的 cache/identity installer；没有使用开发工作区内容。这个版本化结果不改变 `.claw/truth/features/host-specific-update-skills.md` 所拥有的当前恢复边界，也不证明完成 update 的旧任务已经热加载新 skill；运行时采用仍以重启 Codex 后新建任务为界。

<!-- dated: 2026-07-19 -->
### 0.1.85 发布与 official source recovery 完成态

- Release commit `b594d4aa34c98e34402eb6c7c1c7f875ab25f562` 已推送到 `origin/main`，tag 为 `v0.1.85`；该完成边界内 `main = origin/main` 且工作树干净。npm registry 已确认 `@veewo/claw-core@0.1.85` 与 `@veewo/claw@0.1.85`。
- 本机全局 CLI 已刷新到 `0.1.85`；Codex appserver 识别 `claw-kit@claw-kit` 的 `0.1.85+codex.20260719162741` 为 installed/enabled，`claw-kit@claw-kit-local` 保持 disabled。
- official marketplace full clone 两次停在 `index-pack` 后，对同一官方 GitHub origin 的现有 checkout 使用 HTTP/1.1 filtered shallow fetch，成功把 marketplace `main` 恢复到 `b594d4aa34c98e34402eb6c7c1c7f875ab25f562`。随后从该实际 source 重装 versioned cache；source/cache 各 28 个文件，raw tree SHA-256 均为 `69439b64710267adb9c18c5f79dae716c61d75869ce09126515ce4b3624b6186`，零差异。
- active cache 包含 `planning`、`config`、`update`、`create-claw-skill` 与 `knowledge-writer`，已退休的 `truth-writer`、`adr-writer` 不存在。`config.toml` 的旧 `last_revision` 提示字段没有被超时的 appserver 写回，因此它不是完成判据；marketplace HEAD、appserver identity、manifest 与 source/cache payload 一致性共同构成这次版本化完成证据。
- 完成报告记录完整测试、Codex adapter `12/12`、Codex bundle `17/17`、OpenCode bundle `11/11` 和 release verifier 通过；这些是 `0.1.85` 完成边界的版本化证据。运行时采用新 skill 仍以重启 Codex 后新建任务为界。

<!-- dated: 2026-07-20 -->
### 0.1.86 发布完成态

- Release commit `2f7481c915381ea9d34902bf8a7a39df66466cde` 已直接推送到 `origin/main`，tag 为 `v0.1.86`；该 release 完成边界内 `main = origin/main` 且工作树干净。后续出现的工作树内容属于更晚状态，不能反向改写这条历史完成证据。
- npm registry 在完成报告边界确认 `@veewo/claw-core@0.1.86` 与 `@veewo/claw@0.1.86` 均为 `latest`。当前 checkout 的 root、core、CLI 与 Codex/OpenClaw/OpenCode adapter package surfaces 仍为 `0.1.86`，CLI 依赖固定为 `@veewo/claw-core: 0.1.86`。
- committed Codex marketplace payload 的 manifest 为 `0.1.86+codex.20260720013140`。release gate 已确认版本对齐、committed marketplace snapshot、必要 skill 资源、隔离 template smoke，以及发布前后的 clean-worktree / exact `main == origin/main` 条件。
- 本轮发布采用比例化验证：针对改动运行 focused checks，并由 `npm run verify:release` / `npm run publish:release` 承担稳定的版本、Git source、Codex bundle 与 clean-worktree gate；不把机械扩大的验证矩阵作为每次 release 的固定要求。
- 本轮没有刷新本机全局 CLI 或已安装 Codex plugin。当前发布协议把这两项留给发布后的独立用户端 `update` workflow；release 脚本在 npm publish 后也只提示调用 `claw-kit:update`，不得使用未发布的 workspace payload 代替该流程。

<!-- dated: 2026-07-20 -->
### 0.1.86 独立 update 安装面与运行时采用完成

- 发布后的独立 `update` workflow 已把全局 `@veewo/claw` CLI 刷新到 `0.1.86`；完成报告同时记录 `claw --version = 0.1.86`。
- Codex 更新面只启用 official identity `claw-kit@claw-kit`，并禁用 `claw-kit@claw-kit-local`。official marketplace 使用 `chanyuenpang/claw-kit` 的 `main` revision `2f7481c`，source/cache manifest 均为 `0.1.86+codex.20260720013140`，且两份 manifest 的 hash 一致。
- active cache 包含 `planning`、`config`、`update`、`create-claw-skill` 与 `knowledge-writer`；已退休的 `truth-writer`、`adr-writer` 不存在。这是该版本安装面的完成证据，不改变 `.claw/truth/features/host-specific-update-skills.md` 对当前更新合同的所有权。
- 后续独立新任务已实际加载 `C:\Users\chany\.codex\plugins\cache\claw-kit\claw-kit\0.1.86+codex.20260720013140\skills\using-claw-kit\SKILL.md`，并确认 installed source/cache 两端该 skill 的 SHA-256 一致。该 loaded locator 完成了 restart/new-task runtime adoption 边界；空的 `claw-kit-local` cache 壳既未出现在 enabled plugin identity 中，也不构成竞争安装面。
- CLI 安装留下旧 sharp DLL 临时目录未清理的 warning，但 CLI 与 plugin 两个更新面均已通过上述版本、identity、manifest 与 skill-presence 检查；该 warning 是本轮版本化安装附注，不是当前 update 合同的新完成判据。

<!-- dated: 2026-07-20 -->
### 0.1.87 发布完成态

- Release commit `aaa00adf6dbb86b79e1055bdea0320de011f0009` 已直接推送到 `origin/main` 并标记为 `v0.1.87`；完成边界内本地 `main`、`origin/main` 与 tag 指向同一提交，且 `git status --porcelain` 为空。
- npm registry 完成报告确认 `@veewo/claw-core@0.1.87` 与 `@veewo/claw@0.1.87` 均为 `latest`；Codex committed marketplace manifest 为 `0.1.87+codex.20260720175041`。
- 完成报告记录 core `148/148`、CLI `120/120`、仓库脚本 `59/59`，并通过类型检查、bundle、pack dry-run 与 release dry-run。这些数字只属于该 revision 的版本化证据，不替代未来版本的风险比例化验证。
- 新增 template version 协议在未发布 CLI 与待发布 workspace template 之间形成自举阻塞时，本轮临时将全局 `claw` link 到已构建的 `0.1.87` workspace CLI/core；registry 可见后已恢复正式 npm 安装，`claw --version = 0.1.87`。该开发期恢复手段不授权从 workspace 安装 Codex plugin。
- 本轮只验证 committed GitHub marketplace payload，没有直接刷新本机 Codex plugin cache；这保持 release 与后续独立用户端 `update` workflow 的完成边界分离。
