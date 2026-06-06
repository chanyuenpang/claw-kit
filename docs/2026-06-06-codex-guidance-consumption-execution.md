# Codex workflowGuidance consumption

## Summary

This pass updated the Codex adapter so its startup and workflow skills explicitly consume `workflowGuidance` returned by `claw` plan commands.

## Changes

- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
  - now treats `workflowGuidance` as the primary routing contract when plan command output is available
- `packages/codex-adapter/skills/bootstrap/SKILL.md`
  - now explains how to read `workflowGuidance` during session entry and follow delegated subagent flow
- `packages/codex-adapter/skills/master-workflow/SKILL.md`
  - now routes by `delegateSubagents`, `askUser`, and lifecycle-specific `workflowGuidance`
- `packages/codex-adapter/skills/planning/SKILL.md`
  - now requires `plan write -> read workflowGuidance -> dispatch plan-review -> wait -> revise -> advance`
- `packages/codex-adapter/skills/plan-workflow/SKILL.md`
  - now makes `workflowGuidance` the plan command follow-up contract
- `packages/codex-adapter/skills/truth-workflow/SKILL.md`
  - now distinguishes truth deposition timing from ADR timing
- `packages/codex-adapter/skills/truth-writer/SKILL.md`
  - now ties truth deposition timing to `workflowGuidance.delegateSubagents`
- `packages/codex-adapter/skills/adr-writer/SKILL.md`
  - now ties ADR timing to completed-plan guidance
- `packages/codex-adapter/references/workflow-guidance-consumption.md`
  - new adapter reference for mechanically consuming `workflowGuidance`
- `packages/codex-adapter/.codex-plugin/plugin.json`
  - updated descriptions and default prompts to mention workflowGuidance-driven routing

## Verification

- `npm run check -w @claw-kit/codex-adapter`
- cachebuster bump for Codex plugin reload
