# using-git-worktrees claw knowledge

## Source contract

- Source skill: `C:\Users\chany\.codex\plugins\cache\openai-curated\superpowers\d6169bef\skills\using-git-worktrees`
- Trigger: use when work should happen in an isolated workspace before feature work or plan execution begins.
- Core principle: detect existing isolation first, then prefer native tools, then fall back to git. Never fight the harness.

## Canonical workflow

1. Step 0: detect whether you are already in an isolated workspace.
2. Apply the submodule guard before deciding a linked checkout is a real worktree.
3. If already isolated, do not create another worktree.
4. If not isolated and user preference allows it, prefer native worktree tools.
5. Only if no native tool exists, use git worktree fallback.
6. Choose the directory by the source priority rules.
7. Verify project-local worktree directories are ignored before creation.
8. Create the worktree or fall back in place if sandbox or permission issues block creation.
9. Run project setup.
10. Run baseline tests.
11. Stop and ask before proceeding when baseline tests fail.

## Branches that matter

- Already isolated vs normal checkout:
  Existing linked worktree means skip creation and continue with setup.
- Submodule vs real worktree:
  `GIT_DIR != GIT_COMMON` alone is not enough; submodules need the superproject guard.
- Native tool available vs not:
  Native tool must win over manual `git worktree add`.
- Worktree directory resolution:
  explicit instruction > existing project-local `.worktrees` or `worktrees` > existing global legacy path > default `.worktrees/`
- Project-local vs global location:
  project-local directories require ignore verification; global legacy path does not.
- Baseline passes vs fails:
  clean baseline means ready to work; failing baseline requires reporting and asking before proceeding.

## High-value guardrails

- Never create a worktree inside an already isolated workspace.
- Never skip Step 0 detection.
- Never jump straight to git fallback when native worktree tooling exists.
- Never create a project-local worktree without verifying the directory is ignored.
- Never proceed with failing baseline tests without asking.
- If worktree creation is blocked by sandbox or permissions, say so and work in place after setup and baseline checks.

## Key command anchors

- Isolation detection:
  `git rev-parse --git-dir`, `git rev-parse --git-common-dir`, `git branch --show-current`
- Submodule guard:
  `git rev-parse --show-superproject-working-tree`
- Directory discovery:
  `.worktrees`, `worktrees`, `~/.config/superpowers/worktrees/<project>`
- Ignore verification:
  `git check-ignore -q .worktrees` or `git check-ignore -q worktrees`

## Why this file exists

- The template stays compact while preserving the detection-first decision tree.
- This file keeps the harness-safety logic, directory-priority rules, and baseline gating explicit.
