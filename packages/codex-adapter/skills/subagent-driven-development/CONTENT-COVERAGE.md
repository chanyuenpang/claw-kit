# subagent-driven-development content coverage

## Source to converted-home mapping

- Trigger and same-session controller contract:
  `SKILL.md` and template `goal`/`requirements` preserve that this skill executes an existing implementation plan in the current session when tasks are mostly independent.
- Plan extraction and continuous execution:
  Template task 2 preserves the source requirement to read the plan once, extract all tasks with full text and context, and keep moving without unnecessary human pauses.
- Per-task implementer loop:
  Template task 3 preserves the fresh implementer-per-task pattern and the need to answer questions before implementation proceeds.
- Implementer status handling:
  Template task 3 uses explicit branches for `done`, `done-with-concerns`, `needs-context`, and `blocked`.
  `CLAW-KNOWLEDGE.md` keeps the stronger remediation rules for each status.
- Two-stage review ordering:
  Template task 4 preserves spec review before code-quality review, plus fix-and-rerun loops.
- Final review and finish-branch handoff:
  Template task 5 preserves the final whole-implementation review and mandatory handoff to `finishing-a-development-branch`.
- Model selection and prompt assets:
  `CLAW-KNOWLEDGE.md` preserves model-selection rules.
  `SKILL.md` references the real prompt assets and agent descriptor kept in the package.
- Red-flag behavior:
  Template rules plus `CLAW-KNOWLEDGE.md` preserve the no-parallel-implementers rule, no skipping reviews, no manual pollution when a subagent fails, and no progression with open issues.

## Quality judgment for this subplan

- The visible template now exposes the true controller workflow of the source skill instead of flattening it into a generic "advance the workflow" wrapper.
- The highest-risk source behaviors, implementer status routing, spec-before-quality ordering, and re-review loops, all have explicit converted homes.
- Residual risk:
  The long example transcript remains primarily in fallback rather than inside template task text, which is acceptable because the template now owns the workflow structure that the example illustrates.

## Intentional omissions

- No workflow-critical source behavior was intentionally omitted.
- Exact example transcript wording remains in `SUPERPOWERS-FALLBACK.md` so the template can stay control-flow-oriented.
