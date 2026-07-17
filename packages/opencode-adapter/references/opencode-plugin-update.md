# OpenCode plugin update lifecycle

Use this note when claw-kit needs to refresh the OpenCode plugin install surface after a newer version is detected.

## What gets installed

`npm run install:opencode-plugin` (inside the claw-kit repo) performs a full deploy via `scripts/install-opencode-plugin.ps1` → `scripts/install-opencode-plugin.mjs` → `installOpencodePlugin()`:

1. **Builds** core (`@veewo/claw-core`) and CLI (`@veewo/claw`) from source.
2. **Stages** the adapter source with `syncSharedSkills` — overwrites shared skill SKILL.md files (`planning`, `config`, `update`, `create-claw-skill`, `knowledge-writer`) from `shared/skills/`.
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
- After pulling/merging changes to `packages/opencode-adapter/` or `shared/skills/`.
- After building new core/CLI artifacts that the plugin depends on.
- Before validating a new workflow feature that relies on plugin event handlers.

## Update procedure (inside the claw-kit repo)

```powershell
npm run install:opencode-plugin
```

This single command builds core + CLI and deploys all plugin surfaces. No manual build step is needed beforehand.

## Verification

After install, verify each surface:

1. **Plugin payload version** — `~/.config/opencode/plugins/claw-kit/package.json` version matches the repo version.
2. **Plugin entry** — `~/.config/opencode/plugins/claw-kit/plugin/index.ts` contains the expected event handlers (e.g. `session.idle`, `session.created`).
3. **Key agent definitions exist**:
   - `~/.config/opencode/agent/claw-knowledge-writer.md` (finalization worker)
   - `~/.config/opencode/plugins/claw-kit/agents/claw-knowledge-writer.md`
4. **Key skills exist**:
   - `~/.config/opencode/skills/knowledge-writer/SKILL.md`
   - `~/.config/opencode/skills/using-claw-kit/SKILL.md`
   - `~/.config/opencode/skills/update/SKILL.md`
5. **Workflow guidance** — `~/.config/opencode/plugins/claw-kit/workflow-guidance.opencode.json` has no `delegates` field (removed in the new flow).
6. **References** — all adapter-local reference docs exist under `plugins/claw-kit/references/`.

## Restart required

opencode loads plugins at startup. After updating the plugin, **restart opencode** for changes to take effect. The running session continues with the old plugin code until restarted.

## Guardrails

- Do not edit files under `~/.config/opencode/plugins/claw-kit/` directly — they are overwritten on the next install. Edit the source in `packages/opencode-adapter/` and re-run the install script.
- Do not edit shared skill SKILL.md files in the adapter — they are overwritten by `syncSharedSkills`. Edit `shared/skills/<name>/SKILL.md` instead.
- Do not skip the build step. The plugin references `@veewo/claw-core` and `@veewo/claw` at runtime via the global CLI; a stale build causes runtime errors.
- A single-surface refresh (CLI only or plugin only) is not a complete update. Always refresh both.
