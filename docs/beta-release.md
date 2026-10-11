# 本地候选递增与原样正式发布

每个新的可安装测试候选都使用一个新的正式目标版本号，不加 beta 后缀。本地未发布候选同样占用号码。批次 ID 和哈希用于识别产物、来源与试用，不再代替版本递增。

## 每次 beta / 正式发布都先校对版本

1. **先确定目标 CLI base 和授权范围。** 多产物发布使用本次授权的 CLI 候选版本；平台补发使用当前已发布 CLI 的 base，并与源码目标对照。三段 CLI/Core/Client 版本一致，平台版本的前三段必须一致；各平台第四段独立递增，不要求全部相同。DSH 额外核对四段版本与 npm rc 映射。历史版本回发必须另行明确选择，不能冒充最新补发。
2. **展示全平台版本盘点。** CLI、Codex、DSH、Cindy、OpenClaw、OpenCode 分别列出源码目标、选中冻结候选（版本/hash/sourceRevision）、已知公开版本、固定 CLI runtime pin、是否选中及待补齐状态。源码 manifest 重置为新 base 的 .0 不代表该平台已有可发布候选；各平台“最后一个 beta”也不代表同一基线。公共信息读取失败记为 unknown，不猜版本，也不以未知信息阻止不相关产物。
3. **beta 允许部分平台。** 只对本次选择的产物准备/冻结/测试，但仍核对它们的 manifest 和依赖基线，说明其他平台未进入本批次。beta 不新增远端发布授权。
4. **正式发布重新核对本次范围。** 不能把一个旧平台 beta 搭配新 CLI 静默转正。选中平台没有当前 base 的候选、版本落后于最新源码目标或固定 pin 不一致时，先准备新号、提交最新输入并冻结，再进入原样 promotion；已冻结包不改号、不重建。新候选有自己的试用；只有仓库 owner 明确豁免才可提前转正，记录授权但不倒填 trial。不得为了“让旧插件可下载”补发旧 CLI 来掩盖基线错配。
5. **补齐不扩大权限。** 正式版必须指出未选平台的落后/缺失状态；只有已授权的平台可以准备与发布。若需要补发其他平台，先向 owner 列出建议并取得范围授权。一个平台请求不自动授权 CLI 或其他平台发布。

只读版本工作表入口（不会 build、分配版本、上传、安装或推导发布权限）：

~~~text
# prepare 后、commit/pack 前校对本批次源码目标
npm run audit:release-versions -- --phase beta --artifacts cli,codex,dsh
# 冻结后再次校对；不同平台批次可重复 --candidate
npm run audit:release-versions -- --phase release --cli-base <target-cli> --artifacts codex --candidate <frozen-dir>
~~~

工作表读取所有平台的源码 manifest；只核对明确选中的候选，并验证其原始 inventory/hash、已声明 knowledge-capture CLI pin 和 Codex mutation bridge 的 pluginVersion。候选准备 owner 负责原子同步桥接版本，并将其纳入同输入恢复/冻结记录。它不自动选择“最新”批次，不把 manifest 当作公开发布证明，也不替代七天试用、npm 下载核验或实际激活验证。选中项需要准备/复核时返回非零并列明原因；未选项只盘点，不能阻断不相关交付。正式发布的 owner 在上传前处理选中项的实际版本不一致；不要把这份工作表移植成 Host/adapter 的影子授权 gate。

## 版本与准备 owner

- CLI/Core/Client 同步三段版本，按当前已知版本高水位递增第三段；更新准确依赖、lockfile，以及 CLI 基线涉及的 adapter manifests。
- 单独 Codex/DSH/OpenCode/OpenClaw/Cindy 只升该 family 的第四段，保留所选 CLI base。CLI 基线更新不授权打包/发布未选中的 adapter。
- DSH 沿既有正式映射 A.B.C.N → npm A.B.C-rc.N；rc.N 是四段到 npm 的编码，测试与正式相同，不新增 -beta 版本线。
- Cindy 的 vcindy tag 属于独立 artifact 仓库，不能用源码 origin 的 tag 代替。prepare 默认读取既有官方 artifact 仓库，也可传 --cindy-artifact-root <已授权checkout>；--known-versions <JSON> 可补充明确已知的 family→正式版本数组。
- 选号复用 source manifests、已有 candidate/dsh-beta 清单及已知 npm/tag 事实。只看公开 latest 会复用尚未发布的本地号码；准备记录也必须计入。读取远端失败不构成第二套发布授权，保留已知本地高水位并报告限制。

## 准备、提交与冻结

分类源码改动并提交本地 main，然后运行：

~~~text
npm run beta:prepare -- --artifacts cli,codex,dsh
~~~

不带 artifacts 默认 CLI+Codex；例如只准备 DSH 用 --artifacts dsh。用户明确指定正式目标号时，--versions 接受选中 family→版本的 JSON（例如 cli=0.3.0、dsh=0.3.0.2），仍须超过已分配高水位；不猜 major/minor 跳号、不复用旧号。命令在现有候选目录先独占写入 schema2 preparing 清单，保留目标号并更新版本/依赖；不自动 commit、build、publish 或安装。复核并提交这些变更至本地 main 后：

