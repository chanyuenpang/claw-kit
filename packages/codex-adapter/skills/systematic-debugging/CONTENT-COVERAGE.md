# systematic-debugging content coverage

## Source to converted-home mapping

- Trigger and iron law:
  `SKILL.md` and template `goal`/`requirements` preserve that this skill must run before proposing fixes and that root cause comes first.
- Four phases:
  Template task 1 preserves fit and phase commitment.
  Template task 2 preserves Phase 1 root-cause investigation.
  Template task 3 preserves Phase 2 pattern analysis and Phase 3 hypothesis testing.
  Template task 4 preserves Phase 4 implementation, verification, and the repeated-failure branch.
- Multi-component evidence gathering:
  Template task 2 plus `CLAW-KNOWLEDGE.md` preserve the instrumentation-before-fix rule.
- Root-cause tracing and supporting techniques:
  `SKILL.md` references the adjacent `root-cause-tracing.md`, `defense-in-depth.md`, and `condition-based-waiting.md` assets as active runtime references.
- 3+ failed fixes -> architecture question:
  Template task 4 uses an explicit `question-architecture` branch.
  `CLAW-KNOWLEDGE.md` preserves the rationale and stop rule.
- Red flags and anti-guessing rules:
  Template rules plus `CLAW-KNOWLEDGE.md` preserve the source's hard "stop and go back" conditions.
- Long-form examples, rationalizations, and impact framing:
  `SUPERPOWERS-FALLBACK.md` remains the authoritative home for the full narrative detail and example evidence.

## Quality judgment for this subplan

- The visible template now exposes the actual four-phase debugging method instead of flattening it into a generic debugging reminder.
- The source's highest-value constraints, no-fix-before-root-cause, no stacked fixes, and architecture questioning after repeated failed attempts, all have explicit converted homes.
- Residual risk:
  The full multi-layer shell example remains primarily in fallback and knowledge rather than inside template detail, which is acceptable because the template now controls when that evidence-gathering pattern is required.

## Intentional omissions

- No workflow-critical source behavior was intentionally omitted.
- Exact long-form examples and rationalization table remain in `SUPERPOWERS-FALLBACK.md` to keep the template phase-structured and concise.
