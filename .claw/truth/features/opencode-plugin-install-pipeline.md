# OpenCode Plugin Install Pipeline

## Status

Accepted working truth for the opencode adapter plugin installation chain, its symmetry with the Codex adapter chain, and behavioral contracts.

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

1. **Copy plugin payload** to `~/.config/opencode/plugins/claw-kit/` (fixed directory, no version subdirectory).
2. **Create plugin shim** at `~/.config/opencode/plugins/claw-kit.ts` — opencode only scans `*.ts`/`*.js` at the plugins root, so this shim re-exports the actual plugin:
   ```ts
   export { default, ClawKitPlugin } from "./claw-kit/plugin/index.ts";
   ```
3. **Inject `skills.paths`** into `~/.config/opencode/opencode.json` — appends `plugins/claw-kit/skills` so opencode discovers skills like `using-claw-kit`. **Idempotent**: duplicate installs do not duplicate the entry, and existing paths are preserved.
4. **Copy agent definitions** (`*.md` from `packages/opencode-adapter/agents/`) to `~/.config/opencode/agent/`.
5. After install, **opencode must be restarted** for the plugin to take effect.

## Codex vs OpenCode differences

| Aspect | Codex | OpenCode |
|---|---|---|
| Install directory | `~/.codex/plugins/cache/claw-kit-local/claw-kit/<version>/` (versioned) | `~/.config/opencode/plugins/claw-kit/` (fixed, no version) |
| Shim file | Not needed | `~/.config/opencode/plugins/claw-kit.ts` required |
| Config injection | Not needed | `skills.paths` in `opencode.json` required |
| Agent copy | Not needed | `~/.config/opencode/agent/*.md` required |
| Host-specific payload | `hooks/`, `.codex-plugin/` | `workflow-guidance.opencode.json` |

## Shared test-file filter

Both `codex-plugin-bundle.mjs` and `opencode-plugin-bundle.mjs` export a `shouldCopyEntry(sourcePath)` function that returns `false` for `*.test.mjs` files, preventing test files from being installed to user config directories. The filter is applied in both `copyDirectoryContents` (recursive directory walk) and `copyPayloadTree` (payload manifest copy).

## Test coverage

Both plugins have dedicated test suites using `node:test` + `node:assert/strict` with zero external dependencies:

- `test:codex-plugin` — `scripts/codex-plugin-bundle.test.mjs` (3 tests)
- `test:opencode-plugin` — `scripts/opencode-plugin-bundle.test.mjs` (4 tests)

Both use `fs.mkdtemp` for temp-directory isolation. The opencode tests cover: read source metadata, export+filter, install e2e (payload + shim + agents + filter), and `skills.paths` idempotent injection with existing-entry preservation.

## Related files

### OpenCode chain
- `scripts/opencode-plugin-bundle.mjs` — core logic: `readOpencodePluginSource`, `exportOpencodePluginBundle`, `installOpencodePlugin`, `shouldCopyEntry`
- `scripts/install-opencode-plugin.mjs` — thin CLI wrapper with `--source-dir` / `--install-dir`
- `scripts/install-opencode-plugin.ps1` — PowerShell entrypoint with `Assert-Command -Name "node"` preflight
- `scripts/opencode-plugin-bundle.test.mjs` — 4 unit tests
- `packages/opencode-adapter/` — adapter source (plugin, skills, agents, references)

### Codex chain (symmetric counterpart)
- `scripts/codex-plugin-bundle.mjs`
- `scripts/install-codex-plugin.mjs`
- `scripts/install-codex-plugin.ps1`
- `scripts/codex-plugin-bundle.test.mjs`
- `packages/codex-adapter/` — adapter source

## Search terms

- `installOpencodePlugin`
- `shouldCopyEntry`
- `claw-kit.ts` shim
- `skills.paths`
- `opencode.json`
- `Assert-Command`
- `OPENCODE_PLUGIN_PAYLOAD_PATHS`
