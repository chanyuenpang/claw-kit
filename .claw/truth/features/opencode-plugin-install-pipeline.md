# OpenCode Plugin Install Pipeline

## Status

Current

## Dual symmetric install chains

claw-kit maintains two plugin install chains — one for Codex, one for opencode — with intentionally symmetric structure:

```
scripts/<host>-plugin-bundle.mjs       ← core logic (read source, export bundle, install)
scripts/install-<host>-plugin.mjs       ← thin CLI wrapper (parse args, call bundle)
scripts/install-<host>-plugin.ps1      ← PowerShell entrypoint (build deps, call wrapper)
```

Overlapping behaviors (test-file filtering, `node` preflight, `--source-dir` passthrough) must stay symmetric. Differences are limited to host-specific capabilities (e.g. shim files, config injection, agent copy).

## OpenCode install behavior

`installOpencodePlugin()` in `scripts/opencode-plugin-bundle.mjs` performs these steps:

1. **Copy plugin payload** to `~/.config/opencode/plugins/claw-kit/` (fixed directory, no version subdirectory). The plugin directory keeps its own `skills/` and `agents/` copies as source assets.
2. **Create plugin shim** at `~/.config/opencode/plugins/claw-kit.ts` — opencode only scans `*.ts`/`*.js` at the plugins root, so this shim re-exports the actual plugin:
   ```ts
   export { default, ClawKitPlugin } from "./claw-kit/plugin/index.ts";
   ```
3. **Copy skills into the opencode discovery directory** at `~/.config/opencode/skills/<name>/SKILL.md`. The plugin API can register custom `tool`s but not skills, so claw-kit's installer mirrors each skill folder into the global conventional directory that opencode scans for skills. The copy is idempotent: reinstall overwrites stale skill content without duplicating entries.
4. **Remove retired writer discovery directories** `~/.config/opencode/skills/truth-writer/`, `adr-writer/`, and `knowledge-writer/` before copying skills. Delegate orchestration and built-in governance are Core internal resources and never enter OpenCode skill discovery.
5. **Copy agent definitions** (`*.md` from `packages/opencode-adapter/agents/`) to `~/.config/opencode/agent/`. Only `claw-knowledge-writer.md` and `claw-researcher.md` are present; retired `claw-truth-writer.md` and `claw-adr-writer.md` are not shipped.
6. After install, **opencode must be restarted** for the plugin to take effect.

No `opencode.json` is created or modified by claw-kit's installer, and no `skills.paths` entry is injected; skill discovery is achieved entirely by copying skill folders into `~/.config/opencode/skills/`.

## Codex vs OpenCode differences

| Aspect | Codex | OpenCode |
|---|---|---|
| Install directory | `~/.codex/plugins/cache/claw-kit-local/claw-kit/<version>/` (versioned) | `~/.config/opencode/plugins/claw-kit/` (fixed, no version) |
| Shim file | Not needed | `~/.config/opencode/plugins/claw-kit.ts` required |
| Skills discovery | Hook-driven via plugin manifest | Copy each skill into `~/.config/opencode/skills/<name>/` (convention dir) |
| Agent copy | Not needed | `~/.config/opencode/agent/*.md` required |
| Host-specific payload | `hooks/`, `.codex-plugin/` | `workflow-guidance.opencode.json` |

## Shared test-file filter

Both `codex-plugin-bundle.mjs` and `opencode-plugin-bundle.mjs` export a `shouldCopyEntry(sourcePath)` function that returns `false` for `*.test.mjs` files, preventing test files from being installed to user config directories. The filter is applied in both `copyDirectoryContents` (recursive directory walk) and `copyPayloadTree` (payload manifest copy).

## Test coverage

Both plugins have dedicated test suites using `node:test` + `node:assert/strict` with zero external dependencies:

- `test:codex-plugin` — `scripts/codex-plugin-bundle.test.mjs`
- `test:opencode-plugin` — `scripts/opencode-plugin-bundle.test.mjs` (10 tests)

Both use `fs.mkdtemp` for temp-directory isolation. The opencode tests cover: read source metadata; config skill entrypoint; `using-claw-kit` session-entry contracts; researcher search-query syntax; the `claw-knowledge-writer.md` subagent consuming only the supplied internal bootstrap prompt; absence of public writer skills; shared-skills sync; export+filter; install e2e; and idempotent discovery cleanup without creating `opencode.json`.

## OpenCode native knowledge finalizer

