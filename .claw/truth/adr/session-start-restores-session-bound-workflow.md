# ADR: SessionStart 恢复 session 绑定的 workflow snapshot

## Status

Accepted

## Context

`claw-kit` 已经把 Codex 启动恢复责任收敛到 `SessionStart`，并要求 agent 在后续流程中以 `workflowGuidance` 作为唯一 next-step contract。

这带来两个新的恢复约束：

- 同一线程发生 Codex compact 之后，startup 恢复不应再按 source 分叉出另一套 compact 专用流程
- 恢复逻辑必须优先依赖当前 `.claw` canonical state，而不是 recent tool use 或 thread 内瞬时推断
- 如果 session-bound active workflow 能够恢复，startup payload 需要把当前 plan content 一并带回 JSON / additional prompt surface，方便 resumed agent 直接续跑而不必先重新打开 plan

随着恢复态 workflow 真正进入日常多轮对话，还暴露出两个新的长期风险：

- agent 可能把“当前线程已经有 unfinished plan”误当成纯背景信息，直接开始不相关的新任务，而不是先让用户决定要继续还是关闭当前 plan
- 同一线程在 `end.completed` 之后可能被当成普通自由对话继续使用，导致下一项工作绕过 `using-claw-kit` 重新进入 ad hoc 流程

同时，startup 恢复只在能够确认当前 session 对应的 active workflow 时才应该注入最小 workflow contract；否则应保持现有 startup 行为不变，避免创造额外 recover prompt 干扰 `using-claw-kit` 的默认入口。

随着 Goal mode 与 delegated specialists 真正进入日常执行流，默认 startup prompt 还需要承担一个额外约束：它既要保持最小化，避免重复低价值状态信息，也要明确声明当前 thread 已授权使用 Goal mode、`truth-writer` 与 `adr-writer`，防止 agent 误把“等待用户再次授权”当成合法分支。

围绕 project protocol 版本超前的 startup recovery 还确认了另一组长期约束：`runContextCommand` 仍然负责检测版本漂移并生成 `startupRecovery.versionSync`，但恢复流本身不再隐式执行本地升级；是否把更新动作提升为 startup 的第一步，改由 `project.json.autoUpdate` 和已发布新版本共同决定。同时，CLI 与当前 host plugin 安装面的更新要保持为同一个显式 contract，而不是把分发更新塞回 `context` 或 `patch` 语义。

## Decision

统一使用一条 `SessionStart` 恢复流来承接 `.claw` 项目的 startup recovery，并把 session 绑定信息落到 task metadata：

- `plan write` 记录当前 host 的 `ownerSessionKey`
- `SessionStart` 不再按 hook source 区分 `startup`、`resume`、`compact` 的恢复逻辑
- `SessionStart` 启动时尝试从 `.claw` 中恢复与当前 `ownerSessionKey` 绑定的 active workflow
- 恢复成功时，只注入最小 workflow snapshot 和基于当前 canonical state 重算得到的 `workflowGuidance`
- 恢复成功时，额外把当前 plan content 放进 recovered JSON / additional prompt surface，但仍然保持最小化，不重复 project root、`.claw` 路径或 raw 计划历史
- `SessionStart` 生成 additional prompt surface 时，必须消费 `startupRecovery.versionSync`，把 CLI 版本落后、是否存在已发布更新、`autoUpdate` 是否开启，以及下一步应否先执行更新 contract 明确写进 startup 提示
- `runContextCommand` 保留版本漂移检测和 `startupRecovery.versionSync` 计算，但不再因为检测到版本落后就隐式执行本地升级；startup recovery 只负责把该结果 surface 给 prompt
- `project.json.autoUpdate` 是显式布尔 gate，默认 `true`；项目若不希望 startup 触发 update-first 路由，需要显式把它设为 `false`
- `claw-kit:update` 表示一个共享更新 contract：同一动作同时负责更新全局 CLI 与当前 host plugin 安装面，而不是把这两类升级分摊到 `patch`、`context` 或其他恢复语义里
- 恢复成功且线程里已经存在 unfinished plan 时，startup contract 必须显式告诉 agent 当前线程已有未完成计划，并要求先向用户确认是关闭当前 plan 还是继续推进它，再开始不相关的新工作
- 注入内容只包含继续执行所需的最小 contract，不重复 project root、`.claw` 路径或 raw `plan.json`
- 如果没有可恢复的 active workflow，则保持精简版 startup 提示：保留 `.claw` 项目识别、`using-claw-kit` 入口、当前 thread 对 Goal mode / required delegated subagents 的显式授权，以及 “follow workflowGuidance” 合同
- 默认 startup prompt 不再重复 project root、protocol check、或要求 agent 先 “report recovered harness state”
- 当恢复出的 root plan 最终走到 `end.completed` 时，closeout guidance 还要继续提醒同一线程中的下一项工作重新从 `using-claw-kit` 进入，而不是把 claw workflow 视为只对当前 round 生效的一次性前缀
- 本地 Codex plugin cache 刷新继续保持为独立分发/安装面；`claw context` 的 automatic startup recovery 只负责 CLI prompt surface 与 session 恢复合同，不承担 plugin cache 自动安装语义

