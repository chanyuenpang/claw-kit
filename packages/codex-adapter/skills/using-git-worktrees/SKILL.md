---
name: using-git-worktrees
description: Use when starting feature work that needs isolation from current workspace or before executing implementation plans - ensures an isolated workspace exists via native tools or git worktree fallback
---

# using-git-worktrees

This claw skill recompiles the installed superpowers `using-git-worktrees` workflow into a template-backed isolation-setup path for the Codex plugin.

## No-.claw Fallback

If the current workspace does not contain a `.claw` directory, read `SUPERPOWERS-FALLBACK.md` directly and follow the original skill instructions from that fallback document and any copied helper files in this package.

## Entry Routing

- Direct single-target request: use `claw plan create --template superpowers-using-git-worktrees --title "using-git-worktrees"`.
- Active parent-plan task: use `claw subplan create --parent <parent-task-name> --task-id <id> --template superpowers-using-git-worktrees` when execution reaches a task that explicitly asks to use this skill.
- Batch or mixed request: create a normal root claw plan first, describe the intended use of this skill in the relevant task, and instantiate this template only when execution reaches that task.

## Runtime Contract

- Use this when feature work or plan execution should happen in an isolated workspace instead of the current checkout.
- Preserve the source ordering: detect existing isolation first, prefer native worktree tools, fall back to `git worktree` only when native tooling is unavailable, then run setup and clean-baseline verification.
- The converted workflow must keep the source's main safety rules visible: do not create a worktree inside an already isolated workspace, do not skip submodule guard checks, do not skip ignore verification for project-local directories, and do not proceed with a failing baseline without explicit permission.

## Local References

- Compiled knowledge: [CLAW-KNOWLEDGE.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/using-git-worktrees/CLAW-KNOWLEDGE.md)
- Full source fallback: [SUPERPOWERS-FALLBACK.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/using-git-worktrees/SUPERPOWERS-FALLBACK.md)
- Coverage map: [CONTENT-COVERAGE.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/using-git-worktrees/CONTENT-COVERAGE.md)

## Notes

- This conversion is only successful if the visible template preserves the detection-first workflow and native-tool preference instead of collapsing everything into "create a worktree".
- Directory-priority rules, ignore checks, and baseline-test gating are workflow behavior, not optional explanation.
