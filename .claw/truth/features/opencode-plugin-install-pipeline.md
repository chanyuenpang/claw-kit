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

Both use `fs.mkdtemp` for temp-directory isolation. The opencode tests cover: read source metadata; config skill entrypoint; `using-claw-kit` session-entry contracts; researcher search-query syntax; the `claw-knowledge-writer.md` primary agent consuming only the supplied internal bootstrap prompt; absence of public writer skills; shared-skills sync; export+filter; install e2e; and idempotent discovery cleanup without creating `opencode.json`.

## OpenCode finalizer agent entry

`packages/opencode-adapter/agents/claw-knowledge-writer.md` is the only shipped writer agent for the OpenCode host. It is a `mode: primary` entry launched by the background finalizer through `opencode run`; its body follows the supplied internal knowledge-delegate bootstrap prompt containing the packaged template path, project root, and finalize id. It does not load `using-claw-kit` or a writer skill and does not dispatch another writer. The internal delegate session plan and its dynamic assignment subplan must complete before finalization succeeds. Retired focused writer agents remain absent.

Real-runner verification via `opencode run` must confirm end-to-end that the internal delegate session plan and assignment subplan reach `end.completed`, no writer skill is discovered or loaded, and no recursive finalization job is queued from the executor session; unit coverage does not substitute for this real-runner check.

## Related files

### OpenCode chain
- `scripts/opencode-plugin-bundle.mjs` — core logic: `readOpencodePluginSource`, `exportOpencodePluginBundle`, `installOpencodePlugin`, `installSkillsToDiscoveryDir`, `shouldCopyEntry`
- `scripts/install-opencode-plugin.mjs` — thin CLI wrapper with `--source-dir` / `--install-dir`
- `scripts/install-opencode-plugin.ps1` — PowerShell entrypoint with `Assert-Command -Name "node"` preflight
- `scripts/opencode-plugin-bundle.test.mjs` — 10 unit tests
- `packages/opencode-adapter/agents/claw-knowledge-writer.md` — primary finalizer agent that consumes the internal bootstrap prompt
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
