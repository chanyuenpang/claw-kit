# Subagentized review and canonical truth deposition

## Summary

This pass changes the Codex adapter so completion deposition is modeled as delegated specialist workflow rather than main-agent inline chores.

## Changes

- `packages/codex-adapter/skills/truth-writer/SKILL.md`
  - now describes truth writing as a delegated deposition workflow
  - explicitly rejects default drift into generic docs writing
- `packages/codex-adapter/skills/adr-writer/SKILL.md`
  - now describes ADR writing as a delegated deposition workflow
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
  - now tells the main agent to dispatch deposition specialists
  - now states that canonical completion outputs belong in truth and ADRs, not generic docs by default
- `packages/codex-adapter/references/codex-delegated-deposition.md`
  - records the new delegation rule and canonical output targets

## Intent

The main Codex agent should keep its context for primary task execution and coordination.

The delegated specialists should handle:

- truth deposition
- ADR deposition
