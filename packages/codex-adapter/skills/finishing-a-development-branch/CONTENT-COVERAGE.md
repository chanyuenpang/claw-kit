# finishing-a-development-branch content coverage

## Source to converted-home mapping

- Trigger and completion-only contract:
  `SKILL.md` and the template `goal`/`requirements` preserve that this skill starts after implementation is complete.
- Test verification gate:
  Template task 1 preserves the hard "tests must pass before options are shown" rule.
  `CLAW-KNOWLEDGE.md` preserves the stop condition and merged-result re-verification rule.
- Environment detection and menu shape:
  Template task 2 preserves the normal-repo/named-branch-worktree/detached-HEAD distinction.
  `CLAW-KNOWLEDGE.md` keeps the effect of that distinction on menu shape and cleanup.
- Exact option families:
  Template task 3 preserves the source choice set by using explicit `merge-locally`, `push-and-pr`, `keep-as-is`, and `discard` branches.
- Safe execution and cleanup ownership:
  Template task 4 preserves typed discard confirmation, cleanup only for options 1 and 4, and provenance-based worktree removal.
  `CLAW-KNOWLEDGE.md` keeps the red flags and ownership rules.
- Long-form command examples and exact wording:
  `SUPERPOWERS-FALLBACK.md` remains the authoritative home for the original command blocks and menu text.

## Quality judgment for this subplan

- The visible template now exposes the source skill's real gates and option branches instead of flattening them into a generic "close out the branch" wrapper.
- The most failure-prone source rules, failing-test stop, exact menu shape, discard confirmation, and provenance-based cleanup, all have explicit converted homes.
- Residual risk:
  The exact shell command snippets remain primarily in fallback and knowledge rather than inside the template body, which is acceptable because the template now exposes when those commands are required.

## Intentional omissions

- No workflow-critical source behavior was intentionally omitted.
- The exact command block formatting remains in `SUPERPOWERS-FALLBACK.md` because the template should express control flow rather than duplicate every shell snippet verbatim.
