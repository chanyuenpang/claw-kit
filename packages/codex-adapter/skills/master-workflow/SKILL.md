---
name: master-workflow
description: Compatibility alias for older prompts that ask for the claw-kit master workflow; prefer using-claw-kit as the single main-agent workflow skill.
---

# claw-kit master workflow

Prefer `using-claw-kit` for new work. It is the single main-agent workflow skill and contains the end-to-end plan, search, truth, ADR, and hook-aware flow.

Use this skill only when an older prompt explicitly asks for `master-workflow`.

## Compatibility rule

Load and follow `using-claw-kit`.

Do not duplicate plan/truth/ADR workflow here. `truth-writer` and `adr-writer` remain subagent-only skills.
