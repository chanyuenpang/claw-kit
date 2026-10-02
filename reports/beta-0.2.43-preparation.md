# 0.2.43 本地 Beta 准备

用户授权：2026-10-02 准备 Beta 后进行当前 Windows + DSH 的真实冒烟。Beta 仅本地提交、打包、安装，不执行 npm/GitHub 发布、远程 push 或上传 tag。DSH desktop 由用户手动重启。

## 本地改动分类

本次候选保留并提交工作区已有的有价值改动，不只打包最后一个修复。下列分类覆盖候选前 git status 中的全部路径（包括新增与删除），没有 stash：

| 路径类别 | 处理与理由 |
| --- | --- |
| .agents/skills 下的版本、Beta/release/smoke/update/using-claw-kit 文档与模板 | 提交；它们是打包的 canonical skill 来源与操作合同 |
| .claw/project.json 删除旧 executionPolicy 字段 | 提交；与固定宿主收口协议迁移一致，不是凭证或纯个人配置 |
| .claw/truth/adr 与 .claw/truth/features 的发布、宿主更新事实 | 提交；已有持久项目知识修订 |
| AGENTS.md、DISTRIBUTION.md、README.md、docs 下设计/配置/安装/Beta 文档 | 提交；规范和实现迁移说明 |
| 根及 core/client/cli/codex/dsh manifests、lockfile、共享 knowledge-capture runtime pin | 提交；Beta 版本与依赖契约 |
| packages/core/src、resources、test | 提交；固定宿主知识收口、兼容旧字段、canonical scope 与子计划前置校验及回归 |
| packages/client/src、packages/cli/src 与 test | 提交；协议与真实入口、collector/closeout 调整及回归 |
| packages/codex-adapter 的 hooks、scripts、references、skills、manifest、test | 提交；固定 native 收口与 claim-time collector。删除旧 knowledge-finalizer.mjs 是有意移除备用执行链 |
| packages/cindy-adapter 的 plugin/worker 与 test | 提交；固定 Worker 收口与错误边界；本轮不安装或真实冒烟 Cindy |
| packages/dsh-adapter 的 src/client、README/RELEASING、update skills/references、test | 提交；固定收口协议与 desktop 安装边界 |
| packages/dsh-adapter/lib 下已经受 Git 跟踪的构建输出 | 构建后提交；保持受跟踪运行时与源码一致，不把未跟踪构建垃圾带入候选 |
| packages/standard-adapter 文档 | 提交；标准宿主固定 main-agent 收口合同 |
| scripts 下 Beta、发布、Codex artifact 与 test-manager 工具和测试 | 提交；不可变候选与验证入口 |
| reports 下已有冒烟报告及本文 | 提交；保留历史失败边界和本次准备记录，不把旧报告当本轮 Beta 通过 |
| dist、node_modules、.claw/tasks 及 runtime | 按现有 .gitignore 保持本地；冻结产物、计划与原始测试证据不加入源码提交 |

未发现需要删除的本轮临时源码文件，不删除用户已有内容。未变更其他 adapter 的版本。

## 版本与打包范围

- Core/Client/CLI：0.2.43。
- Codex：0.2.43.0（由现有 beta:pack 同批冻结，不在 DSH 会话安装/冒烟）。
- DSH 源版本：0.2.43.0，npm 安装包按既有 artifact 合同映射为 0.2.43-rc.0。
- 拟用 CLI 与 DSH npm 版本查询返回 E404，未重复使用已发布版本的不同字节。
- beta:pack 既有 candidate.json 只覆盖三份 npm tgz 与 Codex；DSH 使用既有 export:dsh-plugin 在同一批次的独立 dsh/artifacts 目录冻结，另存 dsh/candidate.json 和 SHA-256，不能把 Codex candidate 当 DSH 测试证据。

## 准备验证

- check:template-versions、check:skill-sources、全仓 check、CLI/DSH 构建通过。
- CLI 聚焦回归 14/14、core 新增及固定收口回归 6/6、DSH workspace 全部测试 155/155 通过。
- Cindy 静态/模拟测试 40/40 通过（不是实际宿主冒烟）。
- Beta pack/install 工具测试 6/6、Codex artifact 测试 26/26 通过；git diff --check 通过。
- 首次 DSH 全集从错误 cwd 调用导致 collector 路径失败，按 npm workspace 正常入口重新执行通过；Beta 工具首次裸 node 调用缺 npm_execpath，按 npm script 入口重新执行通过。版本提升后的 Codex 固定 bridge pin 已同步为 0.2.43.0。

## 未宣称完成的事项

打包、安装、试用计时与真实 DSH 冒烟必须以随后批次记录和真实回执为准。当前旧版真实收口仍有 TEAM_REASONING_EFFORT_INHERITANCE_UNKNOWN 队列警报；不得删除作业或关闭知识捕获掩盖它。七天试用不能倒填。安装不等于运行中宿主已激活，重启后才继续真实 Beta 冒烟。
