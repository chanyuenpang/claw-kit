# Codex Hook Exploration Plan

## Why this phase exists

The next risk-reducing step is to verify whether plugin-level Codex hooks are usable enough to support optional automation.

We are not treating hooks as a prerequisite for `claw-kit` correctness. We are testing them as an enhancement layer only.

## Evidence used

- official Codex hooks doc: [https://developers.openai.com/codex/hooks](https://developers.openai.com/codex/hooks)
- local Codex plugin README mentions plugin-level hook surfaces
- local sample plugin `figma/hooks.json` confirms the same config shape

## Implemented hook lab

The Codex adapter now includes:

- [packages/codex-adapter/hooks/hooks.json](D:/Users/chany/Documents/claw-kit/packages/codex-adapter/hooks/hooks.json)
- [packages/codex-adapter/scripts/log-hook-event.mjs](D:/Users/chany/Documents/claw-kit/packages/codex-adapter/scripts/log-hook-event.mjs)
- [packages/codex-adapter/references/codex-hooks-strategy.md](D:/Users/chany/Documents/claw-kit/packages/codex-adapter/references/codex-hooks-strategy.md)
- [packages/codex-adapter/references/codex-hook-lab.md](D:/Users/chany/Documents/claw-kit/packages/codex-adapter/references/codex-hook-lab.md)

## Test targets

- `SessionStart`
- `PermissionRequest`
- `UserPromptSubmit`
- `Stop`
- `PreToolUse`
- `PostToolUse`
- `PreCompact`
- `PostCompact`
- `SubagentStart`
- `SubagentStop`

## Expected outcome

This phase should answer:

1. Which events actually fire in the current Codex desktop runtime?
2. What payload shape reaches hook commands?
3. Which hooks are reliable enough for optional `claw-kit` automation?

## Next decision after validation

- If only tool hooks work reliably:
  - use them for diagnostics or lightweight validation only
- If session hooks also work reliably:
  - consider optional bootstrap and stop-time reminders
- If hooks are inconsistent:
  - keep `claw-kit` fully skill-driven on Codex
