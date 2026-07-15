# ADR: `create-claw-skill` entry route and fallback contract

## Status

Accepted

## Context

这轮完成的 `复制一个-superpowers-技能并用-create-claw-skill-编译` plan 把 `create-claw-skill` 的入口行为收敛成了可长期复用的工作流合同。这个合同不是单纯的实现细节：它决定了一个现成 skill 在被 claw 化时应如何保留可读 fallback、首步应如何进入 template、以及不同请求形态该走哪条最短路由。

如果不把这层规则写进 canonical ADR，后续很容易出现几种漂移：

- visible entry 先做一轮本地分析或临时验证，再绕回真实 template flow
- 已有 skill 的原始文本被覆盖后丢失，导致 non-claw fallback 不再可读
- 单目标、父计划任务、批量/混合请求在入口层各自发明不同路由

## Decision

- `shared/skills/create-claw-skill/SKILL.md` 保持为把现有 skill 或用户想法转换成 claw-template-backed skill 的 canonical 共享入口。
- 对已有 skill，默认转换形态是原地（in-place）改造：visible `SKILL.md` 变成 claw entry，原始 skill 文本保留为同包内相邻 fallback 文档。
- 当同一 workflow 没有 recovered task state 时，`create-claw-skill` 的首个动作必须是 `claw plan create --template create-claw-skill --title "<source-skill-or-target-skill-name>"`。
- 这里的 title 应使用 source skill 名或目标 skill 名；入口 skill 不应先手工草拟平行 plan，也不应先做 pre-template analysis 或 temp validation 再进入 template。
- 单目标请求的最短路径是 `claw plan create --template <template-id>`。
- Active parent-plan task 在执行到达时应使用 `claw subplan create --parent <parent-task-name> --task-id <id> --template <template-id>`。
- Batch 或 mixed request 应先创建正常 root claw plan，再在对应 task execution 时实例化 template subplan。
- 生成出来的 template 仍然落在对应 skill package 的 `TEMPLATE.json` 中，并要用 `claw template validate --template <template-id>` 做最终校验。

## Consequences

- 已有 skill 的 claw 化不会额外制造第二套 visible skill 集合，原始文本仍然可作为直接 fallback 读取。
- 入口 skill 的职责收敛为“尽快进入真实 template flow”，而不是在入口层展开复杂 workflow control。
- 单目标、父计划任务和 batch/mixed 三类请求有了稳定的最短路径，后续实现不会因为入口不同而分叉。
- `create-claw-skill` 的自测和正式使用都必须经过真实 template workflow，避免出现只在临时分析路径上成立的假阳性。

## Related Code

- `shared/skills/create-claw-skill/SKILL.md`
- `packages/codex-adapter/skills/create-claw-skill/SKILL.md`
- `packages/opencode-adapter/skills/create-claw-skill/SKILL.md`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/opencode-adapter/skills/using-claw-kit/SKILL.md`
- `packages/core/src/templates/plans/default.ts`
- `docs/create-claw-skill-lessons.md`
