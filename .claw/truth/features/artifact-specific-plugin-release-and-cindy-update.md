# Artifact-specific plugin release and Cindy update

## Status

Accepted working truth for the current repository-maintainer release surfaces and the Cindy user update surface.

<!-- state: current -->
## Core facts

- `release-claw-kit` is a router only. It selects one artifact-specific release skill and does not itself edit versions, package, publish, install, or combine release acceptance across artifact families.
- Repository-maintainer release ownership is split by artifact family: `release-claw-cli` owns the npm CLI/core/client release line; `release-codex-plugin`, `release-cindy-plugin`, `release-openclaw-plugin`, and `release-opencode-plugin` own their respective versioned plugin artifacts.
- A multi-family request creates independent parent tasks or subplans. Naming a platform does not select the CLI flow, and package-only validation continues to use `test-claw-kit` rather than any release skill.
- `release-cindy-plugin` is scoped to the checked-out `packages/cindy-adapter` independent marketplace repository, its `main`, and the `vcindy-*` tag. It never publishes npm packages or changes another adapter version.
- A Cindy release verifies the committed marketplace source tree and the tagged `ghost.json`; it does not build or upload a `.cindy` archive and does not create a GitHub Release. Cindy packages the marketplace source locally during install or update.
- The marketplace entry points at `packages/cindy-adapter/plugin`; a changed plugin requires a new manifest version before release, and the source/tag must reach `origin/main` before the tag is pushed.
- Cindy intentionally exposes no claw-kit `update` skill. Existing workflow entries remain available, and Cindy's adapter-owned `claw-kit-doc` entry selects the Cindy section from the shared documentation corpus. Users update from the UI: Plugins → Market → Installed Markets → refresh the market source, then return to Plugins and confirm the claw-kit update.
- Refreshing the Cindy marketplace source only updates available source metadata. It is not installation proof; the separate plugin-page update remains user-confirmed, and the flow must not download or open a `.cindy` archive.

## Maintenance anchors

- `.agents/skills/release-claw-kit/SKILL.md`
- `.agents/skills/release-claw-cli/`
- `.agents/skills/release-codex-plugin/`
- `.agents/skills/release-cindy-plugin/`
- `.agents/skills/release-openclaw-plugin/`
- `.agents/skills/release-opencode-plugin/`
- `packages/cindy-adapter/plugin/skills/claw-kit-doc/references/update.md`

<!-- state: history -->
## Evolution history

<!-- dated: 2026-08-10 -->
### 0.2.18 multi-artifact release batch

- CLI/Core/Client `0.2.18` was published through npm with `v0.2.18` and a
  GitHub Release. Codex `0.2.18.1` was released from the committed marketplace
  snapshot with `vcodex-0.2.18.1` and a zero-asset GitHub Release. Cindy
  `0.2.18.0` was released from its independent marketplace `main` with
  `vcindy-0.2.18.0` and no archive or GitHub Release.
- Each artifact line passed its required release checks, remote-reference
  verification, and clean-worktree gate. This batch is historical evidence and
  does not claim any local CLI or plugin installation was refreshed.

<!-- dated: 2026-08-09 -->
### 0.2.17 multi-artifact release batch

- CLI/Core `0.2.17`, Codex `0.2.17.1`, and Cindy `0.2.17.0` were released
  from verified exact source. The CLI/Core release used the CLI three-segment
  compatibility baseline; the Codex and Cindy releases retained their separate
  marketplace artifacts and release evidence.
- This batch is historical release evidence only. It does not assert that a
  maintainer's local CLI or installed plugin has been refreshed.

<!-- dated: 2026-08-06 -->
### 0.2.14 multi-artifact release batch

- CLI/Core/Client `0.2.14` was published through npm with `v0.2.14` and a
  GitHub Release; Codex `0.2.14.1` was released from the committed marketplace
  snapshot with `vcodex-0.2.14.1` and a zero-asset GitHub Release; Cindy
  `0.2.13.2` was released from its independent marketplace `main` with
  `vcindy-0.2.13.2` and no archive or GitHub Release.
- Each artifact line retained its own exact-source and acceptance evidence.
  These releases do not imply any local CLI or plugin refresh.

<!-- dated: 2026-08-05 -->
### Cindy removed its globally published update skill

- Cindy's skill slot is globally visible through `~/.agents/skills`, so its host-specific updater also appeared in standalone Codex. The `update` entry was removed; Cindy's adapter-owned `claw-kit-doc` entry now routes to the shared UI update reference without offering an executable updater. Other Cindy workflow entries were explicitly left outside this update-only scope.

<!-- dated: 2026-08-04 -->
### 0.2.11 independent artifact-family release set

- CLI/Core/Client `0.2.11` used npm plus `v0.2.11`; Cindy `0.2.11.1` used its independent marketplace `main` plus `vcindy-0.2.11.1` without an archive or GitHub Release; Codex `0.2.11.1` used the committed main-repository marketplace plus `vcodex-0.2.11.1` and a zero-asset GitHub Release.
- Each line reached its own clean pushed exact-source boundary. None of these release proofs asserts that a local CLI or installed plugin was refreshed or loaded.

<!-- dated: 2026-08-02 -->
### Cindy 0.2.8.2 moved distribution to the repository marketplace

- `vcindy-0.2.8.2` was published from clean `origin/main` with the tagged marketplace entry resolving `claw-kit-cindy` to the `0.2.8.2` plugin manifest.
- This release deliberately created neither a `.cindy` archive nor a GitHub Release. It replaces the former immutable-installer-asset path; the retained local `0.2.8.1`/`0.2.7.6` archives are historical artifacts, not the current distribution contract.

## Search terms

- `artifact-specific release skill`
- `release-cindy-plugin`
- `Cindy custom Git marketplace`
- `claw-kit-cindy marketplace entry`
- `Cindy update local packaging`
