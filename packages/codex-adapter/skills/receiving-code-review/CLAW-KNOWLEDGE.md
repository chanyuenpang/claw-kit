# receiving-code-review claw knowledge

## Source contract

- Source skill: `C:\Users\chany\.codex\plugins\cache\openai-curated\superpowers\d6169bef\skills\receiving-code-review`
- Trigger: use when receiving review feedback before implementing it, especially when the suggestion is unclear, questionable, external, or potentially misaligned with the codebase.
- Core principle: verify before implementing, ask before assuming, and prefer technical correctness over social comfort.

## Canonical workflow

1. Read the complete feedback without reacting performatively.
2. Restate the requirement in your own words or ask clarifying questions.
3. Verify the feedback against the codebase reality.
4. Evaluate whether the suggestion is technically sound for this codebase.
5. Decide whether to acknowledge technically, push back, ask for clarification, or stop for partner discussion.
6. Only then implement, one item at a time, with testing and regression checks.

## Branches that matter

- Clear vs unclear feedback:
  If any item is unclear, stop before implementation and ask about all unclear items first.
- Human partner vs external reviewer:
  Partner feedback is trusted once understood, but still not a license for performative agreement or unclear scope.
  External feedback must be checked for correctness, compatibility, architecture fit, and reviewer context.
- Sound vs unsound suggestion:
  Push back when the suggestion breaks behavior, lacks context, violates YAGNI, conflicts with prior architectural decisions, or is technically wrong for this stack.
- Easy to verify vs cannot easily verify:
  If verification is hard, state that directly and ask whether to investigate, ask upstream, or proceed differently.

## High-value guardrails

- Never lead with "You're absolutely right", "Great point", or similar performative agreement.
- Never say "let me implement that now" before verification.
- Never partially implement a multi-item review when some items are still unclear.
- External review comments are suggestions to evaluate, not orders to obey.
- Implement one review item at a time and test each change.

## Special handling the template must not hide

- YAGNI check:
  If a reviewer asks for a more "professional" implementation, check whether the feature is actually used before adding machinery.
- GitHub inline replies:
  Reply in the review thread, not as a top-level PR comment.
- Graceful correction:
  If your pushback was wrong, correct course factually and move on without long apology or defensiveness.

## Why this file exists

- The template stays compact while exposing the main decision points.
- This file preserves the source's pushback criteria, anti-performative language rules, and source-specific handling details.
