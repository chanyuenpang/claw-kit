# Codex subagent reuse

## Status

Partially superseded. 本文关于 `truth-writer` / `adr-writer` 的复用与 main-thread dispatch 仅是历史证据；当前沉淀由 hook-owned combined `knowledge-writer` pass 管理。Codex `researcher` 的代码调查派发与复用规则仍属本文范围。

- Codex adapter 只把代码调查交给 `researcher` subagent：代码库调查、源码/符号/依赖追踪、代码架构理解、当前实现行为追踪，以及 planning 或 implementation 前的代码证据收集。主 agent 不在自身上下文内联完成这类完整代码调查。
- `truth-writer` 与 `adr-writer` 在 dispatch 后应保持打开，供同线程后续复用，而不是立刻关闭。
- 普通项目 recall、canonical Truth/ADR lookup 与历史上下文查询由主 agent 直接运行 `claw search`；这些文档召回本身不触发或派发 `researcher`。
- 代码调查 task 必须委派给 `researcher` specialist，以节省主 agent context。
- `researcher` 被派发后，调查执行顺序先用 `claw search --query "<topic>"` 恢复与代码问题相关的项目上下文，再按项目配置使用 GitNexus 或其他代码索引，最后检查精确源码与关系锚点。这里的 `claw search` 是已派发代码调查的第一步，不把普通项目 recall 扩大为 researcher trigger。
- 主 agent 派发前先检查当前线程的 subagents。只要已有 `researcher` 的先前或当前工作覆盖同一 repository、module、feature、behavior chain 或 evidence set，且其调查角色仍然适合，就必须通过 follow-up task surface 复用；无论该 researcher 当前 idle 还是 running 都适用。只有不存在合适实例时才新建。
- dispatch 只发送 exact question、working directory、known target paths、relevant constraints、`claw-kit:researcher` 要求等窄 brief 与增量上下文，不复制完整线程上下文。
- 当前 Codex researcher 的 main-agent dispatch 由 `packages/codex-adapter/skills/researcher/SKILL.md` 内唯一一段 skill-local `delegateSubagents` YAML prompt metadata 表达；该合同以 `worker: readonly` 统一标记 researcher 的只读调查角色，并集中声明 `skill`、`fork_context`、阻塞等待、相关同线程复用、input/output shape 与 `closePolicy`，取代重复的派发 prose 和独立 `Boundary` 章节。它不是 core/CLI typed `workflowGuidance` runtime schema 的扩展，也不要求修改 guidance 生成或注入路径。
- 同一 skill 在结构化合同前用最小 `Host routing` 明确区分两个入口：main agent 在技能触发后消费 `delegateSubagents`，完成派发或复用并等待结果后才继续；assigned researcher 跳过该派发合同，直接执行调查顺序并返回 `outputContract`。宿主不需要从 YAML 猜测自身职责，worker 也不会递归消费自己的派发合同。
- 如果 `.claw/project.json` 中 canonical `gitnexus = true`，且问题涉及代码关系或当前实现行为，`researcher` 应先发现并使用 GitNexus 相关能力；不要假设 GitNexus tool 已经可见。
- 对依赖 research 结果的主流程，host 必须等待 `researcher` 返回，不能跳过 research gate 继续后续步骤。
- researcher subagent 直接执行调查，禁止递归派发另一个 researcher；详细检索留在 subagent context，只向主线程回传结论、证据锚点、不确定性与建议下一步。
- `plan-review` 不再是单独的 workflow gate；如存在 review specialist，也不应再把它建模成 planning 外的一道必经关卡。
- 复用不会放宽 researcher 的窄调查 brief、`worker: readonly` 角色标记与紧凑返回合同。
- 历史 `Truth & ADR` writer dispatch 曾要求优先复用同线程 specialist；该规则不再定义当前 knowledge finalization。

## Current code anchors

- `packages/codex-adapter/skills/researcher/SKILL.md`
- `packages/codex-adapter/hooks/subagent-contract.test.mjs`
