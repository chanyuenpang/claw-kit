# requesting-code-review content coverage

## Source to converted-home mapping

- Trigger timing:
  `SKILL.md` and template `goal`/`requirements` preserve that this skill is for completed tasks, major features, pre-merge review, and valuable checkpoints such as "stuck" or "pre-refactor" moments.
- Diff boundary setup:
  Template task 2 preserves the source requirement to capture base and head SHAs.
  `CLAW-KNOWLEDGE.md` keeps the canonical SHA examples and scoping rationale.
- Reviewer dispatch contract:
  Template task 3 preserves the requirement to send a focused reviewer with description, requirements, and SHA-scoped context.
  `code-reviewer.md` remains the prompt asset reference.
- Severity-based handling:
  Template task 4 preserves the `fix-critical`, `fix-important`, `note-minor`, and `push-back` response policy.
  `CLAW-KNOWLEDGE.md` keeps the red-flag rules.
- Workflow integration:
  `CLAW-KNOWLEDGE.md` preserves the different mandatory/optional timings for subagent-driven development, executing plans, and ad-hoc work.
- Long-form example:
  `SUPERPOWERS-FALLBACK.md` remains the authoritative home for the example review loop and narrative explanation.

## Quality judgment for this subplan

- The visible template now exposes the true reviewer-dispatch workflow instead of flattening the skill into a generic "request review" reminder.
- The source's highest-value operational details, review timing, SHA scoping, focused reviewer context, and severity-based follow-up, all have explicit homes in the converted package.
- Residual risk:
  The exact Task-tool phrasing remains primarily in fallback and the reviewer asset reference rather than in template prose, which is acceptable because the template now owns when and why that dispatch happens.

## Intentional omissions

- No workflow-critical source behavior was intentionally omitted.
- Exact example transcript wording remains in `SUPERPOWERS-FALLBACK.md` to keep the template compact and control-flow-focused.
