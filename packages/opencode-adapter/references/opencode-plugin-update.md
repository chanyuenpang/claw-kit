# OpenCode plugin update lifecycle

Use this note when claw-kit needs to refresh the OpenCode plugin install surface after a newer version is detected.

## What gets installed

`npm run install:opencode-plugin` (inside the claw-kit repo) performs a full deploy via `node scripts/install-opencode-plugin.mjs` → `installOpencodePlugin()`:

1. **Checks** the source artifact inputs. Install development dependencies with `npm ci --include=dev` first; the installer does not build or reinstall the global CLI.
2. **Stages** allowlisted adapter runtime plus the canonical skill packages selected by `skill-inputs.json` in an isolated artifact. `assembleSkills` copies full packages into artifact `skills/`, never back into source. The installed flat layout is unchanged; OpenCode `update` remains host-owned.
3. **Copies plugin payload** to `~/.config/opencode/plugins/claw-kit/`:
   - `plugin/` — the TypeScript plugin entry
   - `skills/` — all skill folders (shared + adapter-local)
   - `agents/` — agent definition `.md` files
   - `references/` — reference docs
   - `workflow-guidance.opencode.json`
   - `package.json`, `tsconfig.json`
4. **Creates plugin shim** at `~/.config/opencode/plugins/claw-kit.ts` — opencode only scans `*.ts`/`*.js` at the plugins root, not subdirectories.
5. **Copies skills** to `~/.config/opencode/skills/` — opencode discovers skills ONLY from fixed convention directories, not from plugin directories.
6. **Copies agent files** to `~/.config/opencode/agent/` — opencode discovers agents from this directory.

## Install surfaces summary

| Surface | Path | Purpose |
|---------|------|---------|
| Plugin entry (shim) | `~/.config/opencode/plugins/claw-kit.ts` | Re-exports plugin from subdirectory |
| Plugin payload | `~/.config/opencode/plugins/claw-kit/` | Full plugin source (TS, not compiled) |
| Skills (discovery) | `~/.config/opencode/skills/<name>/SKILL.md` | Makes skills appear in opencode skill list |
| Agents (discovery) | `~/.config/opencode/agent/<name>.md` | Makes agents appear in opencode agent list |

The plugin payload in `plugins/claw-kit/` is a **copy**, not a symlink. Every code change requires re-running the install script.

## When to update

- After `claw context` startup recovery detects a newer published version.
- After pulling/merging changes to `packages/opencode-adapter/` or canonical public skill inputs.
- After building new core/CLI artifacts that the plugin depends on.
- Before validating a new workflow feature that relies on plugin event handlers.

## Update procedure (inside the claw-kit repo)

```sh
npm install -g @veewo/claw@<target-version>
npm ci --include=dev
npm run install:opencode-plugin
```

Use the confirmed published target and matching checkout. These Node-based commands work in Bash and PowerShell. TypeScript is a repository development dependency, not an added plugin runtime prerequisite.

## Verification

After install, verify each surface:

1. **Plugin payload version** — `~/.config/opencode/plugins/claw-kit/package.json` version matches the repo version.
2. **Plugin entry** — `~/.config/opencode/plugins/claw-kit/plugin/index.ts` contains the expected event handlers (e.g. `session.idle`, `session.created`).
3. **Key agent definitions exist**:
   - `~/.config/opencode/agent/claw-knowledge-writer.md` (finalization worker)
   - `~/.config/opencode/plugins/claw-kit/agents/claw-knowledge-writer.md`
4. **Key skills exist**:
   - `~/.config/opencode/skills/feature-architecture/SKILL.md`
   - Internal `knowledge-writer` and `delegate-writer` must not appear as public discovery skills; their governance resources are owned by Core.
   - `~/.config/opencode/skills/using-claw-kit/SKILL.md`
   - `~/.config/opencode/skills/update/SKILL.md`
5. **Workflow guidance** — `~/.config/opencode/plugins/claw-kit/workflow-guidance.opencode.json` has no `delegates` field (removed in the new flow).
6. **References** — all adapter-local reference docs exist under `plugins/claw-kit/references/`.

## Restart required

opencode loads plugins at startup. After updating the plugin, **restart opencode** for changes to take effect. The running session continues with the old plugin code until restarted.

## Guardrails

- Do not edit files under `~/.config/opencode/plugins/claw-kit/` directly — they are overwritten on the next install. Edit the source in `packages/opencode-adapter/` and re-run the install script.
- Edit canonical shared skill sources under `.agents/skills/`, not installed copies. The adapter-owned `skills/update/` package is edited in place.
- The plugin requires a matching CLI. Installing plugin files alone does not upgrade that CLI.
- A single-surface refresh (CLI only or plugin only) is not a complete update. Always refresh both.
