# GitNexus 定位与 README 发布流程清理

## 状态

这是 `claw-kit` 在 `2026-06-22` 这轮文档定位调整中沉淀下来的稳定事实。

## 核心事实

- 这轮 docs-only round 的作用范围固定在 `README.md`、`packages/cli/README.md` 和 `docs/project-json-reference.md`，不是代码行为变更。
- 最终 public positioning 现在围绕四个显式优势组织：
  - `plan before execute` 让复杂或长时间运行的任务推进得更稳
  - `claw-kit` 可以与其他 harness 或外部 skills 协同工作
  - truth 和 ADR 保持为可复用、可检索的持久项目知识
  - canonical 配置加 personal 配置支持团队协作
- 对外表述里，`claw-kit` 负责项目级 workflow、planning、knowledge capture 和 closeout；`GitNexus` 只保留为深度代码调查与关系追踪的可选补充能力，应该用弱关联来描述，而不是把它写成主产品叙事的一部分。
- 这套弱关联已经一致落到 public-facing 文案里：`README.md`、`packages/cli/README.md` 和 `docs/project-json-reference.md` 都应保持同一叙事，不再把 `GitNexus` 写成主路径。
- “可与其他 harness 或 skills 协同工作” 必须继续作为独立产品优势存在，不要折叠进 `GitNexus` 段落。
- “plan 结构更适合长时间运行任务” 也是独立的 workflow 价值点，应单独表达，不能并入 `GitNexus` 说明。
- root `README.md` 不应承载逐步发布流程；这类 release 细节应放在专门文档里，而不是放进首页 README 的主叙事，公开版首页应把维护者导向专门 release docs。
- truth、ADR、canonical 配置和 personal 配置的组合，已经成为对外协作叙事的一部分，而不是仅供内部实现参考的细节。
- `docs/project-json-reference.md` 负责承接仓库级 `project.json` 说明，保持和 root README 的职责分层。
- 本轮可复用的实施锚点是 `docs/superpowers/specs/2026-06-22-gitnexus-positioning-design.md` 与 `docs/superpowers/plans/2026-06-22-gitnexus-positioning-and-readme-cleanup.md`。

## 影响

- 后续更新公开文档时，应继续把产品定位、workflow 优势、GitNexus 补充能力和发布说明拆开写，避免把不同职责揉成一段。
- 如果以后再做 README 收口，优先检查 root README 是否仍然保持“入口和定位”边界，而不是回到逐步发布说明。

## 证据锚点

- `README.md`
- `packages/cli/README.md`
- `docs/project-json-reference.md`
- `docs/superpowers/specs/2026-06-22-gitnexus-positioning-design.md`
- `docs/superpowers/plans/2026-06-22-gitnexus-positioning-and-readme-cleanup.md`
