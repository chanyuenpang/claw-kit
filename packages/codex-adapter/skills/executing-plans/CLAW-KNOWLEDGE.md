# executing-plans claw knowledge

## Source contract

- Source skill: `C:\Users\chany\.codex\plugins\cache\openai-curated\superpowers\d6169bef\skills\executing-plans`
- Trigger: use when a written implementation plan already exists and should be executed in a separate session with review checkpoints.
- Core principle: review first, execute exactly, stop when blocked, and finish through the required completion workflow instead of free-form closeout.

## Canonical workflow

1. Announce that you are using the skill.
2. Check whether subagents are available and would materially improve execution quality.
3. If subagents are available, prefer `subagent-driven-development` instead.
4. Load the written plan and review it critically before changing code.
5. Raise concerns with the human partner before starting if the plan has gaps or risks.
6. If the plan is sound, create the execution checklist and begin task-by-task work.
7. For each task, mark it in progress, follow the prescribed steps exactly, run the specified verification, and mark it complete.
8. After all tasks are done and verified, announce the handoff to `finishing-a-development-branch`.
9. Use that closeout skill to verify tests, present completion options, and execute the chosen finish path.

## Branches that matter

- Subagents available vs not:
  The source explicitly says execution quality is higher on platforms with subagent support and to use `subagent-driven-development` instead when that option exists.
- Concerns found vs ready to execute:
  If review surfaces a critical gap, unclear instruction, or risky assumption, stop before implementation and raise it with the human partner.
- Continue executing vs stop on blocker:
  During execution, do not push through missing dependencies, repeated verification failures, or unclear instructions.
- Revisit review:
  If the partner updates the plan or the fundamental approach changes, return to the review step instead of improvising mid-flight.

## Hard stop conditions

- Missing dependency or blocked environment.
- Test failure or verification failure that repeats without a clear path.
- Instruction is unclear or cannot be interpreted safely.
- Plan has a critical gap that prevents responsible execution.

## Required completion and integration skills

- `using-git-worktrees`: ensure isolated workspace before implementation.
- `writing-plans`: upstream skill that should have produced the written plan being executed.
- `finishing-a-development-branch`: mandatory completion workflow after execution and verification.

## Guardrails

- Review the plan critically before implementing anything.
- Follow the written plan exactly; this is not a brainstorming or redesign skill.
- Do not skip the specified verifications.
- Stop and ask for clarification instead of guessing through blockers.
- Never start implementation on `main` or `master` without explicit user consent.

## Why this file exists

- The template stays compact and flow-oriented.
- This file preserves the source's stop conditions, routing nuance, and required downstream skill handoffs.
