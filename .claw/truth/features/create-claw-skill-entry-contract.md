# create-claw-skill entry contract

## 状态

Accepted working truth for the current template-backed skill conversion path.

<!-- state: current -->
## 当前入口合同

- `shared/skills/create-claw-skill/SKILL.md` 是把现有 skill 或用户想法转换成 claw-template-backed skill 的 canonical 共享入口；Codex 与 OpenCode adapter 中的同名目录是同步物化副本。
- 当用户需求会要求大幅改变本 skill 的 template workflow 时，不创建它的 plan 或 subplan；直接读取相邻 `FALLBACK.md`，按 plan-independent workflow 完成这次转换。
- 入口按当前 skill 能否完整拥有工作结果路由，而不是按 direct、parent、batch 或 mixed 等调用形态分类：
  - 先把 `<skill-dir>` 解析为当前已加载 `SKILL.md` 所在目录。
  - 完整拥有整个当前任务时，创建 root plan：`claw plan create --template-file "<skill-dir>/TEMPLATE.json" --title "<skill-name>"`。
  - 完整拥有更大计划中的一个独立阶段时，创建 subplan：`claw subplan create --parent <parent-task-name> --task-id <id> --template-file "<skill-dir>/TEMPLATE.json"`。
  - 只能在同一阶段内提供局部能力、无法独立产出阶段结果时，不创建 template plan；读取相邻 `FALLBACK.md`，在该阶段的 owning workflow 内使用。
- Batch 不是第四条入口。它是 broader plan 中重复出现的独立阶段；父计划拥有排序与共享约束，每个阶段各调用一次 `create-claw-skill` subplan。
- 无 `.claw` cwd 也不是 skill-level 路由。显式 `--template-file`（以及兼容的 `--template <id>`）的 `claw plan create` 由 core 自动选择 session scope；skill 不暴露或要求手工 `--scope session`。普通 `claw plan create "<title>"` 仍保留初始化项目的行为。
- 创建 plan 或 subplan 后，后续只跟随返回的 `workflowGuidance`；template 拥有结构化执行流程。

## 转换产物

- `shared/skills/create-claw-skill/TEMPLATE.json` 当前是四任务流程：先确认用户需求并据此适配生成的计划，再分析来源并确定形态、生成完整 package、按文件路径验证 template 并检查内容覆盖。
- 计划适配必须保留所有 sub-task id，因为 template guidance 依赖这些稳定 id；不适用的工作保留原 task，并在 task description 中标记为移出范围，而不是删除 task 或改 id。
- 分析来源的 task 使用 `guidance.onDone.default`，不再用 `simple`、`routing`、`idea-first` 等最终都进入同一 task 的伪 choices。通用 choice 语义由 `.claw/truth/features/template-guidance-routing.md` 拥有。
- `create-claw-skill` 的模板、fallback、generator stub 与 authoring docs 都要求：只有真实 downstream 分支才生成 `guidance.onDone.choices`；一旦生成 choices，就遵循 canonical route-aware contract，以 `completionChoices` 作为唯一合法值列表、只提供一条参数化的 `claw task done --id <id> --choice <choice>` 命令模板，并让 `nextsteps` 不重复枚举 ids。该 skill 不另建平行 choice 合同。
- `create-claw-skill` 还要求作者显式判断 lifecycle handoff：只有真实 discussion task 需要把 refinement delivery 与进入执行态绑定时才添加 `guidance.onPlanStart`；普通 executable template 默认从 `process.active` 开始并省略它。`claw plan start` 的全局可用性、推荐门与 transition 语义由 `.claw/truth/features/template-guidance-routing.md` 统一拥有，本文件只拥有该转换 skill 的 authoring 应用。
- 相邻 `FALLBACK.md` 保存 plan-independent 的直接转换行为，既用于 mixed stage 的局部能力消费，也用于 CLI/template 不可用时的 direct workflow。完成计划中的 “raw skill” 是这一职责的历史命名；当前 package 与 generator 使用 fallback 命名。
- 生成或升级后的 templated skill 必须是自包含分发单元：`TEMPLATE.json.references` 只能指向 skill package 内可解析的相邻资源。当前 `create-claw-skill` 把运行时 authoring 合同放在 `references/template-authoring.md`，并用 `CONTENT-COVERAGE.md` 映射 entry、template、fallback、references 与 generator；仓库级 `docs/template-authoring-guide.md` 和 `docs/create-claw-skill-lessons.md` 只保留维护者补充说明，不是安装包运行时依赖。跨适配器完整目录物化与发布门禁由 `.claw/truth/features/shared-planning-skill-source.md` 统一拥有。
- generator 的标准最短入口是 `node <create-claw-skill-dir>/scripts/create-claw-skill-stub.mjs --skill-name <skill-name> --out <target-skill-package>`；`--template-id`、`--target-work`、`--fallback-doc` 只在默认值不适用时添加，`--scope` 不是合法选项。
- `TEMPLATE.json` 顶层 `version` 是独立的 template-driver 合同字段；当前值为 `1.0.0`，不随 claw-kit 常规发版变化。`packages/core/src/plan-templates.ts` 是该 driver 版本的实现锚点。
- 旧版本、缺失版本或无关缓存中的旧版本模板不会向最终用户暴露兼容性诊断，也不会自动阻断正常工作流。实际需要维护时，由 `claw-kit:create-claw-skill` 在技能包内检查、更新并验证后静默继续。
- `claw template validate` 成功结果返回规范化的 template-driver `version`。stub generator 直接生成 `1.0.0`，不再从 package manifest 推导 claw-kit semver。
- 源码开发态必须用 `claw template validate --file <target-skill-package>/TEMPLATE.json` 验证正在编辑的文件；只有 skill 已物化到受支持 registry 后，才用 `--template <id>` 做具名验证。
- 对已有 skill，转换必须保留原始或等价的直接行为、必要 companion files 与相对链接；`SKILL.md` 只保留 ownership routing 和必要的非 template 补充，template 拥有 tasks、guidance、rules、references 与 verification gates。

