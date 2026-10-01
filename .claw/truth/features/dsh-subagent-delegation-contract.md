# DSH subagent delegation contract

<!-- state: current -->
## Current behavior

DSH 角色委派由会派发的角色技能拥有，而非通用 workflow 入口或普通 child label 绑定。角色规范源、邻接映射的实际定位和公共分发矩阵由 [shared-source Truth](<shared-planning-skill-source.md>) 唯一拥有；本文不以某次工作区目录布局宣称当前安装来源。

## 派发与实际 handle

- 主代理用原生 `subagent` 加自包含窄简报，不用 `subagent_fork` 继承整段对话；新派发与复用之前都简短披露角色和任务。默认后台运行期间只推进独立工作。
- 必须区分实际返回种类：`background` 保存 `jobId` 并在使用结果或结束前用 `job_output` 收集，仅真正阻塞时等待，不轮询，不重复运行；无关 job 用 `job_kill` 停止。`continuable` 保存 `subagentId`，仅在支持时用 `send_message` 复用已知同角色 child。`foreground` 消费结果但不假设可复用。
- 省略 `run_in_background` 不保证 durable child。复用是 best-effort；授权或可续性失效后新建窄上下文 child，不重试 stale id。已成功投递的 queued 消息不重发。
- `list_agents` 是 Agent Teams 列表，不是普通 subagent job 枚举。只有用户明确要求 Teams/teammates 才使用 Team；使用返回的 member target 和真实状态。`inactive` 不代表完成，`wait_agent` 不收集 job、不唤醒 inactive 成员；不能用 Team 绕开普通 child API。
- researcher 只读调查；architect 只读源码，仅 active task 明确授权的 reportDir 可写，无 task 不写文件。主代理负责登记设计引用，child 不修改父 workflow 或 Goal。

## 已确认的 Team 改造边界（尚未实施）

可复用角色团队的设计边界已经确认，但当前并未完成 Team 迁移，也未授权自动启用插件：一个 Team 对应一个 Leader；researcher、architect、finalizer 仅在本 Team 内复用；不建立跨 Team 项目级角色池或全局调度器。researcher/architect 的角色合同仍由 shared 角色技能拥有。

未来 Team finalizer 的创建、复用和派送仍由 DSH adapter 直接管理，不交给 Leader 模型；每 Team finalizer 始终串行。成员身份可跨 job 复用，不代表 claim、材料、assignment、delegate plan 或结果可以跨 job 复用；每 job 保持独立关联。现有 native 路线及其去重不因这一设计边界自动改变。

能力门禁由 Host 提供事实、adapter 只读合成；Team 保持可选依赖、未知投递不得切换 writer，是待实施建议而非现有能力。插件配置 enabled、runtime Service 存在、exact Agent 工具/Team scope 就绪不能互相替代。安装版禁用/HMR、model/effort 覆盖、连续两 job 复用和两 Team 隔离尚未做有状态验证，不得据此宣称可上线。设计理由由 [delegation ownership ADR](<../adr/dsh-delegation-contract-ownership.md>) 记录，native 执行机制仍由下述 owner 维护。

## knowledge-finalizer（模型不参与）

DSH 上 knowledge finalizer 由 adapter 在终态 plan mutation 之后自动派发，并按
`finalizeId` 去重；该行为的 owner 是
`.claw/truth/features/dsh-knowledge-dispatch-and-finalization.md`，本文不重复其机制。
角色映射不授权模型启动、轮询或重试第二个 finalizer；受理后的回合边界遵循 native `using-claw-kit` reference 与 adapter 返回 guidance。本文不重复拥有 finalizer 的运行机制。

## plan.edit 的引用形态

shared 技能写的 `claw plan edit --reference <path> --why "..."` 在 DSH 上没有对应 CLI
调用，正确形态是 `claw_run(operation: "plan.edit", args: { references: [{ path:
"<相对项目根目录>", why: "<原因>" }] })`；`--why` 没有独立参数槽位，原因写在
`references[].why` 里。

## 关联代码与验证边界

- researcher/architect 的角色技能与邻接 host 映射（实际路径由 shared-source owner 维护，不把旧 shared 路径当当前部署证据）
- `packages/dsh-adapter/test/delegation-contract.test.mjs`
- `scripts/sync-shared-skills.mjs`

定向合同检查保护真实 handle 分支、Team 用户授权、窄上下文和 report-only 写入，不锁死旧的 inline 文案落点或断言 researcher 是 adapter-owned。静态检查不能证明外部宿主 live E2E。

<!-- state: history -->
## 演化历史

<!-- dated: 2026-10-01 -->
### 从固定 continuable 部署假设改为实际返回种类

旧映射把省略后台参数等同 durable child，并把 list_agents 当普通 child 枚举；同时 researcher 由 adapter 独立维护。公共整包重构将映射移到角色自己的共享邻接资源，并纠正 job、continuable child 与用户授权 Team 的边界。角色技能继续拥有派发语义，自动 finalizer 仍由 adapter 拥有；通用入口不是第二个模型派发 owner。
