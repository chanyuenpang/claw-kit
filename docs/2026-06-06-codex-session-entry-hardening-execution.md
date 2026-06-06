# Codex session entry hardening execution

## Summary

This pass hardens the prompt-driven Codex adapter by making the plugin entry path more explicit about which skill should run first.

## Changes

- Added `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
  - this is the dedicated session-entry skill for `@claw-kit`
  - it routes startup into `claw-kit:bootstrap`
- Updated `packages/codex-adapter/.codex-plugin/plugin.json`
  - manifest skill ordering now places `using-claw-kit` first
  - plugin interface text now points to `using-claw-kit`
  - starter prompts now point to `using-claw-kit`
- Updated `packages/codex-adapter/skills/bootstrap/SKILL.md`
  - clarified that bootstrap follows `using-claw-kit`
- Added `packages/codex-adapter/references/codex-session-entry-validation.md`
  - records what a good fresh-session bootstrap looks like

## Intent

The goal is not to introduce new runtime automation.

The goal is to increase the odds that a fresh Codex session:

- recognizes the plugin as a harness entrypoint
- routes through `using-claw-kit`
- then routes through bootstrap and `.claw` context recovery
