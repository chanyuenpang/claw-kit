---
name: brainstorming
description: You MUST use this before any creative work - creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements and design before implementation.
---

# brainstorming

This claw skill recompiles the installed superpowers `brainstorming` workflow into a template-backed design-first process for the Codex plugin.

## No-.claw Fallback

If the current workspace does not contain a `.claw` directory, follow [SUPERPOWERS-FALLBACK.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/brainstorming/SUPERPOWERS-FALLBACK.md) directly together with the copied helper files in this package.

## Entry Routing

- Direct single-target request: use `claw plan create --template superpowers-brainstorming --title "brainstorming"`.
- Active parent-plan task: use `claw subplan create --parent <parent-task-name> --task-id <id> --template superpowers-brainstorming` when execution reaches a task that explicitly asks to use this skill.
- Batch or mixed request: create a normal root claw plan first, describe the brainstorming requirement in the relevant task, and instantiate this template only when execution reaches that task.

## Runtime Contract

- This skill is a hard gate before creative implementation work.
- Do not start implementation, invoke implementation skills, or scaffold code before the design has been presented and approved.
- The workflow must preserve the original one-question-at-a-time behavior, the optional visual-companion branch, the design approval gate, the written-spec review gate, and the handoff into `writing-plans`.

## Local References

- Compiled knowledge: [CLAW-KNOWLEDGE.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/brainstorming/CLAW-KNOWLEDGE.md)
- Full source fallback: [SUPERPOWERS-FALLBACK.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/brainstorming/SUPERPOWERS-FALLBACK.md)
- Coverage map: [CONTENT-COVERAGE.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/brainstorming/CONTENT-COVERAGE.md)
- Visual companion guide: [visual-companion.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/brainstorming/visual-companion.md)
- Spec review helper: [spec-document-reviewer-prompt.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/brainstorming/spec-document-reviewer-prompt.md)

## Helper Assets

- Browser companion assets remain in [scripts](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/brainstorming/scripts) and [agents/openai.yaml](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/brainstorming/agents/openai.yaml).
- Those assets are part of the converted skill package, not incidental copies.
