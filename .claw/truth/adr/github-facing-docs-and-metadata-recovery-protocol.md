# ADR: GitHub-facing docs and metadata recovery protocol

## Status

Accepted

## Context

这次完成计划在 `git restore --worktree --staged .` 之后又经历了 `git clean -fd`，但本地 session rollout、归档计划和已沉淀 truth 仍然保留了足够证据，可以把刚才回退掉的 GitHub-facing 文档与 package metadata 精确恢复出来。为了避免以后把这类恢复当成“凭记忆重写”，需要把证据顺序和公开文档职责固定下来。

同时，这一轮恢复出的内容本身也确认了一个长期分工：根 `README.md` 负责产品定位与入口，`docs/project-json-reference.md` 负责 canonical `project.json` 说明，包级 `README.md` 负责各包职责，package metadata 负责 GitHub 与 npm 的可见性。

## Decision

- 恢复被 `restore` / `clean` 清掉的 GitHub-facing 文档时，先抽取本地 session rollout JSONL 和完成计划里的可验证证据，再 replay 精确 patch，最后才做必要的最小重建。
- 公开文档的职责保持分层：
  - 根 `README.md` 讲产品定位、安装入口和整体工作流
  - `docs/project-json-reference.md` 讲 canonical `.claw/project.json`
  - `packages/cli/README.md` 和 `packages/core/README.md` 讲各包职责
  - `package.json` 元数据只承担 GitHub/npm 可见性与包身份
- 公开 markdown 链接必须保持 repo-relative，不得改成本机绝对路径。
- 需要核对包身份或公开面是否恢复正确时，优先用 `npm pkg get` 和内容检查，而不是重新推断意图。

## Consequences

- 文档误删后的恢复路径变得可重复，减少“看起来像回来了但实际已经漂移”的风险。
- GitHub-facing 文档不会混成同一层职责，后续更新更容易定位该改哪里。
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
- `.claw/truth/features/recovered-docs-and-metadata-round.md`
- `.claw/tasks/抢救并重建刚才回退的-GitHub-文案与-project.json-说明/plan.json`

## Search Terms

- `git restore`
- `git clean -fd`
- `session rollout`
- `GitHub-facing docs`
- `project-json-reference`
- `package metadata`
