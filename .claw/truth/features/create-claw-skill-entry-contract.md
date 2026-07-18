# create-claw-skill entry contract

## 状态

Accepted working truth for the current template-backed skill conversion path.

## 当前入口合同

- `shared/skills/create-claw-skill/SKILL.md` 是把现有 skill 或用户想法转换成 claw-template-backed skill 的 canonical 共享入口；Codex 与 OpenCode adapter 中的同名目录是同步物化副本。
- 入口按当前 skill 能否完整拥有工作结果路由，而不是按 direct、parent、batch 或 mixed 等调用形态分类：
  - 完整拥有整个当前任务时，创建 root plan：`claw plan create --template create-claw-skill --title "<skill-name>"`。
  - 完整拥有更大计划中的一个独立阶段时，创建 subplan：`claw subplan create --parent <parent-task-name> --task-id <id> --template create-claw-skill`。
  - 只能在同一阶段内提供局部能力、无法独立产出阶段结果时，不创建 template plan；读取相邻 `FALLBACK.md`，在该阶段的 owning workflow 内使用。
- Batch 不是第四条入口。它是 broader plan 中重复出现的独立阶段；父计划拥有排序与共享约束，每个阶段各调用一次 `create-claw-skill` subplan。
- 无 `.claw` cwd 也不是 skill-level 路由。显式 `--template` 的 `claw plan create` 由 core 自动选择 session scope；skill 不暴露或要求手工 `--scope session`。普通 `claw plan create "<title>"` 仍保留初始化项目的行为。
- 创建 plan 或 subplan 后，后续只跟随返回的 `workflowGuidance`；template 拥有结构化执行流程。

## 转换产物

- `shared/skills/create-claw-skill/TEMPLATE.json` 当前是三任务流程：分析来源并确定形态、生成完整 package、按文件路径验证 template 并检查内容覆盖。
- task 1 使用 `guidance.onDone.default`，不再用 `simple`、`routing`、`idea-first` 等最终都进入同一 task 的伪 choices。通用 choice 语义由 `.claw/truth/features/template-guidance-routing.md` 拥有。
- 相邻 `FALLBACK.md` 保存 plan-independent 的直接转换行为，既用于 mixed stage 的局部能力消费，也用于 CLI/template 不可用时的 direct workflow。完成计划中的 “raw skill” 是这一职责的历史命名；当前 package 与 generator 使用 fallback 命名。
- generator 的标准最短入口是 `node <create-claw-skill-dir>/scripts/create-claw-skill-stub.mjs --skill-name <skill-name> --out <target-skill-package>`；`--template-id`、`--target-work`、`--fallback-doc` 只在默认值不适用时添加，`--scope` 不是合法选项。
- 源码开发态必须用 `claw template validate --file <target-skill-package>/TEMPLATE.json` 验证正在编辑的文件；只有 skill 已物化到受支持 registry 后，才用 `--template <id>` 做具名验证。
- 对已有 skill，转换必须保留原始或等价的直接行为、必要 companion files 与相对链接；`SKILL.md` 只保留 ownership routing 和必要的非 template 补充，template 拥有 tasks、guidance、rules、references 与 verification gates。

## 相关锚点

- `shared/skills/create-claw-skill/SKILL.md`
- `shared/skills/create-claw-skill/TEMPLATE.json`
- `shared/skills/create-claw-skill/FALLBACK.md`
- `shared/skills/create-claw-skill/scripts/create-claw-skill-stub.mjs`
- `docs/create-claw-skill-lessons.md`
- `docs/template-authoring-guide.md`
- `packages/core/src/plan.ts`
