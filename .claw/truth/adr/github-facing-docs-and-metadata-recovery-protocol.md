# ADR: GitHub-facing docs and metadata recovery protocol

## Status

Accepted

## Context

这次完成计划在 `git restore --worktree --staged .` 之后又经历了 `git clean -fd`，但本地 session rollout、归档计划和已沉淀 truth 仍然保留了足够证据，可以把刚才回退掉的 GitHub-facing 文档与 package metadata 精确恢复出来。为了避免以后把这类恢复当成“凭记忆重写”，需要把证据顺序和公开文档职责固定下来。

同时，这一轮恢复出的内容本身也确认了一个长期分工：根 `README.md` 负责产品定位与入口，`docs/project-json-reference.md` 负责 canonical `project.json` 说明，包级 `README.md` 负责各包职责，package metadata 负责 GitHub 与 npm 的可见性。

这次新的公开文案回合又把两条边界补得更清楚了：`claw-kit` 的对外叙事要把 GitNexus 写成可选补强而不是必需依赖，并且根 `README.md` 不再承载逐步 publish/release 流程，只保留指向专门 maintainer 文档的入口。

这轮还确认了一个更细的长期边界：adapter `references/` 里可以承接备用配置知识，帮助用户快速查 `.claw/project.json` 与 `.claw/project-override.json` 的用法，但这类说明必须明确自己不是 harness 合同、不是启动流程的一部分，也不能改动任何 `SKILL.md` 或插件行为。

## Decision

- 恢复被 `restore` / `clean` 清掉的 GitHub-facing 文档时，先抽取本地 session rollout JSONL 和完成计划里的可验证证据，再 replay 精确 patch，最后才做必要的最小重建。
- 公开文档的职责保持分层：
  - 根 `README.md` 讲产品定位、安装入口和整体工作流
  - `docs/project-json-reference.md` 讲 canonical `.claw/project.json`
  - `packages/cli/README.md` 和 `packages/core/README.md` 讲各包职责
  - `package.json` 元数据只承担 GitHub/npm 可见性与包身份
- 根 `README.md` 的产品定位需要把这四个稳定优势拆开写清楚，而不是混成一段 GitNexus 说明：
  - plan before execute
  - 可与其他 harness / skills 协同
  - truth / ADR 可复用且可检索
  - canonical + personal config 支持团队协作
- GitNexus 在公开文案里只能作为 optional integration / complementary capability 出现，不能写成使用 `claw-kit` 的前置依赖。
- 根 `README.md` 不再承载逐步 publish / release 操作流程，只保留通往专门 maintainer 文档的入口。
- adapter `references/` 可以保存备用配置说明，例如 `project-config-reference.md`，用来承接 `.claw/project.json` 和 `.claw/project-override.json` 的快捷查阅知识；但这类文档必须保持 `backup reference` 定位，不能变成 harness contract、startup flow 或 plugin 行为的一部分。
- 公开 markdown 链接必须保持 repo-relative，不得改成本机绝对路径。
- 需要核对包身份或公开面是否恢复正确时，优先用 `npm pkg get` 和内容检查，而不是重新推断意图。

## Consequences

- 文档误删后的恢复路径变得可重复，减少“看起来像回来了但实际已经漂移”的风险。
- GitHub-facing 文档不会混成同一层职责，后续更新更容易定位该改哪里。
- 公共定位会稳定区分 `claw-kit` 主体能力与 GitNexus 的可选补强角色，避免把依赖关系写反。
- 根 README 保持轻量，发布/收口步骤统一回流到维护文档，不再和产品定位混写。
- adapter 的备用配置说明形成了一个稳定的中转层：用户可以先在包内 references 找到简短配置说明，再回到 canonical `docs/project-json-reference.md` 查完整字段。
- 公开面链接保持可移植，GitHub 展示和本地浏览都会继续工作。
- 当这类回收发生时，truth/ADR/plan 三者之间的证据链会更容易复核。

## Related Code

- `README.md`
- `docs/project-json-reference.md`
- `packages/cli/README.md`
- `packages/core/README.md`
- `packages/cli/package.json`
- `packages/core/package.json`
- `packages/codex-adapter/package.json`
- `packages/openclaw-adapter/package.json`
- `packages/codex-adapter/references/project-config-reference.md`
- `packages/opencode-adapter/references/project-config-reference.md`
- `.claw/truth/features/recovered-docs-and-metadata-round.md`
- `.claw/tasks/抢救并重建刚才回退的-GitHub-文案与-project.json-说明/plan.json`

## Search Terms

- `git restore`
- `git clean -fd`
- `session rollout`
- `GitHub-facing docs`
- `project-json-reference`
- `package metadata`
- `project-config-reference`
- `backup config reference`
