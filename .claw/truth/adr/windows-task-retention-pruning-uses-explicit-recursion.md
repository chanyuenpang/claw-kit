# ADR: Windows task retention pruning uses explicit recursion

## Status

Accepted

## Context

`claw-kit` 的 task retention 会把完成任务归档到 `.claw/archive/tasks/`，并按 `maxTasksToKeep` 清理最旧的 archived task。

在 Windows closeout 中，包含非 ASCII 名称的 archived task directory 不能依赖 `fs.rmSync(..., { recursive: true })` 作为唯一删除路径；这个路径可能失败或提前终止，导致 release closeout 后仍留下应该被 pruning 的历史任务目录。

## Decision

- Task retention pruning 使用显式递归删除函数 `removeDirectoryTreeSync`。
- 删除目录时先递归遍历子项，文件和 symlink 使用 `fs.unlinkSync`，子目录完成后使用 `fs.rmdirSync`。
- `fs.rmSync(..., { recursive: true })` 不作为 Windows archive pruning 的核心删除机制。
- Regression coverage 必须包含非 ASCII archived task name，确保 `.claw/archive/tasks/` 中的中文路径可以被正确 pruning。

## Consequences

- Windows release closeout 不会因为非 ASCII archived task directory 而留下 stale task residue。
- `maxTasksToKeep` 的语义对 ASCII 与非 ASCII task names 保持一致。
- Task retention 的删除行为更显式，后续排查 archive residue 时可以直接查看递归 unlink/rmdir 路径。

## Related Code

- `packages/core/src/task-retention.ts`
- `packages/core/test/core.test.ts`
- `.claw/tasks/Publish-claw-kit-release-and-refresh-local-Codex-plugin/plan.json`

## Search Terms

- `task-retention`
- `maxTasksToKeep`
- `non-ASCII`
- `fs.rmSync`
- `unlinkSync`
- `rmdirSync`
- `archive/tasks`
