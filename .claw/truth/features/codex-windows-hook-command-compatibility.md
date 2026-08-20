# Codex Windows Hook Command Compatibility

<!-- state: current -->
## Current behavior

- Codex discovers the adapter-owned `SessionStart` hook from `packages/codex-adapter/hooks/hooks.json`; the supported matcher remains `startup|resume|clear|compact`.
- The Windows registrations for both `SessionStart` and `Stop` now use quote-free `node ${PLUGIN_ROOT}/scripts/...` commands with forward slashes. Codex performs the literal plugin-root substitution before dispatch.
- The macOS/Linux registrations remain the quoted POSIX forms `node "$PLUGIN_ROOT/scripts/..."`; Windows compatibility does not change their command contract.
- Exact adapter assertions protect all four command strings and reject quotes in both `commandWindows` values.
- A real VS Code-source task confirmed that both hooks complete and that the model receives the `SessionStart` `additionalContext` text.
- The plugin `defaultPrompt` remains an independent static invocation fallback and is not evidence that dynamic hook context was delivered.

## Compatibility constraints

- Preserve `SessionStart` as the lifecycle entry and keep the full supported source matcher. Windows compatibility belongs to command construction, not lifecycle routing.
- Keep the Windows command shape aligned across `SessionStart` and `Stop` because both registrations cross the same host runner boundary.
- Keep the POSIX and Windows forms independently explicit in tests so a compatibility edit cannot silently rewrite another platform's command.

## Verification rules

- Verify discovery, source path, enabled state, and trust independently from command execution.
- Verify execution with an observable, side-effect-free probe that records the hook input, exit status, and stdout shape; then confirm the first model request contains the probe's `additionalContext` marker.
- When the process exits before `node` starts, classify the failure at the Codex host command-transport boundary rather than in the adapter script.
- For the shipped repair, require exact manifest/hooks parsing, adapter assertions for the platform-specific command strings, and an installed-plugin smoke task that observes both hook completion and model-visible injected context.

## Implementation anchors

- `packages/codex-adapter/hooks/hooks.json`
- `packages/codex-adapter/scripts/session-start.mjs`
- `packages/codex-adapter/scripts/knowledge-finalizer.mjs`
- `packages/codex-adapter/hooks/subagent-contract.test.mjs`

<!-- state: history -->
## Evolution history

<!-- dated: 2026-08-20 -->
### Quoted Windows hook commands failed before Node

The former Windows registrations used quoted `%PLUGIN_ROOT%` paths with backslashes. Codex Desktop 0.148 could reject that command shape in its Windows runner before `node` started, returning exit code 1 even though hook discovery, trust, and matching succeeded. Retaining this incident boundary helps distinguish future host command-transport regressions from adapter script or `additionalContext` failures.
