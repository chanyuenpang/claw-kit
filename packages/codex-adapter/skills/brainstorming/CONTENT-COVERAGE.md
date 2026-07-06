# brainstorming content coverage

## Source to converted-home mapping

- Trigger and hard gate:
  `SKILL.md` now states that this skill must run before creative implementation work.
  Adjacent `TEMPLATE.json` task 2 and `rules` preserve the no-implementation-before-approval constraint.
  `SUPERPOWERS-FALLBACK.md` keeps the full original wording.
- Ordered workflow steps:
  Template task 1 covers context exploration and scope/decomposition choice.
  Template task 2 covers one-question-at-a-time discovery, optional visual companion offering, approaches, and design approval.
  Template task 3 covers spec writing, self-review, and user review.
  Template task 4 covers the final handoff to `writing-plans`.
  `CLAW-KNOWLEDGE.md` preserves the original 9-step order in compact form.
- Branch conditions:
  Template task 1 uses `single-scope` vs `decompose-first`.
  Template task 3 uses `approved` vs `revise-spec`.
  The visual-companion branch remains documented in `CLAW-KNOWLEDGE.md` and [visual-companion.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/brainstorming/visual-companion.md).
- Safety constraints and hard "do not" rules:
  Template `rules` encode the no-implementation gate, one-question-at-a-time rule, approach-count rule, and post-brainstorming `writing-plans` handoff.
  `SUPERPOWERS-FALLBACK.md` keeps the stronger narrative guardrails and rationale.
- Required helper files and relative links:
  [visual-companion.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/brainstorming/visual-companion.md)
  [spec-document-reviewer-prompt.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/brainstorming/spec-document-reviewer-prompt.md)
  [agents/openai.yaml](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/brainstorming/agents/openai.yaml)
  [scripts/frame-template.html](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/brainstorming/scripts/frame-template.html)
  [scripts/helper.js](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/brainstorming/scripts/helper.js)
  [scripts/server.cjs](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/brainstorming/scripts/server.cjs)
  [scripts/start-server.sh](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/brainstorming/scripts/start-server.sh)
  [scripts/stop-server.sh](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/brainstorming/scripts/stop-server.sh)
- Examples and long-form explanations:
  `SUPERPOWERS-FALLBACK.md` remains the home for the original explanatory prose and flow diagram.

## Quality judgment for this subplan

- This converted package is no longer just a thin shell plus fallback.
- The visible template now carries real control flow for decomposition, approval, spec revision, and handoff.
- Residual risk:
  The visual-companion branch is still documented rather than fully encoded as a separate template task, so this skill is improved but should still be reviewed before treating it as the final gold standard for all remaining skills.

## Intentional omissions

- No source content was intentionally dropped.
- Some long-form explanation remains in `SUPERPOWERS-FALLBACK.md` by design because it is instructional prose rather than compact workflow control.
