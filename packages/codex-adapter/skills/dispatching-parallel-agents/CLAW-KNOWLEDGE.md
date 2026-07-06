# dispatching-parallel-agents claw knowledge

## Source contract

- Source skill: `C:\Users\chany\.codex\plugins\cache\openai-curated\superpowers\d6169bef\skills\dispatching-parallel-agents`
- Trigger: use when there are 2+ independent tasks or failures that do not share state or a likely common root cause.
- Core principle: one agent per independent domain, dispatched concurrently when safe.

## Canonical workflow

1. Check whether there are multiple failures or tasks.
2. Decide whether they are truly independent.
3. Decide whether they can run in parallel without shared-state interference.
4. Group work by independent domain.
5. Craft one focused, self-contained prompt per domain.
6. Dispatch agents in parallel when safe, otherwise sequentially.
7. Review the returned summaries.
8. Check for conflicts and integrate the results.
9. Run verification after integration.

## Branches that matter

- Related vs independent:
  If failures are related, investigate together instead of splitting them.
- Parallel vs sequential:
  If the work is independent but still shares state or resources, use sequential agents instead of simultaneous dispatch.
- Investigation vs implementation scope:
  Prompts must be specific about whether the agent should only investigate, fix code, or return a root-cause summary.

## Prompt quality requirements

- One clear problem domain.
- Self-contained context.
- Clear constraints.
- Explicit expected output.

## Guardrails and anti-patterns

- Do not use one broad “fix everything” prompt.
- Do not dispatch agents when the real issue may be a shared root cause.
- Do not skip integration review after the agents return.
- Do not confuse a worked example from the source skill with the general contract.

## Helper inventory

- Agent descriptor: [agents/openai.yaml](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/dispatching-parallel-agents/agents/openai.yaml)
- Full original wording and examples: [SUPERPOWERS-FALLBACK.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/dispatching-parallel-agents/SUPERPOWERS-FALLBACK.md)

## Why this file exists

- The template stays compact and control-flow-oriented.
- This file preserves the reusable decision logic, prompt-shape requirements, and guardrails from the original skill.
