# ADR: Codex plan mutations use a fixed code-mode consumer

## Status

Accepted

## Context

Codex 的 claw plan mutation 会同时产生 CLI JSON 和需要调用原生 host tools 的 `hostActions`。如果让 Agent 在 `hostActions`、`workflowGuidance.goalTool` 和分离 host 调用之间自行选择，action 顺序、幂等性、字段投影和 Goal Mode 调用次数都会依赖临场判断。

`0.1.75` 的真实验收进一步确认，普通 `plan.edit`、`wait`、`resume` mutation 返回保持精简：未出现 `hostActions`、`goalTool`、`nextsteps`、`notes` 或 `protocol` 噪声字段；driver cold/warm 两次获取保持 `driverVersion=3`、`cacheKey=claw-kit:codex-driver:v3:s1` 与同一 SHA，未发生命令重试。

公开的 Codex 插件接口不能让 CLI 子进程直接调用 `update_plan`、`create_goal` 或 `update_goal`；这些原生 host tools 只能从 code-mode 的 `tools` namespace 调用。同时，code-mode isolate 不能直接 import 本地插件模块。

`2026-07-19` 的公开 app-server 协议提供 `thread/goal/set|get|clear` 与 `mcpServer/tool/call`，但它们属于连接特定 app-server instance 与 thread 的原生客户端协议，不是普通 CLI 子进程可继承的 plugin capability。公开 plan surface 只有 `turn/plan/updated` notification，没有客户端 `turn/plan/set`；dynamic tools 与 hooks 的调用方向也不能让 CLI 主动发起内建 `update_plan`。

同日的 bridge 压缩评估确认，当前约 20 行、1083 字符的 skill 样板主要承担首次 bootstrap、driver/schema 版本校验、缓存和 runner 调用；host action 白名单、input 校验、按 action id 去重消费及 stage-relevant 输出过滤已经位于 CLI driver 内。因而可以缩短已完成 bootstrap 的同线程调用，但不能删掉首次信任建立或把 mutation 与 native host action 拆开。

真实 Host lifecycle 验收推翻了 `schema-v2 ensure_goal` 方案：让 Agent 读取当前 Goal 状态、匹配 host error text 或据此补偿，会把宿主内部状态泄漏到提示词控制流；在同一个 code-mode call 中先 complete 再 create 也不可行，因为 Codex 在调用结束时结算 complete，并会清掉同调用中新建的 Goal。`0.1.75` 因此改为由 CLI 按 mutation 提交后的 plan 状态投影 schema-v1 原生 Goal actions，并以跨调用 lifecycle 验证其行为。

`0.1.86` installed Host 历史验收又暴露了两个幂等边界：resume 时旧 Goal 可能仍 active，而 root closeout 时 Goal 可能已经为空。canonical mutation 已先落盘，Agent 不能通过重放 transition 补偿。固定 consumer 因而必须在真实 Goal mutation 紧前方自行读取一次 snapshot，并在目标状态已经满足时把 action 记为已消费；该局部程序检查不改变 CLI 的 plan-status action routing，也不把 Goal 状态暴露给 Agent。后续恢复合同明确保留现有 nonterminal Goal；恢复 active plan 的一次 `plan sync` 只恢复 progress projection，并且只在 Goal 缺失时创建 Goal。

## Decision

Codex adapter 的所有 claw plan mutations 只走固定的单调用 code-mode consumer：

