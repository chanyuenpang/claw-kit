# Host-specific update skills

## Status

Accepted working truth for the current Codex, OpenCode, and DSH update surfaces.

<!-- state: current -->
## Current behavior

- `update` is a host-selected skill name, not a cross-platform router. The loaded adapter determines which implementation is available, and the workflow must not ask the user to choose Codex, OpenCode, or a conservative route.
- Codex owns `packages/codex-adapter/skills/update/`; OpenCode owns `packages/opencode-adapter/skills/update/`; DSH owns `packages/dsh-adapter/skills/update/`. Each package independently maintains `SKILL.md`, `TEMPLATE.json`, and `non-claw-fallback.md`; only Codex and OpenCode additionally carry `CONTENT-COVERAGE.md`.
- The assembler selects update from the target adapter's own package; there is no shared update source or sync-back step. [Shared-source Truth](<shared-planning-skill-source.md>) owns artifact assembly; it must not merge host-specific update implementations.
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

- Refresh the published global CLI first (`npm install -g @veewo/claw@latest`), then install the adapter into the DSH profile. A non-Electron profile takes `dsh plugin --profile <name> add @veewo/dsh-claw-kit@latest`; for the Electron-managed `desktop` profile that command is refused (below) and the equivalent is `plugin_manager(action: "install_bundle", target: "@veewo/dsh-claw-kit@<exact-version>")` or the exported tarball path. The installed CLI must accept `--host dsh`; a CLI without dsh host support cannot drive the adapter.
- The profile-aware `dsh plugin --profile ... add ...` command is the supported write path for a non-Electron DSH profile. The Electron-managed `desktop` profile is reserved to the Desktop application: the installed global `dsh` on `PATH` refuses every operation on it with `profile "desktop" is managed exclusively by the Electron application`, including `plugin`, and it forwards to the PATH pnpm rather than the app runtime's pnpm. Write that profile only through its own plugin manager (`plugin_manager` `install_bundle`, the same service as the in-app Plugins page) or, with the app fully quit, the packaged Desktop CLI invoked as the app with `ELECTRON_RUN_AS_NODE=1`. Agents must not directly write profile files with filesystem tools, scripts, or a shell; when a rejection names Electron, stop attempting direct file mutations instead of retrying another file write. Read-only inspection (bundle listing, package-manifest version, and `dsh --profile <name> --dump-config` for profiles that command accepts) remains valid. The canonical boundary and verified commands are `packages/dsh-adapter/skills/update/references/desktop-profile-write-boundary.md`.
- Unpublished workspace files are not valid update sources; the npm registry is the default source, and the published GitHub source only when separately authorized. A local tarball is a valid delivery artifact only when the release workflow authorizes that exact artifact for the target profile; it also skips the profile's registry release-age quarantine.
- A new package version alone is not activation proof. The adapter activates only after the DSH Host restarts and a real session mounts `claw_run` with the bundled skills declared by the installed package, including feature-architecture and knowledge-capture; do not rely on a historical fixed count. Verification covers `claw --version` at the target, the new profile bundle version (`plugin_manager` `list_bundles` for `desktop`; the `claw-kit` row in `dsh --profile <name> --dump-config` for profiles that command accepts), and the post-restart session surface.
- An update plan paused at the restart boundary survives the Host restart: the new session resumes it via host-scoped recovery and closes it out without recreating the plan.
- DSH CLI/project version mismatch is surfaced as startup `versionSync` context and, when the CLI is behind, as a suffix startup note. This is update guidance, not an adapter-side admission gate for ordinary workflow operations; version-sync diagnostics do not replace the canonical operation result. Anchors: `packages/cli/src/cli.ts` (`buildVersionSyncPrompt`, `shouldExposeVersionSync`) and `packages/cli/test/cli-project.test.ts` (version context cases).

## Maintenance and verification anchors

- `packages/codex-adapter/skills/update/SKILL.md`
- `packages/codex-adapter/skills/update/TEMPLATE.json`
- `packages/codex-adapter/skills/update/non-claw-fallback.md`
- `packages/codex-adapter/skills/update/CONTENT-COVERAGE.md`
- `packages/dsh-adapter/skills/update/SKILL.md`
- `packages/dsh-adapter/skills/update/TEMPLATE.json`
- `packages/dsh-adapter/skills/update/non-claw-fallback.md`
- `packages/dsh-adapter/skills/update/references/desktop-profile-write-boundary.md`
- `packages/opencode-adapter/skills/update/SKILL.md`
- `packages/opencode-adapter/skills/update/TEMPLATE.json`
- `packages/opencode-adapter/skills/update/non-claw-fallback.md`
- `packages/opencode-adapter/skills/update/CONTENT-COVERAGE.md`
- [Skill assembler](<../../../scripts/skill-artifacts.mjs>)
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
- `adapter-owned update inputs`
- `Codex update official marketplace`
- `existing-plan template-version handoff`
- `matching published CLI remaining mutations`
- `filtered shallow fetch`
- `index-pack stall recovery`
- `OpenCode update maintained installer`
- `DSH update profile plugin`
- `DSH desktop profile write boundary`
- `plugin_manager install_bundle`
- `profile managed exclusively by the Electron application`
- `ELECTRON_RUN_AS_NODE packaged desktop CLI`
- `registry release-age quarantine`
- `Host restart activation proof`
- `update plan survives Host restart`

