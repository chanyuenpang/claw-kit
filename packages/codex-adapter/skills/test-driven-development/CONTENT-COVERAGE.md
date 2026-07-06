# test-driven-development content coverage

## Source to converted-home mapping

- Trigger and iron law:
  `SKILL.md` and template `goal`/`requirements` preserve that this skill is for test-first implementation and that production code cannot come first.
- Red-green-refactor cycle:
  Template task 1 preserves fit and the no-prewritten-code rule.
  Template task 2 preserves RED and verify RED.
  Template task 3 preserves GREEN and verify GREEN.
  Template task 4 preserves REFACTOR, repeat, and start-over branches.
- Restart conditions:
  Template task 1 uses an explicit `delete-and-restart` branch when production code already exists without a prior failing test.
  Template rules plus `CLAW-KNOWLEDGE.md` preserve the source's "delete it, don't reference it" instruction.
- Good tests and anti-patterns:
  `CLAW-KNOWLEDGE.md` preserves one-behavior, clear-name, real-code test guidance.
  `SKILL.md` references `testing-anti-patterns.md` as an adjacent runtime asset.
- Rationalizations and red flags:
  Template rules plus `CLAW-KNOWLEDGE.md` preserve the source's major rationalization traps and stop signals.
- Long-form examples and verification checklist:
  `SUPERPOWERS-FALLBACK.md` remains the authoritative home for the email bug example, checklist, and longer explanation.

## Quality judgment for this subplan

- The visible template now exposes the actual TDD control flow instead of flattening it into a generic implementation checklist.
- The source's highest-risk failure modes, skipping verify-red, writing code before the test, and pretending tests-after are equivalent, all have explicit converted homes.
- Residual risk:
  The full philosophical explanation and long rationalization table remain primarily in fallback rather than template detail, which is acceptable because the template now owns the behavioral checkpoints those sections defend.

## Intentional omissions

- No workflow-critical source behavior was intentionally omitted.
- Exact long-form examples and checklist formatting remain in `SUPERPOWERS-FALLBACK.md` so the template can stay cycle-oriented and concise.
