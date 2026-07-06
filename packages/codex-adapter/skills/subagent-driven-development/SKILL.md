---
name: subagent-driven-development
description: Use when executing implementation plans with independent tasks in the current session
---

# subagent-driven-development

This claw skill recompiles the installed superpowers `subagent-driven-development` workflow into a template-backed controller path for the Codex plugin.

## No-.claw Fallback

If the current workspace does not contain a `.claw` directory, read `SUPERPOWERS-FALLBACK.md` directly and follow the original skill instructions from that fallback document and any copied helper files in this package.

## Entry Routing

- Direct single-target request: use `claw plan create --template superpowers-subagent-driven-development --title "subagent-driven-development"`.
- Active parent-plan task: use `claw subplan create --parent <parent-task-name> --task-id <id> --template superpowers-subagent-driven-development` when execution reaches a task that explicitly asks to use this skill.
- Batch or mixed request: create a normal root claw plan first, describe the intended use of this skill in the relevant task, and instantiate this template only when execution reaches that task.

## Runtime Contract

- Use this when an implementation plan already exists, tasks are mostly independent, and execution should happen in the current session instead of handing off to a separate execution session.
- Preserve the source's controller role: prepare the full task context, dispatch a fresh implementer subagent per task, run spec review before code-quality review, and keep moving without unnecessary human check-ins.
- The converted workflow must keep the source's strongest guardrails visible: no parallel implementation subagents, no skipping spec or quality review, no moving to the next task while review issues remain open, and no code-quality review before spec compliance is green.

## Local References

- Compiled knowledge: [CLAW-KNOWLEDGE.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/subagent-driven-development/CLAW-KNOWLEDGE.md)
- Full source fallback: [SUPERPOWERS-FALLBACK.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/subagent-driven-development/SUPERPOWERS-FALLBACK.md)
- Coverage map: [CONTENT-COVERAGE.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/subagent-driven-development/CONTENT-COVERAGE.md)
- Implementer prompt: [implementer-prompt.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/subagent-driven-development/implementer-prompt.md)
- Spec reviewer prompt: [spec-reviewer-prompt.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/subagent-driven-development/spec-reviewer-prompt.md)
- Code quality reviewer prompt: [code-quality-reviewer-prompt.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/subagent-driven-development/code-quality-reviewer-prompt.md)
- Agent descriptor: [agents/openai.yaml](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/subagent-driven-development/agents/openai.yaml)

## Notes

- This conversion is only successful if the visible template expresses the real task loop and review ordering, not just a generic "use subagents" wrapper.
- Model selection, implementer status handling, and per-task review loops are workflow behavior, not optional commentary.
