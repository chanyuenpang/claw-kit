---
name: bootstrap
description: Compatibility skill for older prompts that ask for claw-kit bootstrap; prefer using-claw-kit as the single main-agent workflow entry.
---

# claw-kit bootstrap

Prefer `using-claw-kit` for new work. It is the main-agent workflow contract and already includes startup, plan, search, truth, ADR, and hook-aware rules.

Use this compatibility skill only when an older prompt explicitly asks for `bootstrap`.

## Minimal bootstrap

1. If recovered harness state is absent, run `claw context` from the current working directory first.
2. Report `.claw` project state:
   - project root
   - whether `.claw/` was initialized or corrected in this bootstrap pass
   - active task, if present
   - active plan and status, if present
3. Continue by following `using-claw-kit`.

Do not duplicate workflow rules here; keep the main workflow in `using-claw-kit`.
