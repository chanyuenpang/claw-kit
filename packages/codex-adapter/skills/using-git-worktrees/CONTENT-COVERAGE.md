# using-git-worktrees content coverage

## Source to converted-home mapping

- Trigger and isolation-first contract:
  `SKILL.md` and template `goal`/`requirements` preserve that this skill is for isolated workspace setup before feature work.
- Step 0 detection and submodule guard:
  Template task 1 preserves the already-isolated vs normal-checkout split.
  Template task 2 preserves the submodule guard and native-tool preference.
- Native tool vs git fallback:
  Template task 2 explicitly routes native-tool and git-fallback paths instead of flattening them.
- Directory priority and ignore verification:
  Template task 3 preserves directory priority rules and project-local ignore verification.
  `CLAW-KNOWLEDGE.md` keeps the stronger rule detail.
- Setup and baseline gating:
  Template task 4 preserves setup, baseline test verification, and the stop-if-failing branch.
- Sandbox or permission fallback:
  Template task 3 preserves the work-in-place fallback when worktree creation is blocked.
- Long-form quick reference and examples:
  `SUPERPOWERS-FALLBACK.md` remains the authoritative home for the full command sequences and longer explanations.

## Quality judgment for this subplan

- The visible template now exposes the actual detection-first and native-tool-first workflow instead of a generic "use worktrees" wrapper.
- The source's main safety behaviors, submodule guard, native-tool preference, ignore verification, and failing-baseline stop, all have explicit converted homes.
- Residual risk:
  The full shell command blocks remain mainly in fallback and knowledge rather than in template detail, which is acceptable because the template now owns when each command family is supposed to apply.

## Intentional omissions

- No workflow-critical source behavior was intentionally omitted.
- Exact command-block formatting remains in `SUPERPOWERS-FALLBACK.md` so the template can stay decision-oriented rather than shell-heavy.