<!-- state: history -->
## Evolution history

<!-- dated: 2026-10-10 -->
### Verified DSH desktop update and activation for 0.2.50

The DSH desktop profile was updated through its plugin manager from `@veewo/dsh-claw-kit@0.2.49-rc.0` to `0.2.50-rc.0`; the global `@veewo/claw` was already at published `0.2.50`, so no CLI reinstall was needed. After the owner explicitly authorized changing the desktop profile's `minimumReleaseAge` policy from 1440 minutes to 0 to permit installation, the plugin manager reported installation success and restart-required. Following Host restart, a real DSH session recovered workflow state through `claw_run`; the installed bundle version and required runtime skills, including `feature-architecture` and `knowledge-capture`, were verified. This records activation evidence for this update, not a claim about the machine's future installed version.

<!-- dated: 2026-10-02 -->
### Verified the Electron-managed DSH desktop profile write boundary

The DSH Desktop app (`@deepseek-ai/dsh-desktop` `0.2.0-rc.2`, bundled pnpm `11.7.0`) reserves its `desktop` profile. The installed global `dsh` on `PATH` (`0.1.5-rc.2`) rejects every operation on that profile with `error: profile "desktop" is managed exclusively by the Electron application`, including `dsh plugin --profile desktop …`; its packaged CLI is the only entry that permits package operations, and only because it forwards `manageDesktopProfile: true` into the shared launcher while continuing to refuse `--profile desktop --dump-config`. The supported agent path is therefore the profile's own plugin manager: `plugin_manager(action: install_bundle, target: <exact spec, absolute package path, or tarball>)`, which is the same service as the in-app Plugins page, uses the app runtime's pnpm, and rolls `package.json` and the lockfile back on failure. This round installed `@veewo/dsh-claw-kit@0.2.42-rc.0` from the repository tarball into `desktop` with `application: restart-required`; `list_bundles` reported the new version and the `claw-kit` row, while the running Host kept the `0.2.41.0` module in memory. A local path or tarball also bypasses the profile's `minimumReleaseAge: 1440` registry quarantine, which a just-published registry version would otherwise hit. Direct profile file writes remain invalid: they bypass bundle reconciliation and rollback. This is installation evidence only; activation still waits for an authorized restart and a real session.

<!-- dated: 2026-08-01 -->
### Hardened the official Codex install path with real Windows evidence

The `0.2.6.0` maintenance refresh found three gaps that candidate and marketplace tests had not exposed: early PowerShell pipeline closure made a successful `git ls-remote` look failed, official activation left a local identity enabled, and the cache payload omitted `assets/icon.png`. The installer now resolves refs without an early-closing pipe, disables local identities, and copies assets; the completed refresh compared all `27/27` official source and cache files. Restarting Codex and starting a new task remains a separate loaded-runtime check.

<!-- dated: 2026-09-14 -->
### Re-verified the DSH update activation boundary

The DSH web profile was refreshed to global `@veewo/claw@0.2.38` and `@veewo/dsh-claw-kit@0.2.38-rc.0`. After a Host restart, `claw_run(operation: context)` recovered the original update plan in a real session and the session exposed the seven required bundled skills plus `feature-architecture`. This installation round confirms the same published-source, profile-row, restart, and loaded-session activation boundary; it does not turn the separate `0.2.38.0` release record into installation evidence.

<!-- dated: 2026-09-16 -->
### Re-verified DSH web-profile activation for 0.2.39-rc.2

The DSH web profile was updated to `@veewo/dsh-claw-kit@0.2.39-rc.2` from the npm registry. After restarting the DSH Host, the real session restored its active subplan through `claw_run`, retained the `claw-kit` profile configuration row, and exposed all seven bundled skills. This is version-bound activation evidence, not a claim that the then-published package remains the current adapter version.

<!-- dated: 2026-09-29 -->
### Verified a GitHub-source DSH update and knowledge route smoke test

An authorized local update built the global CLI/core/client `0.2.40` and DSH web-profile adapter `0.2.40-rc.0` from the immutable GitHub `v0.2.40` source without publishing to npm. After a user-managed Host restart, a real web session ran `claw_run(context)` and reached the new daemon through `claw_run(knowledge.claim)`: a nonexistent finalization ID returned job unavailable rather than unsupported operation. This establishes version-bound installation and route activation, not a completed real-job assignment/finalization loop or a claim about the machine’s future installed version.