- Agent 只向 `runClawPlanMutation` 提供结构化 `argv: string[]`、working directory 和 timeout，不拼接 shell command，也不解释或手写 action dispatch。argv 只允许 `plan`、`task`、`subplan` group，并拒绝调用方提供 `claw` 或 `--host`。
- driver 把 argv 编码为 UTF-16 hex，并只运行固定形状的 `claw codex invoke <hex>`；CLI 解码并再次校验后内部追加 `--host codex`。driver 聚合支持的文本通道，优先接受同时满足 `ok: boolean` 与 `command: string` 的完整成功 protocol object；没有成功结果但发现结构化 CLI error envelope 时，必须保留其 `code`/`message` 作为失败原因，并且不得消费 host action。
- consumer 解析 CLI JSON，并按返回顺序消费 `hostActions`；每个 action 按 `id` 至多成功执行一次。
- `hostActions` 是 Codex 唯一的 host 执行源。`workflowGuidance.goalTool` 继续作为 core 和其他 host 的兼容合同存在，但 Codex 不解释、不执行，也不据此补建或重试 action。
- schema v1 action envelope 只保留 `schemaVersion`、作为至多一次消费键的 `id`、`tool` 与真实 host `input`。`sourceEventId`、`meta.reason` 与 `meta.allowOverwrite` 没有 Codex consumer，因此不再输出；不为这次兼容精简引入 schema v2。
- consumer 只白名单调用 `update_plan`、`create_goal` 和 `update_goal`，且只把经过验证的 `input` 投影给 host tool。action envelope 的最小字段不改变工具白名单、顺序、幂等或 fail-closed 边界。
- `packages/cli/src/codex-host-actions.ts` 是 stateless CLI 与 process-backed session command service 的唯一 host-action projector；两条入口不得复制 plan/Goal 投影规则。
- consumer 语义变更必须同时 bump versioned driver/cache identity，避免同线程继续复用旧 source；本次 Goal-action 幂等变更以 v5 bump 落地。当前具体 identity 由 `../features/codex-workflow-guidance-consumption.md` 唯一拥有。
- command-execution capability 必须由 driver 在运行时从注入的 `tools` object 解析：可用时使用 `shell_command({ command, workdir, timeout_ms })`，否则使用 `exec_command({ cmd, workdir, yield_time_ms })`；两者都不可用时，以明确的 unsupported-command-execution error 失败。bridge 不得从 OS、Codex version、environment variables 或 Agent 提供的 tool name 推断该能力。此选择同时适用于获取 driver 的 bootstrap 与返回的 driver source；任一语义变化都要求新的 driver/cache identity。
- bridge 的安全压缩路线是 cold path 保留完整 bootstrap 和兼容性校验；校验成功后只缓存已验证的 `source`，让同线程后续 mutation 通过约 4–6 行 hot path `eval` 并调用 runner。当前 skill 仍缓存完整 envelope 并复用同一个 wrapper，这项压缩尚未实现。
- hot path 发现缓存缺失或版本不兼容时，只能重新进入完整 bootstrap，或以 `bootstrap required` 一类明确错误 fail closed；不能运行未验证 source、手工解释 `hostActions`，也不能把 CLI mutation 与 native host action 改成两个调用。
- v4 曾只扩大 `plan.done` 的可见终结字段：`planPath`、`nextsteps` 与 `achievement`；v5 保留这些 compact-result 语义，并加入固定程序内的 Goal-action 幂等检查。普通 mutation 仍保持精简，subplan done 恢复 parent 时因为没有 root terminal `achievement` 而不会制造终结成就。
- Goal action 继续使用 schema-v1 原生命令，不引入 `ensure_goal` pseudo-action，也不匹配 host error text。只有固定 driver 可以在 action 紧前方调用 `get_goal`；Agent 禁止单独检查 Goal 状态。
- CLI 只按 mutation 提交后的 plan 状态路由 host actions：每个非空 `process.*` plan 投影完整 Progress；`process.wait` / `process.discussing` 发出 `update_goal(status="blocked")`；进入或恢复 `process.active` 按既有合同发出 `create_goal`；每个 `end.*` 先以 `:clear_progress` action-id 输出 `update_plan({ plan: [] })`，再发出 `update_goal(status="complete")`。
- consumer 逐条执行 CLI 返回的 action；每个 `create_goal` / `update_goal` 紧前方读取 Goal snapshot。`create_goal` 遇到任何 nonterminal Goal 时保留它、返回可见 recovery note 并将 action 记为已消费；只有不存在 nonterminal Goal 时才创建新 Goal。没有 active Goal 时跳过 `update_goal`。恢复 active plan 时，SessionStart 要求固定 driver 运行一次 `plan sync`，该调用恢复 progress projection，并仅在 Goal 缺失时创建 Goal；resume 的 canonical transition 不得重放。
- 未知 `schemaVersion`、未知 tool、不兼容 input 或缺失 host tool 一律 fail closed。Codex 不提供 direct-call 或 split-call fallback。
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md` 内嵌固定 `runClawPlanMutation` driver，以便在 isolate 内直接执行；`packages/cli/src/codex-driver.ts` 是当前 source contract，并由 source SHA snapshot 强制 driver/cache identity 随序列化语义变化升级。旧的 `packages/codex-adapter/scripts/code-mode-host-action-consumer.mjs` 只保留为 repository test oracle，不进入 plugin payload。
- Node adapter worker 走 `@veewo/claw-client` 的持久 session 时，使用 schema-v1 `commandEnvelope()` 接收 `output`、`hostActions`、`postCommitEffects` 与可选 `knowledgeDispatch`；普通 `command()` 只返回 `output`。当前 Codex code-mode 不能跨调用持有该 Node socket，因此仍用 structured-invoke compatibility transport，每次 mutation 启动一个轻量 CLI 进程。
- Goal lifecycle 变更发布前必须用未发布的本地构建通过真实 Host wait→active 验收：wait 后 Goal 为空，resume 后新 Goal 在跨调用结算后仍保持 active；单元合同测试不能替代该门禁。

## Alternatives Considered

- 让 Agent 判断 `hostActions` 与 `goalTool`：拒绝，因为会把顺序、去重和重复 Goal Mode 调用风险重新交给提示词解释。
- CLI 子进程直接调用 Codex host tools：拒绝，因为公开插件接口没有提供这条能力边界。
- 把 app-server Goal/MCP API 当作当前 plugin shortcut：拒绝，因为它需要同一 app-server instance、初始化与 thread identity，而且没有客户端 plan setter；仅保留为未来原生 Codex integration 的独立候选路线。
- code mode 失败后退回分离 host 调用：拒绝，因为 fallback 会绕过同一程序内的 schema 校验、幂等性和字段白名单。
- 继续接受 Agent 提供完整 shell command：拒绝，因为 quoting、shell interpolation 与 `--host` ownership 会重新进入 prompt-controlled surface；structured argv 和固定 invoke command 把这些边界收回程序。
- 在首次调用前直接使用短 hot path：拒绝，因为尚未建立可信的 versioned driver source；短调用只适用于同线程已通过完整 bootstrap 的缓存命中。
- 现在把 bridge 收敛成真正的一行 CLI 调用：暂不采用，因为普通 CLI 子进程没有当前 thread 的原生 host-tool capability；只有未来 Codex runtime 提供专用持久 helper/tool 时才重新评估。
- 在 isolate 内 import consumer 模块：不可行，因为当前 code-mode isolate 不能直接 import 本地插件模块。
- 使用 `ensure_goal`、让 Agent 查询 Goal 状态或匹配错误文本：拒绝，因为这些路径把 host 内部状态与错误文案暴露给提示词控制流。固定 consumer 在 mutation 紧前方通过原生 `get_goal` 做一次局部幂等判断是已采用的程序边界。
- 在同一 code-mode call 内先 complete 再 create：拒绝，因为调用结束时的 complete 结算会清掉同调用中新建的 Goal。

## Related Code

- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/codex-adapter/hooks/code-mode-host-action-consumer.test.mjs`
- `packages/codex-adapter/hooks/subagent-contract.test.mjs`
- `packages/codex-adapter/references/workflow-guidance-consumption.md`
- `packages/cli/src/cli.ts`
- `packages/cli/src/codex-driver.ts`
- `packages/cli/src/codex-host-actions.ts`
- `packages/cli/src/command-service.ts`
- `packages/cli/test/cli.test.ts`
- `packages/client/src/protocol.ts`
- `packages/client/src/index.ts`
- `.claw/tasks/实现-Goal-目标状态幂等保证并发布-0.1.72/plan.json`
- `.claw/tasks/验收-0.1.75-短Bootstrap-20260717T1255/plan.json`

