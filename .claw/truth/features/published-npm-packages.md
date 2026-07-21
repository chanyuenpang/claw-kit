# Published npm Packages

<!-- document-state: current -->

<!-- state: current -->
## 当前行为

- `claw-kit` 发布两个 npm 包：`@veewo/claw-core` 提供核心 `.claw` harness 语义，`@veewo/claw` 提供 `claw` CLI 并精确依赖同版本的 `@veewo/claw-core`。
- 当前最新已验证发布版本线为 `0.1.94`。release commit `797da0e` 对应 tag `v0.1.94`；Codex marketplace manifest 为 `0.1.94+codex.20260721175818`。
- release version bump 覆盖 root、lockfile、core、CLI、Codex/OpenClaw/OpenCode adapters、内部 `@veewo/claw-core` 依赖和 Codex plugin manifest。root `package.json.version` 同时是全部 plugin `TEMPLATE.json` 与 built-in default template 的版本权威。
- 模板版本维护顺序固定为 `npm run sync:template-versions`、`npm run sync:shared-skills`、`npm run check:template-versions`。`npm run verify:release` 与 `npm run publish:release` 复用只读版本断言，禁止发布时隐式修复 stale template。
- owner 直接从 `main` 交付。发布前必须提交并推送有价值内容，使本地 `main` 精确等于 `origin/main` 且 `git status --porcelain` 为空；不得用 stash、临时分支或 PR 绕过门禁。
- canonical release gate 固定覆盖版本与内部依赖对齐、shared-skill 同步、committed Codex marketplace payload、隔离 template smoke、clean worktree 与 exact `main == origin/main`。完整测试、adapter bundle tests 和双包 dry-run 按本轮实际风险比例化追加。
- 双包发布顺序固定为先 `@veewo/claw-core`、后 `@veewo/claw`。release 完成态直接核对 GitHub source/tag、npm 双包与 `dist-tags.latest`、committed Codex marketplace payload 和 clean worktree。
- release 与用户端 `update` 是两个有序完成边界。release 不要求刷新本机全局 CLI 或 installed Codex plugin；发布后由独立 `claw-kit:update` 从已发布 npm 与 official GitHub marketplace 刷新，并只允许 `claw-kit@claw-kit` identity。
- claw-kit 维护者的完整发布入口是仓库本地 `.agents/skills/release-claw-kit`，通过 `claw plan create --template release-claw-kit --title release-claw-kit` 调用。该项目 skill 不随 Codex plugin 发布；其 8 个无 choice 的线性任务串联版本准备、比例化验证、direct-`main` 推送、guarded publish、GitHub/npm/committed-plugin 验收与 published-source Codex 更新，第 6 个任务先完成 artifact release，第 7 至 8 个任务才进入独立安装更新边界。
- 新模板协议可能让旧的正式 CLI 无法加载待发布模板。release 开发阶段可以临时把全局 `claw` link 到已构建的 workspace CLI/core 以解除自举阻塞，但这不是发布或 update 完成证据；registry 可见后必须恢复正式 npm 安装，Codex plugin 仍不得从未发布 workspace payload 刷新。
- npm registry 传播可能短暂滞后。若 metadata 尚未看到新版本，应等待可见后再进入独立 update；若 metadata 已可见但 tarball retrieval 报 `ETARGET`，先清理本地 npm cache 再重试，不能把本地 cache stale 误判为 publish 回滚。

## 实现锚点

- `package.json`
- `packages/core/package.json`
- `packages/cli/package.json`
- `packages/codex-adapter/.codex-plugin/plugin.json`
- `.agents/skills/release-claw-kit/SKILL.md`
- `.agents/skills/release-claw-kit/TEMPLATE.json`
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

<!-- dated: 2026-07-20 -->
### 0.1.88 发布与维护者 update 完成态

