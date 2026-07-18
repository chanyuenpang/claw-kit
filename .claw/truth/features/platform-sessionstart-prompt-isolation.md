# Platform SessionStart Prompt Isolation (Codex vs opencode)

## Status

Accepted working truth for how the two supported hosts resolve the claw-kit SessionStart prompt and plugin/skill references.

## Core platform semantics

- `plugin://claw-kit@claw-kit-local` is a **Codex-specific** markdown plugin link. Codex resolves `[@claw-kit](plugin://claw-kit@claw-kit-local)` as a reference to the locally installed claw-kit plugin (see `packages/codex-adapter/references/codex-hooks-strategy.md` and `packages/codex-adapter/references/codex-startup-recovery.md`).
- **opencode does NOT parse the `plugin://` protocol at all.** opencode loads skills through the `skill` tool using a bare skill name (e.g. `using-claw-kit`), with skills registered via opencode's `skills.paths` config. The shipped opencode skills live under `packages/opencode-adapter/skills/` (e.g. `packages/opencode-adapter/skills/using-claw-kit/SKILL.md`).

## Resulting SessionStart prompt differentiation

Because of the above, the two guidance configs intentionally diverge on reference syntax, and neither emits a `plugin://` link in the prompt text:

- **Codex config** (core bundled `packages/core/src/workflow-guidance.config.json`): the default and recovered `sessionStart` prompts reference `claw-kit:using-claw-kit` and `@claw-kit`, with no `plugin://` link in the prompt text.
- **opencode config** (`packages/opencode-adapter/workflow-guidance.opencode.json`): the default and recovered prompts say "Load the `using-claw-kit` skill" (bare skill name) and "Use the claw-kit plugin", with **no `plugin://` link** anywhere.
- **core fallback constants** in `packages/core/src/workflow-guidance.ts` are unified to `@claw-kit` / `claw-kit:using-claw-kit`, matching the Codex config verbatim, so a missing `sessionStart` config degrades to Codex conventions rather than emitting a `plugin://` link that opencode cannot resolve.
- Historical `0.1.53` evidence used a low-complexity entry rule on both startup-copy surfaces. That rule is version-bound and no longer owns current entry behavior; `.claw/truth/adr/using-claw-kit-session-entry.md` owns the current reusable-project-knowledge admission decision. This document owns only the host-specific prompt reference syntax and plugin/skill wording.

## Verification

- `claw hook SessionStart` run against the core bundled config returns Codex conventions (`@claw-kit`, `claw-kit:using-claw-kit`).
- `claw hook SessionStart` run against the opencode config (`CLAW_GUIDANCE_CONFIG` pointing at `workflow-guidance.opencode.json`, `CLAW_HOST=opencode`) returns opencode conventions (bare skill name, no `plugin://`).
- `npm run check` passes for `packages/core` and `packages/cli`.

## Known correction point

- ADR `session-start-prompt-config-delegation` section 4 ("平台 prompt 文案语义隔离") originally described the platform assignment **inverted**: it claimed `plugin://` was meaningless to Codex and should be kept by opencode. The verified reality is the opposite — `plugin://` is a Codex markdown-link construct and opencode cannot parse it. The code/config are already correct as described above; any remaining ADR reconciliation belongs to the combined `knowledge-writer` stewardship pass, not a separate ADR writer.
- The prior inversion had caused the opencode variant sessionStart to carry Codex-only `plugin://` syntax, which broke direct claw-workflow entry in an opencode session.

## Related files

- `packages/core/src/workflow-guidance.config.json` — Codex default `sessionStart` template
- `packages/opencode-adapter/workflow-guidance.opencode.json` — opencode variant `sessionStart` template
- `packages/codex-adapter/.codex-plugin/plugin.json` — Codex plugin entry copy for the installed startup surface
- `packages/core/src/workflow-guidance.ts` — fallback constants + `buildSessionStartDefaultPrompt` / `buildSessionStartRecoveredPrompt`
- `packages/opencode-adapter/plugin/index.ts` — `invokeClawSessionStart()` with explicit `CLAW_HOST` / `CLAW_GUIDANCE_CONFIG` env
- `packages/opencode-adapter/skills/using-claw-kit/SKILL.md` — opencode skill registration
- `packages/codex-adapter/references/codex-hooks-strategy.md`, `packages/codex-adapter/references/codex-startup-recovery.md` — Codex `[@claw-kit](plugin://...)` usage

## Search terms

- `plugin://claw-kit@claw-kit-local`
- `using-claw-kit`
- `sessionStart`
- `CLAW_GUIDANCE_CONFIG`
- `CLAW_HOST`
- `skills.paths`
