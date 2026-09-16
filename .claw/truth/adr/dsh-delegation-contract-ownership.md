# ADR: DSH host delegation mapping lives with the delegating role skills

## Context

DSH 的 claw 角色委派（`researcher`、`feature-architect`）此前只有 shared 技能里的角色
语义与结构化 `delegateSubagents` 合同，没有"在这个宿主上具体怎么做"的映射。DSH 的调度
原语与 Codex 不同：`subagent` 工具在 `backgroundMode: continuable` 下省略
`run_in_background` 即返回 durable child，显式 `false` 则返回一次性前台 run；复用原语是
`list_agents` 加 `send_message`。仅靠 shared 的宿主中立叙述，主代理会把角色委派要求的
`waitForCompletion: true` 表达成前台一次性派发，从而永久放弃复用——宿主常驻提示
（`@deepseek-ai/dsh-tool-subagent` 的 `lib/index.js`）确实默认后台，但同时允许
"Set `run_in_background: false` only when your next action depends on that subagent's
result"，而角色委派恰好落在这句话里。

同时需要决定这段宿主映射放在哪里：`packages/dsh-adapter/package.json` 的 `files` 只有
`lib`、`skills`、`cordis.patch.yml`；`scripts/sync-shared-skills.mjs` 的
`SHARED_SKILL_NAMES` 是 `planning`、`config`、`create-claw-skill`、
`feature-architecture`。codex/opencode/cindy 的既有先例是 adapter 包根的 `references/`
（如 `packages/opencode-adapter/references/opencode-subagent-dispatch.md`），DSH 没有该
目录。

## Decision

- DSH 的宿主委派映射由**会派发的角色技能**承载（2026-09-16 owner 裁决修正）：
  `researcher`（adapter 自有技能）在 `## Host routing` 内**自包含**完整 DSH 映射；
  `feature-architecture`（shared 同步副本）在「主代理路由」内写**逐宿主委派路由**
  （Codex 用 `list_agents` / `spawn_agent` / `wait_agent`；DSH 复用优先并省略
  `run_in_background`；其他 adapter 按其委派说明），随 `sync:shared-skills` 复制到三个
  adapter。shared 允许逐宿主叙述，因此 feature-architecture 不需要宿主专属文件。
- **不由通用工作流入口承载**：`using-claw-kit` 是主流程入口，按设计不需要子代理派发
  能力——尤其 DSH 上 knowledge finalizer 由 adapter 自动派发，主流程从不派发。曾放在
  `skills/using-claw-kit/references/dsh-delegation-contract.md` 的合同文件与 `tool:claw`
  常驻指针已删除/撤销，那个路径不再是任何入口。
- 角色复用是 session 级 best-effort，且由主代理按合同执行判据与序列（先 `list_agents`
  同角色 `idle`/`ready` → `send_message` 增量简报 → 未命中才新建），adapter **不持有**
  role→child 绑定。复用失败（`UNAUTHORIZED` / `NOT_RESUMABLE`）收敛为单一路径的新建，
  不重试同一 child id。
- knowledge finalizer 的复用不由模型参与：owner 是 adapter，键是 `finalizeId`，失败
  dispatch 标记 `retryable: false` 并给出不得手动重试的 guidance。该决策由
  `dsh-adapter-native-subagent-knowledge-route.md` 拥有，本文只记录它不属于模型可操作的
  委派面。

## Alternatives

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
- 由 adapter 维护 role→child 绑定，用服务层 `listChildren` 按 label 机械复用：拒绝。
  `SubagentListEntry` 没有角色语义槽位，label 只是展示文本；绑定会与 shared 技能拥有的
  角色语义脱钩，并在父会话换 session id 后产生必然失败的复用。
- 只靠模型自觉遵守 shared 的 `delegateSubagents`：拒绝。宿主常驻提示允许用前台一次性
  派发表达"需要结果"，一次错误形态的派发既不可复用也不再出现在 `list_agents` 中，事后
  无法补救。

## Consequences

- `shared/skills/feature-architecture/SKILL.md` 有字节改动（新增逐宿主委派路由），随
  `sync:shared-skills` 复制到 codex/opencode/dsh，因此该文件受共享一致性校验覆盖。
  DSH 的 `researcher` 是纯 adapter 自有技能，可自由携带 `## Host routing` 而
  `scripts/sync-shared-skills.test.mjs` 的 researcher description 校验不涉及它。
- 复用只在同一 session id 内成立，且**可枚举 ≠ 可复用**：父会话换新 session id 后旧 child
  仍可枚举，但 `send_message` 会被拒。这是 DSH 既有的授权边界，不是本决策引入的限制。
- `packages/dsh-adapter/test/delegation-contract.test.mjs` 锁定新落点：researcher 自包含
  映射与 feature-architecture 的逐宿主路由，并含反向断言（`using-claw-kit` 不得出现
  委派章节 / `run_in_background` / `list_agents`，构建产物不得再引用已删除文件；
  `researcher` 不得回到 optional 派发框架或推荐前台形态），防止文案回退。
- 该映射的当前行为与验证标准由
  `.claw/truth/features/dsh-subagent-delegation-contract.md` 拥有，本文只拥有放置位置、
  复用所有权边界、取舍与后果。

## Related Code

- `packages/dsh-adapter/skills/researcher/SKILL.md`（自包含宿主映射）
- `shared/skills/feature-architecture/SKILL.md`（逐宿主委派路由）
- `packages/dsh-adapter/skills/feature-architecture/SKILL.md`（同步副本）
- `packages/dsh-adapter/test/delegation-contract.test.mjs`
- `packages/dsh-adapter/package.json`
- `scripts/sync-shared-skills.mjs`
- `packages/dsh-adapter/src/index.ts`

## Search Terms

- `DSH delegation contract`
- `Host routing`
- `run_in_background`
- `list_agents`
- `send_message`
- `可枚举 ≠ 可复用`
- `UNAUTHORIZED`
- `NOT_RESUMABLE`