## Consequences

- Codex 的计划镜像和 Goal Mode 生命周期由 CLI 投影的同一组 `hostActions` 驱动，避免 `goalTool` 造成第二次调用。
- action 的 schema、顺序、幂等性、input 边界和 tool 白名单成为可测试的程序合同，不再依赖 Agent 判断。
- structured argv、固定 invoke command 与 CLI 侧二次校验移除了 Agent-controlled shell quoting 和 host injection；protocol parser 不会把 shell diagnostics 中任意花括号误当 mutation result。
- stateless CLI 与 session command service 共享同一个 host-action projector；Node adapter 得到原生 envelope，而 Codex code mode 保留兼容 transport。两者共享语义，但不虚构 Codex 已拥有持久 socket。
- schema-v1 envelope 删除无人消费的事件与策略 metadata，保留 `id` 的至多一次语义和原生 host `input`；兼容精简不需要新增 schema 版本，也不改变 consumer 实现边界。
- Goal action 的目标状态幂等性由固定程序拥有：设置 Goal 不覆盖任何 nonterminal Goal，而是在没有 nonterminal Goal 时才创建；已关闭或不存在的 Goal 不会被 completion 再次关闭。恢复 active plan 的 `plan sync` 同时恢复 progress projection。所有路径都保留 action-id 至多一次语义。
- plan-status router 消除 Goal 桥接对 Agent 所见历史状态、错误文本和补偿判断的依赖；source 与 versioned cache 中的 consumer/driver 必须保持该合同一致。
- app-server 的 Goal/MCP 能力不改变当前 owner：在公开协议出现客户端 plan setter、或 claw 成为连接当前 UI thread 的原生客户端之前，`update_plan` 继续由 agent 触发的固定 code-mode consumer 执行。
- wait/discussing 会保留 Progress 并阻塞 Goal；每个 terminal end 状态才清空 Progress 并完成 Goal。
- 真实 Host lifecycle 成为 Goal action 发布门禁，避免仅靠 mock 或单元测试批准宿主时序错误。
- host tool 不可用或合同不兼容时会显式停止；调用方必须修复程序或接口版本，而不能静默绕过合同。
- command execution 兼容已支持的 host-tool variants，不把 adapter 绑定到单一 Codex tool name；不受支持的 host 仍须在任何 CLI mutation 或 host-action dispatch 前失败。
- `exec_command` 不能复用 `shell_command` 的参数名称；bootstrap 与 driver source 都须将 timeout 投影为 `yield_time_ms`。v9 修复了该参数投影，当前 structured-argv/source-SHA 合同使用 v10 driver/cache identity。
- 内嵌 driver 与独立 source contract 必须通过合同测试保持语义一致。
- cold/hot path 分层允许后续 mutation 减少重复样板，同时把信任建立、版本/schema 校验与 fail-closed 边界保留在首次 bootstrap；落地前不得把该预期收益描述成当前行为。
- v4 引入的终结字段过滤继续让 Codex 能直接呈现 root completion，同时不把完整 CLI result 或其他 mutation 的内部字段暴露给 Agent；CLI completion shape 的 owner 仍是 `.claw/truth/adr/cli-guided-plan-lifecycle.md`。

