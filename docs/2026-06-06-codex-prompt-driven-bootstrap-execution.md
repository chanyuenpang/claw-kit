# Codex prompt-driven bootstrap execution

## Summary

This execution pass moved the Codex adapter away from hook-dependent startup and into a prompt-driven bootstrap model.

The practical result is:

- `@claw-kit` should point Codex toward `claw-kit:bootstrap`
- bootstrap hook should recover `.claw` context first
- task scope should still be established through `claw plan write`
- plan, memory, truth, and ADR workflows should consume recovered context instead of adding a separate manual `claw context` step

## What changed

### Plugin entry

- `packages/codex-adapter/.codex-plugin/plugin.json`
  - removed hook dependency from the first-pass manifest strategy
  - updated description and interface metadata to point to `claw-kit:bootstrap`
  - updated default prompts so new sessions start with bootstrap language

### Startup workflow

- `packages/codex-adapter/skills/bootstrap/SKILL.md`
  - now acts as the primary session-entry skill
  - expects recovered harness state from bootstrap instead of telling the agent to run `claw context` manually
  - tells the agent to lead with harness state instead of a generic greeting

- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
  - now defines the prompt-driven replacement for hook behavior
  - routes startup into planning, execution, or truth/ADR deposition paths

### Supporting workflow skills

- `packages/codex-adapter/skills/plan-workflow/SKILL.md`
- `packages/codex-adapter/skills/search-workflow/SKILL.md`
- `packages/codex-adapter/skills/truth-workflow/SKILL.md`

These should now treat `claw context` as bootstrap-owned context recovery rather than a post-plan workflow step.

### Reference note

- `packages/codex-adapter/references/codex-prompt-driven-bootstrap.md`
  - records prompt-driven bootstrap as the Codex fallback strategy

## Validation signals

Observed in local Codex session transcripts:

- plugin capabilities are injected when `@claw-kit` is referenced
- startup noticeably slows because Codex loads skill guidance
- session bootstrap behavior is currently coming from skill loading, not from plugin command hooks

Observed in local hook experiments:

- plugin cache updates correctly
- plugin manifest updates correctly
- `hooks` and `plugin_hooks` can both be enabled locally
- command hook log files still do not appear

This keeps the current recommendation unchanged:

- treat hooks as experimental
- treat prompt-driven bootstrap as the reliable path

## Remaining gaps

1. Codex may still choose a generic conversational opener unless plugin prompting is strong enough.
2. We still need more fresh-session validation to see how consistently `claw-kit:bootstrap` is selected first.
3. Hook experiments should remain isolated from the main delivery path until Codex runtime behavior becomes trustworthy.