<!-- state: history -->
## 演化历史

<!-- dated: 2026-07-20 -->
### `0.1.86` 完成证据

该 closeout 在其记录的 worktree 上验证了 CLI template tests `14/14`、core template tests `22/22`、stub generator tests `2/2`、仓库内八份模板 `8/8`、全部 template references 可解析、Codex bundle `17/17`、OpenCode bundle `11/11`、shared-skill synchronization 与 `git diff --check`。该结果只属于当时 revision；后续知识维护没有重跑这些测试。

<!-- dated: 2026-08-31 -->
### CLI-version compatibility gate was replaced

模板曾以当前 claw-kit package semver 作为兼容性门槛，并对旧、缺失或无效版本显示 `create-claw-skill` 升级诊断。该机制会让常规发版使既有模板表面失效；现已由独立的 `1.0.0` template-driver 合同和技能包内静默维护取代。保留这段历史用于理解旧模板行为和迁移原因。

<!-- dated: 2026-07-20 -->
### 引入需求驱动的计划适配

早期 template 是三任务流程。完成的 `Improve create-claw-skill plan adaptation routing` 工作在流程前增加了需求确认与计划适配 task，并确定两个互补边界：窄范围适配保留稳定 sub-task id，以 description 标记移出范围的工作；会大幅改变 template workflow 的用户需求则在创建 plan 或 subplan 前路由到 `FALLBACK.md`。

## 相关锚点

- `shared/skills/create-claw-skill/SKILL.md`
- `shared/skills/create-claw-skill/TEMPLATE.json`
- `shared/skills/create-claw-skill/FALLBACK.md`
- `shared/skills/create-claw-skill/CONTENT-COVERAGE.md`
- `shared/skills/create-claw-skill/references/template-authoring.md`
- `shared/skills/create-claw-skill/scripts/create-claw-skill-stub.mjs`
- `docs/create-claw-skill-lessons.md`
- `docs/template-authoring-guide.md`
- `packages/core/src/plan.ts`
- `packages/core/src/plan-templates.ts`
- `packages/core/src/templates/plans/default.ts`
- `packages/cli/src/cli.ts`
- `packages/core/test/core.test.ts`
- `packages/cli/test/cli.test.ts`
- `scripts/create-claw-skill-stub.test.mjs`