## Search Terms

- `runClawPlanMutation`
- `code-mode-host-action-consumer`
- `hostActions`
- `goalTool compatibility`
- `schemaVersion`
- `schema-v1 native Goal actions`
- `plan-status Goal router`
- `no ensure_goal`
- `no error-text matching`
- `complete then create across calls`
- `real Host lifecycle release gate`
- `action idempotency`
- `fail closed`
- `direct-call fallback`
- `split-call fallback`
- `driverVersion=5`
- `claw-kit:codex-driver:v5:s1`
- `get_goal program-only inspection`
- `active Goal reuse`
- `skip already closed Goal`
- `plan.done achievement visibility`
- `short code-mode bootstrap`
- `cold path full bootstrap hot path cached source`
- `bootstrap required`
- `minimal mutation response`
- `structured argv`
- `claw codex invoke`
- `ClawSessionCommandEnvelope`
- `commandEnvelope`
- `single host-action projector`

<!-- state: history -->
## 演化历史

<!-- dated: 2026-08-28 -->
### Committed mutations survive host projection failures

The v16 bridge treats Goal and Progress projection failures as `hostEffectFailures` on an otherwise successful canonical mutation, returning the committed `planPath`, plan status, and mutation identity. Consumers must reconcile with `plan sync` when needed, never replay the originating mutation. This preserves the fixed consumer's schema and action safety boundaries while removing a host-side single point of failure from the canonical lifecycle.

<!-- dated: 2026-08-24 -->
### 失败信封的可见性纳入固定 consumer

- v13 的单通道成功-envelope 解析会丢失部分 CLI 结构化失败；为保持失败诊断与 Host Action 安全边界，解析升级为跨 `output`、`stdout`、`stderr`、`text` 的成功优先识别，并将 failure-envelope 语义变化视作独立的 driver/cache identity 升级。

<!-- dated: 2026-08-26 -->
### Progress and Goal lifecycle are independent

The fixed consumer accepts an empty `update_plan.plan` only for a `:clear_progress` action. The projector now synchronizes all nonempty Codex process plans, preserves that projection in wait/discussing while blocking Goal, and clears it for every terminal end status before completing Goal.

<!-- dated: 2026-08-06 -->
### 恢复时保留非终态 Goal

旧恢复路径会结束已有 nonterminal Goal，再通过独立调用创建新 Goal。当前决定改为保留已有 Goal；恢复 active plan 的 `plan sync` 只恢复 progress projection，并且仅在没有 nonterminal Goal 时创建 Goal。

<!-- dated: 2026-07-29 -->
### `exec_command` 参数 schema 兼容

v8 的 fallback 曾把 `{ command, workdir, timeout_ms }` 传给 `exec_command`。v9 将 bootstrap 与 driver source 同步改为 `{ cmd, workdir, yield_time_ms }`；保留这段演化记录，以便排查旧 cache source 与 Unified Exec host 的兼容问题。

<!-- dated: 2026-07-17 -->
### 短 bootstrap 与跨调用 Goal lifecycle 实测

来自 `.claw/tasks/降低-Codex-workflow-心智压力并改用-Luna-writer/plan.json` 的持久化决策：

- 短 code-mode bootstrap 使用 CLI 发出的 versioned driver；driver v3 以 `claw-kit:codex-driver:v3:s1` 缓存身份复用。
- 干净 Luna 线程验收中，普通 mutation、`plan.wait`、`plan.resume` 均保持精简输出，未出现 `goalTool`、`goalMode`、`events`、`nextsteps`、`notes` 或 `protocol` 噪声。
- `plan.wait` 与 `plan.resume` 通过跨调用 Goal lifecycle 验证：前者自动关闭 Goal，后者自动重建 Goal。
