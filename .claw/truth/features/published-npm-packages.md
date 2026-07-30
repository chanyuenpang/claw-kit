# Published npm Packages

<!-- state: current -->
## 当前行为

- `claw-kit` 发布两个 npm 包：`@veewo/claw-core` 提供核心 `.claw` harness 语义，`@veewo/claw` 提供 `claw` CLI 并精确依赖同版本的 `@veewo/claw-core`。
- 当前本文已有完成证据的最新 npm 发布版本线为 `0.1.99`，release commit `39e8199` 对应 `v0.1.99`。Codex marketplace 是独立 artifact surface；当前 committed manifest 已由后续 Codex-only release 推进到 `0.2.2.1`，不表示 npm 包随之发布。
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

<!-- dated: 2026-07-26 -->
### 0.1.96 维护者安装刷新完成态

- npm 与 official `chanyuenpang/claw-kit` GitHub marketplace 均已提供 `0.1.96`。全局 `@veewo/claw` 已从 npm 重新安装为非 workspace-link 的 `0.1.96`，旧的本地仓库链接已移除。
- Codex plugin 已从 official GitHub marketplace 刷新为 `0.1.96+codex.20260723133832`；只启用 `claw-kit@claw-kit`，禁用 `claw-kit@claw-kit-local`。source/cache manifest 一致，published skill 边界验证通过。
- 该完成证据覆盖 CLI 与 plugin 安装面，不声称当时运行中的 Codex 任务已采用新 skill。运行时采用仍须由重启 Codex 后的新任务确认 loaded skill version。

<!-- dated: 2026-07-29 -->
### 0.1.97 发布与维护者安装刷新完成态

- `0.1.97` 已从 release commit `61d76c239a479054cf5b807da0e94c6a16a8d921` 发布；`@veewo/claw-core`、`@veewo/claw`、GitHub Release `v0.1.97` 和 committed Codex marketplace manifest `0.1.97+codex.20260729052741` 均属于该完成边界。
- 该 revision 的完成报告记录 core `154/154`、CLI `130/130` 通过，以及静态检查、shared-skill、Codex/OpenCode bundle 和双 npm 包 dry-run 已完成。这些是版本化发布证据，不构成后续版本的固定验证矩阵。
- 发布后的维护者安装已从已发布 npm 和 official GitHub marketplace 刷新：全局 `claw --version` 为 `0.1.97`，official `claw-kit@claw-kit` 已启用且 `claw-kit@claw-kit-local` 已禁用，official source manifest 与 active cache manifest 均匹配 `0.1.97+codex.20260729052741`。完成报告同时确认必需技能存在，`main` 与 `origin/main` 一致且工作树干净。
- 本次记录不把运行时采用写为完成：仍需重启 Codex 并在新任务中确认 loaded-skill locator，才能证明新会话实际加载该版本的技能。

<!-- dated: 2026-07-29 -->
### 0.1.98 发布与维护者安装刷新完成态

- `0.1.98` 已从 release commit `f9df29e` 发布；`@veewo/claw-core`、`@veewo/claw`、GitHub Release `v0.1.98` 和 committed Codex marketplace manifest `0.1.98+codex.20260729055754` 均属于该完成边界。完成时 `main` 与 `origin/main` 一致且工作树干净。
- 该 revision 的完成报告记录 core `154/154`、CLI `130/130`、Codex plugin `18/18` 与 OpenCode plugin `11/11` 通过；这些都是版本化发布证据，不构成后续版本的固定验证矩阵。
- 发布后的维护者安装已从 published npm 和 official GitHub marketplace 刷新：全局 `claw --version` 为 `0.1.98`，official `claw-kit@claw-kit` 已启用且 `claw-kit@claw-kit-local` 已禁用，official source manifest 与 active cache manifest 均匹配 `0.1.98+codex.20260729055754`。
- 本次记录不把运行时采用写为完成：当前进程仍需重启并新建任务，才能证明新会话实际加载该版本技能。

<!-- dated: 2026-07-29 -->
### 0.1.99 发布与维护者安装刷新完成态

- `0.1.99` 已从 release commit `39e8199` 发布；`@veewo/claw-core`、`@veewo/claw`、GitHub Release `v0.1.99` 和 committed Codex marketplace manifest `0.1.99+codex.20260729082500` 均属于该完成边界。完成时 `main` 与 `origin/main` 一致且工作树干净。
- 该 revision 修复 Unified Exec fallback，使固定 Codex driver 在只有 `exec_command` 时使用 `cmd` 与 `yield_time_ms` 参数。完成报告记录完整 core/CLI 测试、静态检查、template 与 shared-skill 检查、Codex/OpenCode bundle 测试、双 npm 包 dry-run 和 guarded release verification 均通过；这些是该 revision 的版本化证据，不构成后续版本的固定验证矩阵。
- 发布后的维护者安装已从 published npm 和 official GitHub marketplace 刷新：全局 `claw --version` 为 `0.1.99`，official `claw-kit@claw-kit` 已启用且 `claw-kit@claw-kit-local` 已禁用，official marketplace source 与 active cache manifest 均匹配 `0.1.99+codex.20260729082500`，并已核对 manifest hash 一致。
- 本次记录不把运行时采用写为完成：仍需重启 Codex 并新建任务，才能证明新会话实际加载该版本技能。
