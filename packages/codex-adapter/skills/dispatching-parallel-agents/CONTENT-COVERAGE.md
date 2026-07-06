# dispatching-parallel-agents content coverage

## Source to converted-home mapping

- Trigger and core principle:
  `SKILL.md` and the template `goal`/`requirements` preserve that this skill is only for 2+ independent tasks or failures.
- Ordered workflow:
  Template task 1 covers independence and dispatch-mode decisions.
  Template task 2 covers prompt design and dispatch.
  Template task 3 covers review, integration, and verification.
  `CLAW-KNOWLEDGE.md` preserves the longer canonical sequence and the distinction between related vs independent domains.
- Branch conditions:
  Template task 1 uses `parallel`, `sequential`, and `investigate-together` so the branching behavior is visible in the template rather than buried in prose.
- Prompt design rules:
  `CLAW-KNOWLEDGE.md` preserves the source requirements for focused, self-contained, output-specific prompts.
  Template task 2 operationalizes that requirement.
- Guardrails and anti-patterns:
  Template `rules` preserve the “do not fan out related work” and “do not use broad prompts” constraints.
  `SUPERPOWERS-FALLBACK.md` keeps the original worked examples and narrative rationale.
- Worked example and long-form explanation:
  `SUPERPOWERS-FALLBACK.md` remains the home for the original session example and surrounding prose.
- Helper files:
  [agents/openai.yaml](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/dispatching-parallel-agents/agents/openai.yaml) remains packaged with the skill.

## Quality judgment for this subplan

- This converted package no longer treats concrete example failure names as the primary workflow.
- The visible template now expresses the real decision points of the source skill.
- Residual risk:
  The source skill's worked example remains fallback-only rather than being promoted into a reusable reference table; that is acceptable for now because it is illustrative rather than workflow-critical.

## Intentional omissions

- No workflow-critical source behavior was intentionally omitted.
- The specific example failure names from the original session were not promoted into the visible template because they are example data, not stable control-flow rules.
