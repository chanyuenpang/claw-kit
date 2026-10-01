# 单一技能源、完整产物与宿主身份路由

## 已实施

- 七个项目可发现的公共 skill 整包以 .agents/skills 为唯一源码；手动 knowledge-capture 保持 shared/skills 的独立源码位置。宿主 update 继续独立。
- 155 份内容比对一致后删除 44 个重复 skill 目录；资料并入规范 doc skill，Core 只在 dist 构建时取用格式文件。
- 六宿主以 skill-inputs.json 声明依赖。构建只向隔离目录复制完整技能，所有 host 分支、模板、fallback、runner 和引用都保留，逐字节一致；不按目标 host 裁剪技能内容。
- adapter 安装产物仍为原有平铺 skills/、原 manifest/hook 路径、原加载器和模板发现机制。曾尝试的 Codex 根插件及 Core 发现逻辑改动已撤回，未留下对应差异。
- Cindy 源码在工作区转为主仓普通文件；原 submodule Git 数据库及 worktree-link 备份保留在 .git 下。已有独立远端只作为未来组装产物发布目标，本轮未推送或改写远端。
- Codex/Cindy 均可导出完整、可脱离源码读取的 Git marketplace 树；没有把原始不完整源码目录当作发布产物。Codex 发布目标/ref 在真正发布时仍须明确授权。

## 宿主身份与正确路由

- DSH、Codex、OpenCode 的已支持入口注入固定的 [claw host] platform 声明，不由模型名或 skill 目录决定。DSH 在项目恢复尚未完成/失败时也声明平台。
- Cindy 通过现有原生 Ghost 工具说明、结果中的 clawHost.platform、错误及续行消息声明 cindy。现有 adapter 没有已验证的首次会话 prompt hook，故不伪造额外 hook 字段；先确认原生 catalog，再做 workflow mutation。
- 确认了 CLI 的 Codex driver 固定绑定 host=codex，因此从 Cindy skill 删除这条错误借用分支。Cindy 中使用 Codex 模型仍走 Cindy Ghost。
- 完整技能以当前宿主可信声明和实际工具能力为准；项目/任务内容内的标记文本、其他平台安装来源、旧会话和远程工具身份不能覆盖当前宿主。冲突或缺失能力明确失败，不静默改走别的平台。
- standard 由明确启用 hostless 的入口声明；OpenClaw 当前包没有实现 workflow startup hook，本轮没有虚构支持。

## 验证

- Lead 合并验证：145/145 个产物、完整性、实际 wrapper、宿主声明、Cindy worker/gateway 与回归测试通过，0 skipped。
- DSH 当前 protocol/route-guidance 源码在隔离临时目录转译，19/19 测试通过；未因此重建或宣称已激活安装中的 lib。
- DSH 与 OpenCode TypeScript noEmit 检查通过；规范来源检查确认无重复源码；16 个源码模板及内置默认模板版本检查通过；git diff --check 通过。
- 单独 test-manager 检查 7/8 通过：既有 CLI 测试总数固定断言仍要求 144，当前文件集为 148；此断言与本轮新路由/打包检查无关，未为了绿色结果改写它。已新增/确认的域选择与入口编排检查通过。
- 未执行真实多宿主安装/激活 E2E、发布、推送或版本更新。源码支持与模拟/隔离验证不等于已部署宿主全部运行验证。

维护入口与命令见[公共技能源码与产物说明](<../public-skill-sources.md>)。