## Consequences

- Codex compact 后的同线程继续对话可以自动回到当前 session 已绑定的 workflow，而不是重新靠 prompt 猜测上下文
- resumed agent 可以直接看到当前 plan content，因此恢复后的第一轮更像“继续执行”而不是“重新发现计划”
- recovered workflow 不再只是被动回显状态；它现在明确阻止 agent 跳过 unfinished plan 决策门，先做 continue-or-close 的用户确认，再决定是否允许切到不相关的新任务
- startup recovery 继续保持为 enhancement，而不是替代 `plan write`、`plan edit`、`plan done` 和 truth/ADR deposition 的 correctness 机制
- workflow 恢复与 `workflowGuidance` contract 保持一致，减少 adapter 在 compact 后自行发明下一步的空间
- 没有 active workflow 时，系统仍然退回现有 `using-claw-kit` 入口，不增加新的恢复文案分支
- 默认 startup prompt 现在也成为 adapter contract 的一部分：它负责声明 thread-local authorization，减少 Goal mode 与 delegated specialists 的误阻塞
- project protocol 版本超前时，用户现在可以在同一轮 startup recovery 中明确看到 version-sync 结果；恢复流不会静默改写本地安装，而是把“仅提示版本落后”与“先执行 `claw-kit:update`”这两种分支稳定地绑定到 `autoUpdate` gate
- `end.completed` 不再意味着线程脱离 claw 语境；同一线程的后续任务会被明确拉回 `using-claw-kit` 入口，保持 round-to-round workflow continuity
- 历史版本实跑对比进一步说明，startup feel 的风险不在于它“过重”本身，而在于一旦把 startup recovery 暴露成独立入口，它就会与 `plan write`、`process.active` 并列竞争主 agent 的注意力，稀释 task-scope 主流程
- 因此较早版本也不应被概括成“普遍更轻”；durable 结论是 startup surface 必须收敛到恢复当前 workflow contract，而不能扩张成另一个显式 workflow 起点
- active adapter surface 现已统一采用 `startupRecovery` 命名；这类恢复结果属于 hook/runtime 侧状态，而不是用户面前的另一条 workflow skill
- `autoUpdate` 让项目拥有显式的升级策略开关：默认项目会在检测到可用发布更新时进入 update-first 路由，而选择退出的项目可以显式设为 `false`，把版本漂移保留为纯提示
- CLI 与当前 host plugin surface 的更新合同被统一到 `claw-kit:update`，adapter 文案和共享技能只需要维护一条“先更新再继续”的路由，而不必分别解释多个安装面
- 本地 plugin surface 是否真的升级，仍需沿用独立的 distribution/install 验证路径；startup recovery 只决定是否先路由到 `claw-kit:update`，不把安装成功与恢复成功混成同一个判断

## Related Code

- `packages/core/src/workflow-guidance.config.json`
- `packages/cli/src/cli.ts`
- `packages/cli/test/cli.test.ts`
- `packages/core/src/context.ts`
- `packages/core/src/project-check.ts`
- `packages/core/src/plan.ts`
- `packages/core/src/types.ts`
- `packages/core/src/workflow-guidance.ts`
- `shared/skills/update/SKILL.md`
- `packages/opencode-adapter/workflow-guidance.opencode.json`
- `packages/opencode-adapter/plugin/index.ts`
- `packages/opencode-adapter/references/project-config-reference.md`
- `packages/opencode-adapter/skills/update/SKILL.md`
- `packages/codex-adapter/references/codex-startup-recovery.md`
- `packages/codex-adapter/references/project-config-reference.md`
- `packages/codex-adapter/skills/update/SKILL.md`

## See Also

- `session-start-prompt-config-delegation` — SessionStart prompt 从 cli.ts 硬编码迁移到 guidance config，OpenCode plugin 委托 claw hook

## Search Terms

- `ownerSessionKey`
- `SessionStart`
- `compact`
- `unfinished plan`
- `continue or close`
- `using-claw-kit`
- `end.completed`
- `workflowGuidance`
- `active workflow snapshot`
- `versionSync`
- `project protocol version lag`
- `autoUpdate`
- `claw-kit:update`
- `latestPublishedVersion`
