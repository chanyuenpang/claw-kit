# Host-specific update skills

## Status

Accepted working truth for the current Codex, OpenCode, and DSH update surfaces.

<!-- state: current -->
## Core facts

- `update` is a host-selected skill name, not a cross-platform router. The loaded adapter determines which implementation is available, and the workflow must not ask the user to choose Codex, OpenCode, or a conservative route.
- Codex owns `packages/codex-adapter/skills/update/`; OpenCode owns `packages/opencode-adapter/skills/update/`; DSH owns `packages/dsh-adapter/skills/update/`. Each package independently maintains `SKILL.md`, `TEMPLATE.json`, and `non-claw-fallback.md`; only Codex and OpenCode additionally carry `CONTENT-COVERAGE.md`.
- `scripts/sync-shared-skills.mjs` deliberately excludes `update` from `SHARED_SKILL_NAMES`. `shared/skills/update/` no longer exists, and shared-skill synchronization must not overwrite either adapter-owned implementation.
- All three implementations keep the same high-level update unit: confirm the published target, refresh the global CLI together with the current host plugin, verify both surfaces, and report exact per-surface success or failure.
- The Codex and OpenCode `TEMPLATE.json` files are fixed three-task `process.active` plans; the DSH template is a fixed four-task plan (detect versions, update CLI, update profile adapter, restart and verify activation). No template has a host-selection task or `guidance.onDone.choices` for platform routing.
- Each loaded host-specific update skill resolves its own directory and invokes the adjacent `TEMPLATE.json` through `--template-file`. Repository-root discovery may still reject the compatibility lookup `claw plan create --template update` as ambiguous, but the normal skill entry no longer depends on that combined-root lookup and must not restore a shared platform router.

## Codex contract

- Refresh the published global CLI first, then refresh the official Codex plugin from the `chanyuenpang/claw-kit` GitHub marketplace.
- Only `claw-kit@claw-kit` may be enabled; `claw-kit@claw-kit-local` must be disabled. Unpublished workspace files and local marketplaces are not valid update sources.
- On Windows, resolve a marketplace ref by collecting the complete `git ls-remote` result before selecting a matching line. Piping `git ls-remote` directly into `Select-Object -First 1` can close the pipeline early and leave a false nonzero exit status even when the commit was returned.
- Official activation disables both maintained local identities, `claw-kit@claw-kit-local` and `claw-kit-local@personal`, rather than only the first legacy id. The installed cache payload must include manifest-declared assets as well as skills, hooks, references, scripts, and package metadata; source/cache file parity is the completion boundary.
- If refreshing the CLI leaves an already-created plan bound to an older installed `TEMPLATE.json` and the new CLI rejects a remaining canonical mutation, preserve the plan and template unchanged. Run only the remaining mutations through the fixed Codex driver with the matching published CLI, then verify that the global `claw` command still resolves to the target version. This compatibility recovery does not authorize unpublished workspace content, a local marketplace, or keeping the older CLI installed.
- If a full Git clone stalls during `index-pack` and an existing clean official checkout already points at the same GitHub origin, prefer a filtered shallow fetch such as `--depth=1 --filter=blob:none` to fast-forward that checkout. Treat the recovery as complete only when marketplace HEAD, source manifest, cache manifest, appserver identity, and source/cache payload comparison all agree with the published target; `.git` metadata or a successful fetch alone is insufficient.
- If the official Git checkout still cannot be recovered, a GitHub-published branch archive such as the official `main.zip` snapshot remains an acceptable source-transport fallback only after its plugin manifest is verified against the published target. The verified snapshot may then be passed to the maintained cache/identity installer; neither recovery authorizes workspace payloads, local marketplaces, or skipping source/cache manifest and payload comparison.
- Cache presence alone is not activation proof. Verification covers the published CLI version, official marketplace source, enabled identity, matching source/cache manifests, required skills, and the restart/new-task loaded-skill boundary.

## OpenCode contract

- In the maintained repository checkout, `npm run install:opencode-plugin` is the update entry. It rebuilds and reinstalls the global CLI before deploying the OpenCode plugin payload, root shim, discovery skill copies, agent definitions, references, and workflow guidance.
- Installed OpenCode copies are outputs, not authoring surfaces. A CLI-only refresh or manual edit under `~/.config/opencode` is incomplete.
- Verification covers the global CLI, all deployed OpenCode surfaces, removal of retired writer discovery directories, and the restart boundary before validating the loaded plugin version.