`packages/opencode-adapter/agents/claw-knowledge-writer.md` is a dedicated `mode: subagent` entry. The plugin dispatches from the current OpenCode service using native `session.create` and `session.promptAsync`; it does not spawn `opencode run` for the normal plugin closeout path. Before creating the child, it persists a Core-owned execution reservation; it binds the returned child ID and records send-attempted before prompt delivery. The child receives only the canonical internal bootstrap, uses its own `CLAW_SESSION_ID`, claims the matching job, creates and completes the generated assignment subplan, then records its terminal result through Core. The writer agent does not load `using-claw-kit`, a public writer skill, or another writer.

Parent permission rules are explicitly copied to the child because `parentID` alone does not inherit permissions. Writer identity is resolved from persisted Core parent/project/child association; only the writer session suppresses startup prompts, report capture, and automatic continuation. Native acceptance is not completion. Create/send accepted or unknown outcomes are not replayed; recovery inspects persisted execution and canonical job state. Plugin failures do not roll back plan completion. Execution is scoped to the live OpenCode service and is not promised to survive its shutdown. The older CLI runner remains for legacy CLI entry points, not as fallback after native dispatch failure.

When `executionCommand(..., "inspect")` fails during writer classification, the plugin emits a structured `OPENCODE_EXECUTION_INSPECT_FAILED` warning (`knowledge.inspect`, outcome unknown) and treats the event as unclassified. This keeps ordinary read-only context available while suppressing automation that could capture or send under an uncertain writer identity; it does not substitute a guessed writer classification or block unrelated read-only use. Anchor: `packages/opencode-adapter/plugin/index.ts` (`isWriter`).

Source/unit evidence does not establish a Linux real-model deposition E2E or prove activation of an installed plugin; record those as unverified until exercised in that environment.

## OpenCode idle capture result contract

The plugin invokes `claw hook auto-doc --host opencode` with `CLAW_KNOWLEDGE_CAPTURE_RESULT=1` because its machine caller must receive exactly one JSON result even when capture is skipped. The CLI preflight lets the hook owner handle this result mode instead of silently exiting for a missing registry or other ineligible context; legacy hook invocations without the flag retain the silent fast path. The hook reports ordinary skips as `{ ok: true, captured: false }`, successful capture as a structured capture result, and capture exceptions as `{ ok: false, error: ... }`. The plugin parses stdout as JSON, surfaces a structured failure through its fail-open warning, and does not retry capture. This prevents empty stdout from becoming a JSON EOF while preserving real failure visibility; it does not establish Linux host activation or end-to-end deposition.

Implementation anchors: `packages/cli/src/knowledge-hook-preflight.ts` (`CLAW_KNOWLEDGE_CAPTURE_RESULT`), `packages/cli/src/cli.ts` (`runStopHook`), and `packages/opencode-adapter/plugin/index.ts` (`invokeClawAutoDoc`). Regression evidence is in `packages/cli/test/opencode-capture.test.ts` and the OpenCode adapter idle capture test.

## Related files

### OpenCode chain
- `scripts/opencode-plugin-bundle.mjs` — core logic: `readOpencodePluginSource`, `exportOpencodePluginBundle`, `installOpencodePlugin`, `installSkillsToDiscoveryDir`, `shouldCopyEntry`
- `scripts/install-opencode-plugin.mjs` — thin CLI wrapper with `--source-dir` / `--install-dir`
- `scripts/install-opencode-plugin.ps1` — PowerShell entrypoint with `Assert-Command -Name "node"` preflight
- `scripts/opencode-plugin-bundle.test.mjs` — 10 unit tests
- `packages/opencode-adapter/agents/claw-knowledge-writer.md` — subagent entry that consumes the internal bootstrap prompt
- `packages/opencode-adapter/` — adapter source (plugin, skills, agents, references)

### Codex chain (symmetric counterpart)
- `scripts/codex-plugin-bundle.mjs`
- `scripts/install-codex-plugin.mjs`
- `scripts/install-codex-plugin.ps1`
- `scripts/codex-plugin-bundle.test.mjs`
- `packages/codex-adapter/` — adapter source

## Search terms

- `installOpencodePlugin`
- `installSkillsToDiscoveryDir`
- `shouldCopyEntry`
- `claw-kit.ts` shim
- `~/.config/opencode/skills`
- `opencode.json` (not injected)
- `Assert-Command`
- `OPENCODE_PLUGIN_PAYLOAD_PATHS`
- `claw-knowledge-writer.md`
- `end.completed`
- `opencode run`
- `real-runner verification`
