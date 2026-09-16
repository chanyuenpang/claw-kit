# DSH subagent delegation contract

<!-- state: current -->
## Current behavior

DSH 上的 claw 角色委派（`researcher`、`feature-architect`）按宿主专属映射执行。映射由
**会派发的两个角色技能**承载（2026-09-16 owner 裁决）：角色语义（谁负责什么、输入输出
合同、验收形态）由 shared 技能拥有，宿主映射写在派发者读得到的地方。

- `packages/dsh-adapter/skills/researcher/SKILL.md` 的 `## Host routing` 节**自包含**
  完整 DSH 映射（adapter 自有技能，可直接写宿主专有工具名）。
- `shared/skills/feature-architecture/SKILL.md` 的「主代理路由」写**逐宿主委派路由**
  （Codex 用 `list_agents` / `spawn_agent` / `wait_agent`；DSH 复用优先并省略
  `run_in_background`；其他 adapter 按其委派说明），随 `sync:shared-skills` 复制到三个
  adapter。
- 通用工作流入口 `using-claw-kit` **不承载委派能力**：主流程按设计不派发（DSH 上
  finalizer 由 adapter 自动派发），因此它没有委派章节。曾放在
  `skills/using-claw-kit/references/dsh-delegation-contract.md` 的映射文件与 `tool:claw`
  常驻指针已删除/撤销，那个路径不再是任何入口。
- 若确需一个宿主专属文件，它必须落在 adapter 自有的 `skills/` 内：
  `packages/dsh-adapter/package.json` 的 `files` 只有 `lib`、`skills`、
  `cordis.patch.yml`，包根 `references/` 不随包发布、模型也不可寻址；shared 技能目录内
  新增文件会被 `sync-shared-skills` 的 `rm -rf` 与文件集校验清掉。

## 取得 durable child

- 用 DSH 原生 `subagent` 派发，**省略 `run_in_background`**。本部署是
  `backgroundMode: continuable`：省略或 `true` → `{kind: "continuable", subagentId}`，
  durable 且可 `send_message` 复用；显式 `false` → `{kind: "foreground", runId}`，
  前台一次性运行，收集结果后 child 即被释放、不出现在 `list_agents` 中，之后无法复用。
- 需要结果不等于需要前台：`waitForCompletion: true` 在 DSH 上由"保留 durable child 并等
  它的结算通知"满足，禁止用 `run_in_background: false` 表达等待。
- `description` 写成 `<role>: <3-5 词范围>`（如 `researcher: dsh subagent reuse`）。
  这是约定而非保证：宿主把 `description` 当展示文本，没有角色身份字段，任何依赖它成立
  的 adapter 逻辑都是错的。

## 复用判据与序列

1. 先 `list_agents`（本 agent 的直接子列表）。
2. 命中同一角色标签且 `status` 为 `idle` 或 `ready` 的 child → 用 `send_message`
   投递增量简报，不重发全部背景。
3. 未命中 → 新建 child。
4. `status: running` 的 child：`send_message` 只能排队成为它的下一轮，不能改道当前
   轮次；确实需要并行独立工作时另开一个 child。

复用作用域是 **session 级且 best-effort**：DSH 的 `authorizeLineage` 要求 child 的
durable `parentSession` 等于调用方 agent id，且父 agent 必须是同一个活体实例。因此父
会话换成新 session id 后，旧 child 仍可被 `listChildren` 枚举，却会被拒——
**可枚举 ≠ 可复用**。复用失败收敛为单一回退路径：

- `UNAUTHORIZED`：child 的 durable parent session 不是当前会话。
- `NOT_RESUMABLE`：child 本身不可续（例如不是 continuable）。

两者都收敛为"新建 + 重新支付一次发现成本"，**不要重试同一个 id**。adapter 不持有
role→child 绑定：`SubagentListEntry` 没有角色语义槽位，label 只是展示文本，绑定会与
shared 技能拥有的角色语义脱钩。`list_agents` 只列 continuable child
（`project()` 对 `entry.mode !== "continuable"` 返回 `undefined`），所以一次前台形态
的派发后续无论如何都救不回来。

## knowledge-finalizer（模型不参与）

DSH 上 knowledge finalizer 由 adapter 在终态 plan mutation 之后自动派发，并按
`finalizeId` 去重；该行为的 owner 是
`.claw/truth/features/dsh-knowledge-dispatch-and-finalization.md`，本文不重复其机制。
模型侧对此无合同文本可读：去重与非重试由 adapter 结构性保证，模型只在失败 dispatch 的
结果里看到 `retryable: false` 与"不得手动重试"的 guidance；手动重试是唯一还能产生第二
个 writer child 的路径。派发受理后不等待、不轮询。

## plan.edit 的引用形态

shared 技能写的 `claw plan edit --reference <path> --why "..."` 在 DSH 上没有对应 CLI
调用，正确形态是 `claw_run(operation: "plan.edit", args: { references: [{ path:
"<相对项目根目录>", why: "<原因>" }] })`；`--why` 没有独立参数槽位，原因写在
`references[].why` 里。

## 关联代码

- `packages/dsh-adapter/skills/researcher/SKILL.md`（自包含宿主映射）
- `shared/skills/feature-architecture/SKILL.md`（逐宿主委派路由）
- `packages/dsh-adapter/skills/feature-architecture/SKILL.md`（同步副本）
- `packages/dsh-adapter/test/delegation-contract.test.mjs`
- `scripts/sync-shared-skills.mjs`（`SHARED_SKILL_NAMES`）

## 验证标准

- `packages/dsh-adapter/test/delegation-contract.test.mjs` 断言 researcher 自包含映射与
  feature-architecture 的逐宿主路由，并含反向断言：`using-claw-kit` 不得出现委派章节 /
  `run_in_background` / `list_agents`，构建产物不得再引用已删除的合同文件，
  `researcher` 不得回到 optional 派发框架或推荐前台形态。
- `scripts/sync-shared-skills.test.mjs` 的一致性校验覆盖 feature-architecture（它现在
  含宿主路由字节改动）；DSH 的 `researcher` 是纯 adapter 自有，不受该 researcher
  description 校验约束。

## 关键检索词

`DSH delegation contract`、`run_in_background`、`list_agents`、`send_message`、
`UNAUTHORIZED`、`NOT_RESUMABLE`、`可枚举 ≠ 可复用`、`worker: readonly`、
`Host routing`
