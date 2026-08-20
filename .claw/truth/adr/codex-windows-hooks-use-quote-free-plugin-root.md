# ADR: Codex Windows Hooks Use Quote-Free Plugin Root Commands

## Context

Codex Desktop 0.148 discovers and trusts the claw-kit hooks and accepts the `startup|resume|clear|compact` matcher, but its Windows hook runner can exit with code 1 before launching `node` when `commandWindows` contains a quoted executable argument. Before this repair, the adapter registered both `SessionStart` and `Stop` with quoted `%PLUGIN_ROOT%` paths, so the transport defect prevented dynamic startup context and also affected knowledge-finalization dispatch.

Codex substitutes its plugin-root token literally before command dispatch. The adapter needs a compatibility form that crosses the affected runner without changing lifecycle ownership or treating the static plugin prompt as a replacement for dynamic hook output.

## Decision

- Keep `SessionStart` as the startup lifecycle entry and retain the complete `startup|resume|clear|compact` matcher.
- On Windows, register both `SessionStart` and `Stop` with quote-free commands that use Codex's literal `${PLUGIN_ROOT}` substitution and forward-slash script paths.
- Keep `defaultPrompt` as a short, independent invocation fallback. It does not replace `SessionStart` `additionalContext` or mask hook execution failures.
- Apply and verify the command-shape change as one adapter compatibility boundary because both hooks use the same Codex Windows runner.

## Alternatives

- Retaining quoted `%PLUGIN_ROOT%` commands was rejected because the affected Desktop runner fails before the adapter scripts execute.
- Adding matcher sources such as `vscode` was rejected because discovery and source matching already succeed and do not control Windows command transport.
- Debugging or changing the hook scripts was rejected as the primary fix because the failing process does not reach `node`.
- Expanding `defaultPrompt` to duplicate dynamic recovery context was rejected because it couples a static entry fallback to runtime state and does not repair `Stop`.

## Consequences

- The adapter now uses the compatibility path for the affected Windows Desktop runner without changing hook lifecycle semantics; the POSIX commands remain unchanged.
- SessionStart and Stop commands remain structurally aligned. Adapter tests assert the exact literal token, forward slashes, and absence of quotes in both Windows registrations, and installed-plugin smoke verification confirms both hook completion and model-visible startup context.
- A quote-free command depends on the resolved plugin path being safe as a single shell argument. Installations whose resolved path requires quoting need either a host runner containing the upstream quoting fix or a separately verified transport mechanism; reintroducing quotes is not an implicit fallback.
- Validation must distinguish hook discovery and trust, command execution, hook stdout, and model-context consumption so future host regressions are localized correctly.
