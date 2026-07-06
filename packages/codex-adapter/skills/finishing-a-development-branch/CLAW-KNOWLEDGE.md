# finishing-a-development-branch claw knowledge

## Source contract

- Source skill: `C:\Users\chany\.codex\plugins\cache\openai-curated\superpowers\d6169bef\skills\finishing-a-development-branch`
- Trigger: use when implementation is complete, tests should already be passing, and the remaining question is how to integrate, preserve, or discard the completed work.
- Core principle: verify tests, detect environment, present the exact menu, execute the chosen option, then clean up only when ownership rules permit it.

## Canonical workflow

1. Announce that you are using the skill.
2. Verify the project's tests before presenting any completion options.
3. Stop immediately if tests fail; do not continue to merge or PR options.
4. Detect whether the workspace is a normal repo, a named-branch worktree, or a detached-HEAD worktree.
5. Determine the base branch when a merge option is possible.
6. Present the exact source menu: four options for normal repo or named-branch worktree, three options for detached HEAD.
7. Execute the chosen option safely.
8. Clean up only for merge or discard, and only when the worktree belongs to the superpowers-owned paths.
9. Preserve the workspace for PR and keep-as-is paths.

## Branches that matter

- Tests passing vs failing:
  Failing tests are a hard stop. No merge or PR path is allowed until they are fixed.
- Normal repo or named-branch worktree vs detached HEAD:
  Detached HEAD removes the local merge option and changes cleanup expectations.
- User option selection:
  `merge locally`, `push and create PR`, `keep as-is`, and `discard` have different execution and cleanup rules.
- Cleanup ownership:
  Only worktrees under `.worktrees/`, `worktrees/`, or `~/.config/superpowers/worktrees/` are owned by the workflow and eligible for removal.

## Hard safety rules

- Do not proceed with failing tests.
- Do not merge without re-verifying tests on the merged result.
- Do not delete work without typed `discard` confirmation.
- Do not force-push unless the user explicitly asks.
- Do not remove a worktree before merge success is confirmed.
- Do not run `git worktree remove` from inside the worktree being removed.
- Do not clean up host-owned worktrees.

## Execution details worth preserving

- The menu must stay concise and structured: exactly four options for normal repo or named-branch worktree, exactly three for detached HEAD.
- Option 2 and Option 3 always preserve the worktree.
- Options 1 and 4 are the only cleanup-eligible paths.
- Worktree removal happens from the main repo root, followed by `git worktree prune`.

## Why this file exists

- The template stays compact while still surfacing the real workflow branches.
- This file preserves the provenance rules, exact option families, and destructive-action guardrails from the source skill.