- Release commit `3ff4bbf08cb4668fc75ae2176146cab5c4a38d20` 已直接推送到 `origin/main` 并标记为 annotated tag `v0.1.88`；该完成边界内本地 `main`、`origin/main` 与 tag peeled commit 一致，工作树干净，并已创建对应 GitHub Release。
- npm registry 完成报告确认 `@veewo/claw-core@0.1.88` 与 `@veewo/claw@0.1.88` 已发布并通过真实 retrieval smoke；committed Codex marketplace manifest 为 `0.1.88+codex.20260720112619`，且发布插件包含 `release-claw-kit` template。
- 该 release 的版本化验证记录为 core `148/148`、CLI `122/122`，并通过 `npm run check`、9 个 plugin template 加 built-in default 的版本检查、shared-skill 同步检查、Codex bundle `18/18`、OpenCode bundle `11/11`、双包 `npm pack --dry-run`、guarded release verifier 与 `git diff --check`。这些结果只证明该 revision 的发布候选，不把完整矩阵提升为未来每轮的固定要求。
- 发布后的维护者 update 已从 published npm 和 official GitHub marketplace 刷新全局 CLI 与 Codex plugin：`claw --version = 0.1.88`，只启用 `claw-kit@claw-kit`，禁用 `claw-kit@claw-kit-local`，official marketplace source 与 active cache manifest 均为 `0.1.88+codex.20260720112619`，且 37 个交付文件逐一内容一致。
- Codex marketplace upgrade 在 Windows Git transport 下停滞后，对同一 clean official checkout 使用 Git OpenSSL transport 做 direct `ff-only` 更新，使 source manifest 与 cache manifest 收敛；这是一条版本化恢复证据，不把特定 transport 方案提升为所有 update 的默认路径，也不授权使用 workspace payload。
- 当前完成报告明确没有声称旧任务已热加载 `0.1.88` skill。只有重启 Codex 并创建新任务后确认 loaded skill locator，才能完成运行时采用边界；安装面一致不能替代该证据。

<!-- dated: 2026-07-21 -->
### 0.1.93 发布与维护者安装刷新完成态

- `0.1.93` 已从 release commit `9c145ce8e90c5a3bf660022c915cec2947ed5cd7` 发布；`@veewo/claw-core` 与 `@veewo/claw`、GitHub Release `v0.1.93` 和 committed Codex marketplace manifest `0.1.93+codex.20260721091121` 均属于该完成边界。随后 `d0796665` 提交项目配置迁移，当前本地 `main` 与 `origin/main` 一致且工作树干净。
- 本次发布将 `release-claw-kit` 固定为 `.agents/skills/release-claw-kit` 下的仓库维护者 skill，并从公开 Codex plugin payload 移除；公开 update 保持为 plugin capability。该归属和发布/安装顺序仍由 release protocol ADR 拥有。
- 发布后的维护者安装已从已发布 npm 与 official GitHub marketplace 刷新全局 CLI 和 official plugin cache 到 `0.1.93`。当时运行中的 Codex 进程仍加载 `0.1.92` skill；这是进程缓存边界，不是安装失败，也不证明该旧任务已采用新 skill。重启 Codex 并创建新任务后才可验证运行时 loaded-skill 版本。

<!-- dated: 2026-07-22 -->
### 0.1.94 发布与维护者安装刷新完成态

- `0.1.94` 已从 release commit `797da0e` 发布；`@veewo/claw-core` 与 `@veewo/claw`、GitHub Release `v0.1.94` 和 committed Codex marketplace manifest `0.1.94+codex.20260721175818` 均属于该完成边界。该版本交付了 Codex host progress projection 修复及项目搜索的 persistent reader、紧凑向量存储和延迟 snippet 读取优化。
- 完成报告记录 core `149/149`、CLI `126/126`、plugin checks、production audit、registry retrieval 与 GitHub Release 验证均通过；这些结果只证明该 release revision，不将完整验证矩阵提升为未来发布的固定要求。
- 发布后的维护者安装已从已发布 npm 和 official GitHub marketplace 刷新到 `0.1.94`；发布完成时 `main`、`origin/main` 与 `v0.1.94` 收敛到同一 commit，工作树干净。正在运行的 Codex 进程仍须重启并新建任务，才能把已安装的新 plugin skill 作为运行时加载证据；该重启依赖不否定已完成的安装面验证。
