# executing-plans content coverage

## Source to converted-home mapping

- Trigger and separate-session contract:
  `SKILL.md` and the template `goal`/`requirements` preserve that this skill is only for executing an existing written plan with review checkpoints.
- Subagent preference:
  Template task 1 makes the `continue-here` vs `switch-to-subagent-driven-development` branch explicit.
  `CLAW-KNOWLEDGE.md` preserves the source rule that the subagent-driven path is preferred when available.
- Critical review before implementation:
  Template task 2 preserves the review gate and the `concerns-found` branch.
  `CLAW-KNOWLEDGE.md` keeps the pre-execution rationale and stop conditions.
- Task-by-task execution:
  Template task 3 captures the source loop of marking work in progress, following each step exactly, running verification, and marking completion.
- Mandatory finish-branch handoff:
  Template task 4 preserves the required announcement and handoff to `finishing-a-development-branch`.
  `CLAW-KNOWLEDGE.md` keeps the required integration list.
- Stop-and-ask behavior:
  Template rules plus `CLAW-KNOWLEDGE.md` preserve the blocker list and the instruction to stop instead of guessing.
- Long-form wording and exact source prose:
  `SUPERPOWERS-FALLBACK.md` remains the authoritative home for the original wording and explanatory narrative.

## Quality judgment for this subplan

- The visible template now exposes the source skill's real control flow instead of a generic three-step wrapper.
- The most important hidden branch from the source, "use subagent-driven-development instead when available", is now visible in the converted workflow.
- Residual risk:
  The source's `TodoWrite` wording is represented as an execution-checklist concept rather than a product-specific control, which is acceptable because the workflow intent is preserved without binding the template to one task-list primitive.

## Intentional omissions

- No workflow-critical source behavior was intentionally omitted.
- Product-specific `TodoWrite` naming was generalized into an execution checklist because the claw template needs to stay tool-agnostic while preserving the source behavior.
