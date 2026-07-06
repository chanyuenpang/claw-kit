# ADR: superpowers 批量转换必须按 skill 拆分 `create-claw-skill` 子计划

## Status

Accepted

## Context

这轮完成的 `Use create-claw-skill subplan to convert brainstorming` plan 不是单个 skill 的一次性改写，而是在为一整批 Codex superpowers plugin skills 建立长期可复用的转换约定。

如果不把这层约定写成 canonical ADR，批量转换很容易退回成几种不稳定形态：

- root plan 直接批量改写多个目标 skill，绕开每个 skill 自己的执行期质量门槛
- 共享生成器一次性产出一批看起来完整、但没有经过独立 subplan 约束的结果
- 生成树被误当成默认 canonical shared skill，进而污染 shared sync 范围

## Decision

- 批量把 14 个 Codex superpowers plugin skills 转成 claw skills 时，root plan 只负责 orchestration。
- 每个目标 skill 都必须通过自己的 `create-claw-skill` subplan 推进，不能由 root plan 直接批量改写目标内容。
- 目标写入路径默认是 `packages/codex-adapter/skills/<skill-name>/`。
- 生成的 template id 必须带稳定前缀，避免与 canonical template id 碰撞。
- 每个 skill 的 subplan 都必须独立完成 source analysis、template design、fallback preservation、compiled knowledge 和 content coverage。
- 生成树可以保留 adjacent fallback document 和同包 helper folders，但不应自动进入 shared canonical sync set；只有显式 promotion 才能进入正式共享同步范围。

## Consequences

- 批量 conversion orchestration 变成“一个 skill 一个 subplan”的稳定模式，而不是一次性脚本式改造。
- 共享生成器只能作为 draft 辅助，不能替代执行期的独立质量门槛。
- 生成的 skill tree 默认保持实验态，不会因为已经落在 workspace 里就自动晋升为 canonical shared skill。

## Related Code

- `.claw/tasks/Rework-Codex-superpowers-claw-skills-through-per-skill-create-claw-skill-subplans/plans/Use-create-claw-skill-subplan-to-convert-brainstorming.json`
- `.claw/truth/features/superpowers-batch-conversion-conventions.md`
- `.claw/truth/adr/create-claw-skill-entry-route-and-fallback.md`
- `packages/codex-adapter/skills/create-claw-skill/SKILL.md`
- `scripts/sync-shared-skills.mjs`
