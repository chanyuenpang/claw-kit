# 可恢复文档与元数据回放

## 状态

这是 `claw-kit` 在 GitHub-docs round 中沉淀下来的稳定事实。

## 核心事实

- 这轮文档与元数据改动之所以能高置信恢复，是因为本地 Codex session rollout JSONL 保留了完整的 `apply_patch` 输入，足以还原重写后的 `README.md`、新建的 `docs/project-json-reference.md`、各 package README 重写、面向 adapter 的精简配置参考、docs implementation plan，以及 package metadata 更新。
- 恢复这类被清理掉的未提交文档时，正确顺序是先抽取证据，再恢复文件，最后做内容验证；如果 rollout 已经保留了精确 patch 文本，就不要靠记忆去猜大段删除内容。
- 这次 public-doc split 的职责边界是分层的：
  - root `README.md` 负责产品定位和工作流入口
  - `docs/project-json-reference.md` 负责仓库级 `project.json` 的 canonical 说明
  - package README 负责各 package 的职责说明
  - package metadata 负责 GitHub / npm 搜索可见性
- replay recovered patch 时，GitHub-facing 版本应该保留 repo-relative markdown links，而不是改成本机绝对路径，这样恢复后的文档才能直接在 `github.com` 上继续可用。
- `npm pkg get` 是验证恢复后 metadata 是否符合预期公开面的实用手段，尤其适合核对 `@veewo/claw` 和 `@veewo/claw-core`。

## 影响

- 当本地未提交文档被 `git restore --worktree --staged .` 加 `git clean -fd` 清掉后，Git 本身通常不是实际恢复源；更可靠的恢复源是 session rollout JSONL 加上已归档的 claw task plan。
- 如果已有 rollout 保留了 exact patch text，优先 replay patch，而不是重新手写大段 docs。
- 文档可见性、包角色说明和 npm/GitHub 搜索可见性应该分别落在对应层级，不要混写到单一 README 里。

## 证据锚点

- `C:\Users\chany\.codex\sessions\2026\06\22\rollout-2026-06-22T11-25-59-019eed5c-fb82-71e2-9962-ab5fca9314f7.jsonl`
- `.claw/archive/tasks/完善-GitHub-展示信息与-project.json-配置说明/plan.json`