~~~text
npm run beta:pack -- --candidate <准备目录>
npm run beta:verify -- --candidate <准备目录>
~~~

pack 检查确切准备输入与干净源码，构建所选产物，并将同一清单封为 frozen，记录 sourceRevision、版本、npm映射、完整 tree/tgz 和 SHA-256。组合产物来自同一次提交。冻结后再 pack 只校验返回原件，零重建。不存在 beta:pack 不升号生成另一个新同号批次的入口。

进程中断遗留本地准备/打包锁时，beta:recover --candidate <目录> 只释放可证明进程已退出的锁；活进程或无法识别的 owner 不抢占。上传锁不按此办法重获发送许可：已有 receipt 的恢复只下载核对，不删除 possibly-live 上传锁或重发。

构建失败时 preparing 不可安装/转正。原输入的版本写入中断可以 beta:resume --candidate <目录> 恢复，再本地提交并 pack；输入改变须创建新候选，不可覆写已冻结内容。锁冲突影响该准备/打包操作，不能以覆盖文件绕过。新候选可以有版本间隙，不回收曾分配的号。

记录仍放在 dist/beta 中，不创建第二版本数据库；清理大产物时保留小清单与号码证据。旧 schema1 冻结候选保持只读可校验，不修改其版本/hash/trial，不自动把它们转换成新的候选。

**beta 允许本地 commit，禁止 push、npm publish、GitHub Release 或上传 tag。** 本地 beta 不要求 main=origin/main。任何安装、Host重启或试用开始都不是打包的隐含步骤。

## 安装与七天试用

CLI+Codex 候选沿既有入口：

~~~text
npm run beta:install -- --candidate <冻结目录>
npm run beta:start-test -- --candidate <冻结目录>
~~~

adapter-only 通过该宿主正常安装入口消费冻结 tree/tgz，再记录同一候选的试用。确认 CLI/plugin 版本即可；不添加额外逐文件安装审计。trial.json 绑定冻结 candidate hash，不覆盖、不倒填。新字节必须新号并重新试用；安装、验证和恢复原件不升号。

## 原样转正

七天后明确选择精确候选并授权发布。正式时版本不变，产物字节也不变：禁止从 workspace 再 build、pack 或 export。CLI：

~~~text
npm run verify:release -- --candidate <冻结目录>
npm run publish:release -- --candidate <冻结目录>
~~~

DSH：

~~~text
npm run publish:dsh-plugin -- --candidate <冻结目录>
npm run publish:dsh-plugin -- --candidate <冻结目录> --publish
# 仅当 owner 已明确豁免此候选试用时：
npm run publish:dsh-plugin -- --candidate <冻结目录> --publish --trial-waiver "<本次明确授权记录>"
~~~

CLI 的 `verify:release` / `publish:release` 同样接受 `--trial-waiver "<本次明确授权记录>"`，记录在候选旁的 `trial-waiver-cli.json`，绑定 candidate hash 与 Core/Client/CLI 三个 npm 坐标；不授权任何插件发布。DSH 的显式豁免保存在 `trial-waiver-dsh.json`，绑定 candidate hash 与该 npm 坐标。两者都不修改、伪造或倒填 `trial.json`，未传豁免时仍要求完整七天试用。

CLI 补丁允许只选择 `--artifacts cli`：源码中 adapter 基线按既有规则同步，不代表发布这些插件。已发布插件保留原号；运行兼容性按实际协议和依赖检查，不能只靠前三段不同就判为不兼容。PATH 调用的宿主需更新对应 CLI 安装并重新建立进程；固定 CLI/Core pin 的旧入口继续使用原版本，不因此自动获得补丁。

CLI owner 依次上传 Core→Client→CLI 的原 tgz，核验真实下载和 latest 后才 push 源码；DSH owner 上传所选冻结 tgz 并核验下载，随后按 release-dsh-plugin 完成源码/tag及授权交付。一个组合清单不意味着 CLI 发布入口自动发布 DSH。

Codex 发布冻结 marketplace 完整 Git tree；Cindy 交独立 artifact 仓库 owner；OpenCode/OpenClaw 保留其既有 tag namespace。artifact commit 可以与 source commit 不同，但 tree/hash不能变。不得移动已有 tag，也不得把 raw source main冒充合成插件。

每个 npm 坐标的尝试回执在候选旁路记录 attempted/accepted/unknown/verified；已接受或未知上传只能精确下载对账，不自动重发。不同远端字节阻止该坐标及其依赖交付，不以目录/catalog/version查询代替发布 owner。元数据查询失败不能解释为前次上传不存在。最终正式交付仍要求 main=origin/main且工作树干净，不以只上传 npm冒充全套完成。

## 旧同号批次

保留此前同版本不同批次作为历史，不覆盖、改号或重写摘要。继续测试当前源码时按新流程分配下一正式目标号，重新冻结与试用。历史候选仅能在另行明确选择精确 hash 时按旧产物处理；不能把旧试用记到新号上。
