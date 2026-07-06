# receiving-code-review content coverage

## Source to converted-home mapping

- Trigger and verification-first contract:
  `SKILL.md` and the template `goal`/`requirements` preserve that this skill runs before implementing review suggestions.
- Response sequence:
  Template task 1 preserves the `read -> understand` gate.
  Template task 2 preserves the `verify -> evaluate` decision point.
  Template task 3 preserves the `respond or escalate` behavior.
  Template task 4 preserves item-by-item implementation with testing.
- Unclear feedback stop rule:
  Template task 1 uses an explicit `needs-clarification` branch so unclear items stop implementation instead of allowing partial progress.
- Source-specific trust and skepticism rules:
  Template task 2 distinguishes `trusted-feedback` and `external-feedback` handling.
  `CLAW-KNOWLEDGE.md` preserves the stronger external-review skepticism checks and partner-conflict stop rule.
- Pushback and YAGNI:
  Template task 3 preserves the `acknowledge-and-implement`, `reasoned-pushback`, and `stop-for-partner-discussion` branches.
  `CLAW-KNOWLEDGE.md` keeps the YAGNI and architectural-conflict criteria.
- Anti-performative language and GitHub reply behavior:
  Template rules plus `CLAW-KNOWLEDGE.md` preserve the no-performative-agreement rule and thread-reply constraint.
- Long-form examples and exact wording:
  `SUPERPOWERS-FALLBACK.md` remains the authoritative home for concrete example responses and wording nuance.

## Quality judgment for this subplan

- The visible template now exposes the true decision flow of the source skill instead of flattening everything into a generic three-step review wrapper.
- The source's highest-risk failures, blind agreement, partial implementation, and unverified external feedback, all have explicit homes in the converted workflow.
- Residual risk:
  The example response phrasings remain mainly in fallback rather than in template task detail, which is acceptable because the template now owns the branching logic that decides when those phrasings matter.

## Intentional omissions

- No workflow-critical source behavior was intentionally omitted.
- Exact sample phrasing stays in `SUPERPOWERS-FALLBACK.md` to keep the template compact and decision-oriented.
