# requesting-code-review claw knowledge

## Source contract

- Source skill: `C:\Users\chany\.codex\plugins\cache\openai-curated\superpowers\d6169bef\skills\requesting-code-review`
- Trigger: use when tasks, major features, or pre-merge work should be reviewed to verify they meet requirements.
- Core principle: review early, review often, and scope the reviewer tightly around the actual work product.

## Canonical workflow

1. Decide whether review is mandatory or strongly valuable at the current checkpoint.
2. Establish the review diff boundary using base and head SHAs.
3. Dispatch a code reviewer subagent with precise context, requirements, and the correct prompt template.
4. Read the returned review by severity and assessment.
5. Fix critical issues immediately.
6. Fix important issues before proceeding.
7. Defer only minor issues when appropriate.
8. Push back with reasoning if the reviewer is wrong.

## Branches that matter

- Mandatory vs optional review:
  Mandatory after each task in subagent-driven development, after major features, and before merge to main.
  Optional but valuable when stuck, before refactors, and after complex bug fixes.
- Review context quality:
  The reviewer should get focused work-product context, not session-history sprawl.
- Feedback severity:
  Critical issues stop progress immediately.
  Important issues should be fixed before proceeding.
  Minor issues may be noted for later.
- Reviewer correct vs reviewer wrong:
  If the reviewer is wrong, push back with technical reasoning, code, or tests.

## Required assets and context

- Diff boundary:
  `BASE_SHA=$(git rev-parse HEAD~1)` or another appropriate base such as `origin/main`.
  `HEAD_SHA=$(git rev-parse HEAD)`.
- Reviewer prompt asset:
  `code-reviewer.md` with placeholders for description, plan or requirements, base SHA, and head SHA.

## High-value guardrails

- Never skip review because the work "seems simple".
- Never ignore critical issues.
- Never proceed past important issues that should block forward movement.
- Never argue with valid technical feedback.
- If the reviewer is wrong, push back with evidence instead of dismissiveness.

## Workflow integration

- Subagent-driven development:
  Review after each task so issues do not compound.
- Executing plans:
  Review after each task or at natural checkpoints.
- Ad-hoc development:
  Review before merge or when a fresh perspective is needed.

## Why this file exists

- The template stays compact while still exposing review timing, diff scoping, and severity-based action rules.
- This file preserves the source's reviewer-context contract and red-flag handling.
