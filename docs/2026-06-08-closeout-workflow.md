# claw-kit 收尾流程

这份文档定义 `claw-kit` 的标准收尾行为。默认在功能完成、验证通过、准备发布或交付时执行。

## 目标

收尾阶段固定做 3 件事：

1. 更新版本号
2. 更新本地安装副本
3. `commit + push`

## 1. 更新版本号

版本号需要保持一致更新。

至少同步这些文件：

1. [package.json](/D:/Users/chany/Documents/claw-kit/package.json)
2. [package-lock.json](/D:/Users/chany/Documents/claw-kit/package-lock.json)
3. [packages/core/package.json](/D:/Users/chany/Documents/claw-kit/packages/core/package.json)
4. [packages/cli/package.json](/D:/Users/chany/Documents/claw-kit/packages/cli/package.json)
5. [packages/codex-adapter/package.json](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/package.json)
6. [packages/openclaw-adapter/package.json](/D:/Users/chany/Documents/claw-kit/packages/openclaw-adapter/package.json)
7. [packages/codex-adapter/.codex-plugin/plugin.json](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/.codex-plugin/plugin.json)

规则：

- workspace 包版本默认保持一致
- plugin manifest 版本使用 `semver+codex.<timestamp>` 形式
- 修改 `package.json` 后运行一次 `npm install`，让 `package-lock.json` 同步

## 2. 更新本地安装副本

本地安装副本分两层：

### 2.1 本地 CLI

重新构建并重新安装本地 `claw` 命令：

```powershell
npm run build
npm link .\packages\cli
```

如果需要覆盖旧链接，可以使用安装脚本：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-cli.ps1
```

### 2.2 本机 Codex 插件缓存

当 `codex-adapter` 有版本或技能更新时，同步本机插件缓存：

目标目录格式：

```text
C:\Users\chany\.codex\plugins\cache\claw-kit-local\claw-kit\<plugin-version>\
```

至少同步这些内容：

1. `.codex-plugin/`
2. `hooks/`
3. `references/`
4. `scripts/`
5. `skills/`
6. `package.json`

同步后至少检查：

1. 缓存里的 `plugin.json` 版本是否正确
2. `hooks.json` 是否是当前实现
3. 新技能或文档是否已经进入缓存

## 3. commit + push

在提交前先确认：

1. `npm test`
2. `npm run check`
3. `git status --short`

标准步骤：

```powershell
git add <changed-files>
git commit -m "<message>"
git push origin main
```

要求：

- 不要在未验证的状态下提交
- 如果 `.claw/truth/` 或 `.claw/project.json` 有 canonical 更新，要一并提交
- 如果子代理在收尾阶段又改动了 canonical truth/ADR，先把这些变更收进最后一次提交，再 push

## 推荐顺序

完整收尾顺序建议固定为：

1. 完成功能或修复
2. 跑验证
3. 更新版本号
4. `npm install`
5. `npm run build`
6. 更新本地 CLI
7. 更新本机插件缓存
8. 检查 canonical `.claw` 变更
9. `git commit`
10. `git push`

## 备注

- 如果目标是 npm 发布，先按这份收尾流程完成，再参考 [DISTRIBUTION.md](/D:/Users/chany/Documents/claw-kit/DISTRIBUTION.md) 做真正的发布步骤。
- 如果只是普通功能交付，没有版本变化，也可以跳过版本号步骤，但默认推荐更新版本。 
