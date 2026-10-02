# 本地 beta 与原样正式发布

beta 使用预定正式版本号，例如 CLI `0.2.43`、Codex `0.2.43.0`。批次与校验值独立记录，包内不添加 `-beta`。同版本允许多个未发布批次，只有实际测试通过的批次可以转正。

## 准备并冻结

按目标 artifact 的版本规则准备版本、依赖和 lockfile，运行与风险相称的检查。分类所有改动，把有价值内容提交到本地 `main`，清理临时输出并忽略本地目录。**beta 允许本地 commit，禁止 push、npm publish、GitHub Release 或上传 tag。** 此时不要求与 origin/main 相等。

```text
npm run beta:pack
```

当前批次覆盖 Core、Client、CLI 和 Codex。命令检查干净的本地 main、内部版本、模板与 skill 来源，构建后保存三份 tgz 和完整 Codex marketplace 到 `dist/beta/<version>/<batch>/`。candidate.json 记录源码提交、版本、时间和全部产物 SHA-256。dist 已被 Git 忽略；保留候选目录直至正式发布完成。

失败的输出不具备有效 candidate.json，不能转正。重复打包生成新批次，不覆盖旧批次。其他 adapter 沿用各自 artifact 合同；这个 Codex 批次不构成它们的测试或发布证据。

## 安装并试用一周

```text
npm run beta:verify -- --candidate <批次目录>
npm run beta:install -- --candidate <批次目录>
```

install 从三份 tarball 安装本地 runtime，检查 CLI 版本，并准备 claw-kit-beta 本地 marketplace。通过宿主正常的本地插件入口安装它，再确认插件版本即可。

使用输出的 binDirectory 运行 beta CLI，启用 `claw-kit@claw-kit-beta`，避免同时启用两份 claw-kit。安装只需取包、安装、确认 CLI 和插件版本；不用逐文件比对、路径审计或额外加载证明。

安装后记录试用起点。基本冒烟另用 smoke-test-claw-kit 并明确指定 beta 批次，不作为额外安装门禁：

```text
npm run beta:start-test -- --candidate <批次目录>
```

trial.json 记录该批次的起点，不可覆盖或倒填。修复代码需重新提交、打包并从新批次重新计时。产物摘要只用于确认正式上传时没有换包，不增加安装检查步骤。

## 正式转正

满七天后检查试用结果，选择该批次。干净的本地 main 必须指向其源码提交；origin/main 必须是该提交的祖先或相同提交。发生分叉先解决，不能强推。不要再改版本、构建、打包或导出 adapter。

```text
npm run verify:release -- --candidate <批次目录>
npm run publish:release -- --candidate <批次目录>
```

verify 只验证产物、七天试用、源码和 Codex 结构。publish 预检三份 npm 包：同版本同 integrity 可继续，不同字节或非 E404 错误立即停止。按 Core → Client → CLI 发布固定 tgz，禁用发布 lifecycle scripts，逐包真实下载比对字节与 latest，全部通过才 push origin/main 并核对远程提交。

此命令完成 npm 与 source main。**GitHub tag/Release 仍由对应发布 skill 完成**：source 使用不可变 `v<version>`；Codex 使用批次 `artifacts/marketplace` 的完整 Git tree，按既有 `vcodex-<version>` namespace 创建 artifact commit/tag 和 Release，记录 source/artifact 两个提交。禁止重新 export，禁止把 raw source main 当插件。发布前后核验候选，并比较公开 tree 与冻结文件。

部分发布失败时保留批次，修复后原样重试；禁止同版本换包或移动已存在 tag。最终 main = origin/main 且工作区为空才算完整发布。另行执行 update 时切回官方安装并清除 beta identity；skill 集合按目标 artifact 的 skill-inputs.json 核验，不固定数量。

不带 candidate 的 verify:release 可继续用于旧有公开源码的诊断；publish:release 必须带 candidate。本流程不自动安排一周后的发布或通知。