## DSH contract

- Refresh the published global CLI first (`npm install -g @veewo/claw@latest`), then install the adapter into the DSH profile with `dsh plugin --profile <name> add @veewo/dsh-claw-kit@latest`. The installed CLI must accept `--host dsh`; a CLI without dsh host support cannot drive the adapter.
- Unpublished workspace files are not valid update sources; the npm registry is the default source, and the published GitHub source only when separately authorized.
- A new package version alone is not activation proof. The adapter activates only after the DSH Host restarts and a real session mounts `claw_run` with the seven bundled skills (`using-claw-kit`, `researcher`, `planning`, `config`, `create-claw-skill`, `claw-kit-doc`, `update`). Verification covers `claw --version` at the target, the `claw-kit` row in `dsh --profile <name> --dump-config`, and the post-restart session surface.
- An update plan paused at the restart boundary survives the Host restart: the new session resumes it via host-scoped recovery and closes it out without recreating the plan.

## Maintenance and verification anchors

- `packages/codex-adapter/skills/update/SKILL.md`
- `packages/codex-adapter/skills/update/TEMPLATE.json`
- `packages/codex-adapter/skills/update/non-claw-fallback.md`
- `packages/codex-adapter/skills/update/CONTENT-COVERAGE.md`
- `packages/dsh-adapter/skills/update/SKILL.md`
- `packages/dsh-adapter/skills/update/TEMPLATE.json`
- `packages/dsh-adapter/skills/update/non-claw-fallback.md`
- `packages/opencode-adapter/skills/update/SKILL.md`
- `packages/opencode-adapter/skills/update/TEMPLATE.json`
- `packages/opencode-adapter/skills/update/non-claw-fallback.md`
- `packages/opencode-adapter/skills/update/CONTENT-COVERAGE.md`
- `scripts/sync-shared-skills.mjs`
- `scripts/sync-shared-skills.test.mjs`
- `scripts/codex-plugin-bundle.test.mjs`
- `scripts/codex-plugin-bundle.mjs`
- `scripts/install-codex-plugin.ps1`
- `scripts/opencode-plugin-bundle.test.mjs`
- `packages/opencode-adapter/references/opencode-plugin-update.md`

## Search terms

- `platform-specific update skills`
- `adapter-owned update`
- `ambiguous update template at repository root`
- `no host route choice`
- `SHARED_SKILL_NAMES excludes update`
- `Codex update official marketplace`
- `existing-plan template-version handoff`
- `matching published CLI remaining mutations`
- `filtered shallow fetch`
- `index-pack stall recovery`
- `OpenCode update maintained installer`
- `DSH update profile plugin`
- `Host restart activation proof`
- `update plan survives Host restart`

<!-- state: history -->
## Evolution history

<!-- dated: 2026-08-01 -->
### Hardened the official Codex install path with real Windows evidence

The `0.2.6.0` maintenance refresh found three gaps that candidate and marketplace tests had not exposed: early PowerShell pipeline closure made a successful `git ls-remote` look failed, official activation left a local identity enabled, and the cache payload omitted `assets/icon.png`. The installer now resolves refs without an early-closing pipe, disables local identities, and copies assets; the completed refresh compared all `27/27` official source and cache files. Restarting Codex and starting a new task remains a separate loaded-runtime check.

<!-- dated: 2026-09-02 -->
### Verified the first DSH-host update round

The DSH web profile was refreshed from `@veewo/claw@0.2.27` + `@veewo/dsh-claw-kit@0.2.32-rc.0` to `@veewo/claw@0.2.36` (npm latest) + `@veewo/dsh-claw-kit@0.2.36-rc.0` as one update unit. The CLI accepted `--host dsh`, dump-config carried the claw-kit row, and after the Host restart a real session mounted `claw_run` with all seven bundled skills; the update plan paused at the restart boundary was resumed in the new session and closed out. This round established the DSH activation boundary recorded above — a package version bump alone was never accepted as completion.
