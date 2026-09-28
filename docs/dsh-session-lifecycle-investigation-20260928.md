# DSH Web 与第三方会话进程生命周期专项报告（2026-09-28）

## 根因与进程边界

17:24:21 只读 CIM 快照：125 个 node.exe，其中 56 个 DSH runner 和 56 个 claw session open 精确配对，另有 1 个共享 daemon。两类配对进程工作集分别为 3726.6 与 3667.6 MiB，总计 7394.2 MiB；按项目 tiny-world 25、mechanics 16、dsh-better-tasks 10、mechanics-references 2、claw-kit 3 个 claw 进程。数量随其他会话变动；用户原始现场为 113 个 node.exe／约 9.2 GB，DSH Web 主进程约 1.8 GB，与此采样时点不同；工作集不是独占物理内存，也不能凭进程数将所有会话判为泄漏。Windows DSH subprocess-local 为每个目标进程启动独立 Job runner，因此 DSH web → runner → claw CLI → 共享 daemon，不是每会话一个 daemon。

原因是 DSH adapter 原先在 Map 中无期限缓存每会话的 ClawSession；plan.done 不关闭，旧 close 仅发送文本而不等退出。CLI 的 session.close/EOF 属于 soft close：retained session 和 canonical plan 仍可按同一 workspace/session ID 重开，daemon 在所有连接断开后默认 300 秒 idle shutdown。代码依据：packages/dsh-adapter/src/index.ts、packages/dsh-adapter/src/claw-session.ts、packages/cli/src/cli.ts:936-994、packages/cli/src/session-daemon.ts:101-137,265-284、packages/cli/src/session-registry-v2.ts:144-150，及安装版 dsh-subprocess-local/lib/runner.js:138-269。短时 CPU 样本不支持“持续 CPU 高负载”的推断。

## 修改、安全语义和跨平台

DSH 以可信 workspace + agent ID 隔离传输，plan.done 成功且宿主动作和知识分发已交接后，若没有更晚请求，立即关闭自己的传输；并发下一 plan 请求优先，旧完成回调不能截断新工作。未完成 plan 在无运行中或排队 CLI 请求连续 10 分钟后逐出。关闭幂等、等待既有队列、发 session close，最多等待 2 秒自然退出，否则仅对准确的 DSH subprocess handle terminate/waitForExit；超时、破 pipe、异常退出不再复用坏连接。未知 mutation 不自动重放，重连对账 canonical state。独立 DSH subagent、后台 job、共享 daemon 和持久计划不受会话传输回收影响。

loopback-only 的 /claw-session-lifecycle 返回 workspace、session ID、active/idle/reclaiming/dead、queued、requestsStarted、lastActivityAt、closeReason。只读 packages/dsh-adapter/scripts/session-process-snapshot.ps1 补全 OS PID、父链、开始时间、内存，并可合并保存的 RPC 快照。无法从进程内 Map 找到的旧 PID 仅标记待核查，不能自动认作孤儿或杀掉。

第三方审查：Cindy Ghost worker 同样按 session/workdir 缓存持久 CLI 子进程，原先 plan.done 未释放；现已对其单独加入完成后释放、十分钟无排队／执行中请求的闲置逐出、并发后续请求代际保护、异常子进程退出删除缓存、只读 claw/session-transports 状态查询与带 PID/原因的 worker 事件。Windows npm 安装直接调用真实 Node CLI，避免 timeout 仅 kill .cmd wrapper；非 npm shim 保留 PATH 首选优先级。Cindy 的 Orca knowledge_finalizer Worker 是另一独立生命周期，仍由 Host 派发，不随 CLI 传输回收而终止。Codex、OpenCode 与标准 hostless 是一次性 CLI 加独立 finalizer job，不能套用 runner 回收；OpenClaw 当前只有类型合同及 skills，不存在平台特有进程 owner。CLI daemon 的 retained record 与后台知识 finalizer 是不同生命周期；多路复用多个 session 至同一 CLI 需要新隔离协议，暂不承担该高风险重构。

## 复现、优化前后数据与测试

运行 packages/dsh-adapter/scripts/session-lifecycle-probe.mjs，在隔离临时 .claw 项目使用真正的 DSH subprocess-local 与 claw CLI 测量；只清理探针自己的句柄，绝不重启共享 daemon。2026-09-28 17:23:31–17:23:42 同一次样本：

| 阶段 | runner | claw | 配对工作集 MiB |
| --- | ---: | ---: | ---: |
| 开始 | 0 | 0 | 0 |
| 打开 A | 1 | 1 | 133.7 |
| 同一 A 再请求 | 1 | 1 | 133.8 |
| 切换并打开 B | 2 | 2 | 267.5 |
| 关闭 A（B 继续） | 1 | 1 | 133.7 |
| 同 ID 重连 A | 2 | 2 | 267.7 |
| 全部关闭 | 0 | 0 | 0 |

父链样例：探针 Node PID 48552 → runner 36508 → claw 32224。A 首开约 669ms，已有传输请求约 4ms，重连约 753ms；另外两次探针首开约 742–864ms、重连约 767–858ms。这是包括 runner 与 CLI 初始化的总时延，不能称 daemon 启动几乎零成本；daemon 多会话共享。对照关系是旧源码 plan.done 不调用 close、可能长期保持 1 对进程，而新代码在完成后将该传输 soft close；真实 DSH runner fixture 验证了关一对不影响另一对且恢复身份后可重开。仍在运行的当前 Web GUI 使用旧安装版，本次没有安装或重启它，不能把现场总体变化当作优化后的实测收益。

DSH adapter 构建与测试 77/77 通过，覆盖 plan.done 后重新打开、与新计划并发、串行关闭、空闲与运行中、异常退出、请求超时／破 pipe。CLI session-daemon/session-terminal 聚焦回归 4/4 通过，覆盖多连接 retained、重连和 soft close；最初运行这两个文件全集时 12/15 通过，另外三例使用了已失效的隐式 session capture 约定；后续发布候选准备阶段按显式 `knowledgeCapture: false` 合同更新测试，并连同 CLI session-scope 聚焦回归达到 27/27 通过，未放宽生产约束。共享 daemon 的破坏性重启不在正在服务用户的实例上进行；现有 CLI reconnect 测试验证恢复合同。

## 风险与现存进程的安全清理

先用只读采样脚本按 PID + 创建时间 + 父子链 + workspace/session ID 导出证据，并逐个核实活动请求、后台工作及其他 DSH 实例。让活动任务完成并保存会话；升级已安装适配器后，仅经用户明确同意正常重启当前 DSH Web，让旧实例对自己持有的 DSH subprocess handles 做受管 teardown。重启后复采样并逐个核对仍存在的历史 PID；对无法证明 owner 与空闲条件的进程不能自动 kill，禁止全机定时杀 Node。升级／重启／页面刷新未执行前，源码构建并不使现有 Web GUI 生效。Cindy 独立回归 27/27 通过：覆盖 plan.done 后同 ID 重开且知识分发 envelope 不丢、并发下一 plan 不被旧完成回调关闭、闲置定时器不打断运行中的操作、意外 CLI 退出后缓存清理及再打开、现有子计划恢复与知识 claim；当前 Cindy 宿主插件同样未在本任务中发布或重新安装。对没有持久 CLI owner 的 Codex/OpenCode/standard/OpenClaw 本阶段仅记录审查结论，不擅自终止其独立 finalizer。
