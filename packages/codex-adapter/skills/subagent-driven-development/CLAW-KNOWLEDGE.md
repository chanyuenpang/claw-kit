# subagent-driven-development claw knowledge

## Source contract

- Source skill: `C:\Users\chany\.codex\plugins\cache\openai-curated\superpowers\d6169bef\skills\subagent-driven-development`
- Trigger: use when executing an implementation plan with mostly independent tasks in the current session.
- Core principle: one fresh implementer subagent per task, then two-stage review after each task: spec compliance first, code quality second.

## Canonical workflow

1. Confirm that an implementation plan exists, tasks are mostly independent, and the work should stay in the current session.
2. Read the plan once, extract all tasks with full text and context, and prepare the execution checklist.
3. For each task, dispatch a fresh implementer subagent with full task text and scene-setting context.
4. Answer implementer questions before allowing work to proceed.
5. Handle implementer status:
   `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, or `BLOCKED`.
6. After implementation, run spec compliance review first.
7. If spec review finds issues, send the same implementer back to fix them and re-run spec review.
8. Only after spec review is green, run code quality review.
9. If code quality review finds issues, send the same implementer back to fix them and re-run quality review.
10. Mark the task complete only when both review stages approve.
11. After all tasks are complete, run a final review over the whole implementation and then hand off to `finishing-a-development-branch`.

## Branches that matter

- Fit check:
  If there is no plan or tasks are tightly coupled, use another workflow instead.
  If execution should happen in a separate parallel session, prefer `executing-plans`.
- Implementer asks questions vs proceeds:
  Questions must be answered clearly before implementation continues.
- Implementer status handling:
  `DONE` -> move to spec review.
  `DONE_WITH_CONCERNS` -> read concerns and address material ones before review.
  `NEEDS_CONTEXT` -> provide missing context and re-dispatch.
  `BLOCKED` -> change something: more context, stronger model, smaller task, or escalate because the plan is wrong.
- Review loops:
  Spec review must approve before code quality review starts.
  Either reviewer finding issues means fix -> re-review -> do not advance.

## Model selection rules

- Cheap model:
  Mechanical implementation tasks with isolated scope and complete spec.
- Standard model:
  Multi-file coordination, integration, or debugging tasks.
- Most capable model:
  Architecture, design judgment, and review tasks.

## High-value guardrails

- Do not check in with the human between tasks unless truly blocked or ambiguous.
- Do not dispatch multiple implementation subagents in parallel.
- Do not make the subagent read the plan file; provide full task text and context directly.
- Do not let implementer self-review replace spec or quality review.
- Do not accept "close enough" on spec compliance.
- Do not move to the next task while either review stage still has open issues.
- Do not start implementation on `main` or `master` without explicit user consent.

## Required assets and integrations

- Prompt assets:
  `implementer-prompt.md`, `spec-reviewer-prompt.md`, `code-quality-reviewer-prompt.md`
- Required sibling skills:
  `using-git-worktrees`, `writing-plans`, `requesting-code-review`, `finishing-a-development-branch`
- Subagents should use:
  `test-driven-development`

## Why this file exists

- The template stays compact while exposing the real controller flow and status-routing behavior.
- This file preserves the source's model selection, implementer-state handling, and review-loop constraints.
