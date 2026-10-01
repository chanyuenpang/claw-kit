# ADR: DSH host delegation mapping lives with the delegating role skills

## Context

角色共享语义需要可执行的宿主映射，但普通后台 job、continuable child 与用户授权的 Agent Teams 不是同一类对象。早期固定部署假设和 adapter-local researcher 使 shared 同步通过也不能保证调用合同正确。

## Decision

- 派发映射继续属于 researcher/feature-architecture 派发角色，而不是通用工作流入口。完整宿主细节属于角色自己的邻接资源；规范源定位、目录布局和分发目标由 [shared-source Truth](<../features/shared-planning-skill-source.md>) 拥有，不在 adapter 副本独立维护，也不从旧物理路径推断当前部署。
- 复用是实际能力约束下的 best-effort，不根据省略后台参数推导 durable child；按返回种类分别收集 job、复用已知 continuable child 或消费 foreground 结果。Team 需要用户明确授权，不能拿 Team 枚举替代普通 child/job API。
- 角色输入保持自包含窄上下文，新派发和复用之前披露；researcher 只读，architect 只写明确授权的 reportDir。父 lifecycle 与引用登记仍由主代理负责。
- 自动 knowledge finalizer 的 dispatch、去重与不可重复派发由 adapter 拥有，模型不得因角色复用规则启动第二个 writer。其 native 机制仍由 [native-route ADR](<dsh-adapter-native-subagent-knowledge-route.md>) 拥有。
- 已确认但尚未实施的 Team 改造边界：一个 Team 一个 Leader，researcher/architect/finalizer 仅在该 Team 内复用；不引入跨 Team 项目级角色池或全局调度器。前两者的派发语义继续属于 shared 角色技能，finalizer 的创建、复用、派送由 adapter 直接负责且每 Team 始终串行，不交给 Leader 模型。
- Team 复用的是成员身份与相关语义上下文，不是 job 材料、claim、assignment、delegate plan 或结果。每 job 独立关联；保留 claw canonical lifecycle、claim/done 与前台异步收尾。此决策约束未来设计，不证明现有 Team runner 或新字段已经实现。

## Alternatives

- 跨 Team 全局角色池、项目级统一调度或 Leader 模型代管 finalizer：不采纳。它们超出已确认的 Team-local 边界，并把自动收尾的身份、去重与串行 owner 分散到模型。
- 把插件 enabled、Service 存在或调查 child 工具清单之一当作完整能力证明：不能作为待实施路线的依据。配置、runtime、provider 与 exact Leader scope 是不同事实；只读能力合成与失效策略仍是建议，尚未部署验证。
- 把映射放在通用工作流入口（`skills/using-claw-kit/references/`）并加常驻
  `tool:claw` 指针：**一度采纳，随后否决**。它在打包上是可行的（在 `files` 的
  `skills` 内），但把委派能力挂到了一条**不需要该能力**的路径上：`using-claw-kit` 是
  主流程入口，DSH 上 finalizer 由 adapter 自动派发，主流程本身从不派发；委派映射的读者
  只有角色派发者，即 `researcher` 与 `feature-architecture`。
- 复用 codex/opencode/cindy 的包根 `references/` 先例：拒绝。DSH 的 `files` 不含
  `references`，包根文件不随包发布，模型不可寻址。
- 把所有 DSH 专有名词都挡在 shared 技能之外：拒绝，且这条约束本身是错的。shared 技能本来
  就可以逐宿主点名（`shared/skills/feature-architecture/SKILL.md` 已写
  `DSH 使用 claw_run(operation: "context", args: {})`），同步是同一份字节复制，逐宿主
  叙述不破坏一致性校验。真正需要外移的只是宿主工具映射的完整细节，不是所有宿主名词。
- 由 adapter 为普通 researcher/architect child 维护 role→child 绑定，用服务层 `listChildren` 按 label 机械复用：拒绝；这不否定未来 adapter-owned Team finalizer 的 exact member 绑定。
  `SubagentListEntry` 没有角色语义槽位，label 只是展示文本；绑定会与 shared 技能拥有的
  角色语义脱钩，并在父会话换 session id 后产生必然失败的复用。
- 只靠模型自觉遵守 shared 的 `delegateSubagents`：拒绝。宿主常驻提示允许用前台一次性
  派发表达"需要结果"，不能根据等待需求推断 foreground 或复用能力；当前必须按实际返回种类处理，而不是套用旧部署的 child 枚举假设。

## Consequences

- 共享邻接资源必须随整包同步和打包；角色语义、宿主映射与安装可达性共同受检查，不再锁死 adapter-local inline 章节。
- 真实 SDK schema 和授权优先于历史工具名称；成功排队不重发，失效 child id 不重复尝试。后台 job 的收集与 Team 等待严格分离。
- Team 迁移仍需后续授权与实施。只读能力门禁、逐 job 材料/关联/恢复基础、最后常驻 finalizer，是建议的依赖顺序；不能先切换消息派发再把未知结果恢复留作补丁。安装版开关/HMR、model/effort 覆盖、连续两 job 与两 Team 隔离未做有状态验证；后续应使用隔离 profile 和临时项目，不在用户当前 profile 做破坏性 probe。
- 插件 enablement/availability 的事实归 Host；由 adapter 只读合成门禁、Team 作为可选能力而非 claw hard dependency、未知或已 claim job 不换 writer，仍属待实施推荐，不追加已上线能力声明。
- 当前操作规则由 [DSH delegation Truth](<../features/dsh-subagent-delegation-contract.md>) 唯一拥有；公共分发由 [shared-source Truth](<../features/shared-planning-skill-source.md>) 拥有。

## Related Code

- researcher/feature-architecture 的规范角色包与邻接 host 映射；实际 locator 由 shared-source owner 维护
- `packages/dsh-adapter/test/delegation-contract.test.mjs`
- `scripts/sync-shared-skills.mjs`

<!-- state: history -->
## Decision evolution

<!-- dated: 2026-10-01 -->
### 修正固定 continuable 假设和 adapter-local 维护

2026-09-16 的落点决策让 researcher 在 adapter entry 内承载映射，并假设 list_agents 枚举可复用 child。公共整包重构保留“派发角色拥有映射”的理由，但用共享邻接资源和真实 handle 分支替换该部署限定策略。不能把旧 idle/ready 枚举序列当作当前 Teams/job 合同。

## Search Terms

- `DSH delegation contract`
- `Host routing`
- `run_in_background`
- `list_agents`
- `send_message`
- `可枚举 ≠ 可复用`
- `UNAUTHORIZED`
- `NOT_RESUMABLE`
