# create-claw-skill entry contract hardening

## 状态

Accepted working truth for the current template-backed skill conversion path.

## 核心事实

- `shared/skills/create-claw-skill/SKILL.md` 是把现有 skill 或用户想法转换成 claw-template-backed skill 的入口合同。
- 对已有 skill，默认转换形态是原地（in-place）改造：保留同一 skill package，visible `SKILL.md` 替换成 claw entry，原始文本改放到同包内相邻的 fallback 文档里，这样批量转换不会额外制造第二套可见 skill 集合。
- 转换后的 claw skill 不应把 `CLAW-KNOWLEDGE.md` 当作默认第三层；`SKILL.md` 负责 route rules、重复的高信号约束和非 template 的补充材料，`TEMPLATE.json` 或 plan-owned surfaces 负责 structured workflow control、rules、deliverables 和 references。
- 只有当源 skill 仍然需要一个独立的 focused referenced home，且这些内容无法合理放进 `SKILL.md` 与 fallback 时，才引入 `CLAW-KNOWLEDGE.md` 或同类 skill-local reference。
- 当同一条 `create-claw-skill` workflow 没有已恢复的 task state 时，首个动作必须是 `claw plan create --template create-claw-skill --title "<source-skill-or-target-skill-name>"`。
- 这里的 title 应使用 source skill 名或目标 skill 名；入口 skill 不应先手工草拟平行 plan，也不应先做 temp project validation 或 fallback compile 再进入 template。
- 这条 first-action 规则也适用于自测场景；测试这个 skill 本身时，仍然要先进入真实 template workflow，而不是先做 pre-template analysis 再模拟流程。
- 一旦 `claw plan create` 返回，后续应跟随返回的 `workflowGuidance`；workflow control 由 template 持有，而不是由入口 skill 自己展开。
- 如果请求已经显式命中了模板化 workflow skill，`packages/codex-adapter/skills/using-claw-kit/SKILL.md` 和 `packages/opencode-adapter/skills/using-claw-kit/SKILL.md` 中的通用 complexity gate 不应抢占入口。
- 模板里的第 1 个 task 应该只承担快速 route choice；当请求已经足够明确时，应直接选 `simple`、`routing` 或 `idea-first` 之一，不要把 task 1 拉长成设计评审。
- 入口 skill 的职责是把请求尽快送入 template flow，并保留 non-claw fallback 的可读性；模板本身再负责后续 workflow control、branching 和 config override。
- 如果一个 skill 的完整行为已经能由保留的 fallback `md` 承载，那么 `TEMPLATE.json` 只应该补 claw-native 的路由、参数化和校验；对普通 Codex 使用者，真正的可用性主要仍来自 fallback `md`，而不是 wrapper 本身。对纯教程或工作流型 skill，若 wrapper 不能带来实际路由收益，就不要为了非 claw 专属插件额外引入模板层，因为那通常只会增加维护和转发复杂度。
- Review converted skills with the same boundary: if `CLAW-KNOWLEDGE.md` is duplicating `SKILL.md`, fallback, or template-owned data, treat it as removable legacy surface rather than required structure.
- 生成出来的 template 仍然落在对应 skill package 的 `TEMPLATE.json` 中；完成后应使用 `claw template validate --template <template-id>` 做真实校验。

## 标准入口路由

生成出来的 claw entry skill 在进入 template 之前，应先把请求归类为三种稳定形态之一：

- Direct single-target request: 直接用 `claw plan create --template <template-id>` 进入模板。
- Active parent-plan task: 当执行已经到达该任务时，用 `claw subplan create --parent <parent-task-name> --task-id <id> --template <template-id>` 创建子计划。
- Batch or mixed request: 先创建正常的 root claw plan，在 task description 里写清 skill intent，然后在对应 task 执行时再实例化 template subplan。

这条分类规则的核心是把单目标流程保持为最短路径，把 execution-time subplan 保留给父计划任务，把 batch/mixed 统一留在 root plan orchestration 层。

## 相关锚点

- `shared/skills/create-claw-skill/SKILL.md`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/opencode-adapter/skills/using-claw-kit/SKILL.md`
- `packages/core/src/templates/plans/default.ts`
