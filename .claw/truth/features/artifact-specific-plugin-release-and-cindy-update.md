# Artifact-specific plugin release and Cindy update

<!-- state: current -->
## Current behavior

- `release-claw-kit` is a router only. It selects one artifact-specific release skill and does not itself edit versions, package, publish, install, or combine release acceptance across artifact families.
- Repository-maintainer release ownership is split by artifact family: `release-claw-cli` owns the npm CLI/core/client release line; `release-codex-plugin`, `release-dsh-plugin`, `release-cindy-plugin`, `release-openclaw-plugin`, and `release-opencode-plugin` own their respective versioned plugin artifacts. `release-dsh-plugin` owns only `packages/dsh-adapter` and the published `@veewo/dsh-claw-kit` npm package.
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
- `.agents/skills/release-dsh-plugin/`
- `.agents/skills/release-cindy-plugin/`
- `.agents/skills/release-openclaw-plugin/`
- `.agents/skills/release-opencode-plugin/`
- `packages/cindy-adapter/plugin/skills/claw-kit-doc/references/update.md`

<!-- state: history -->
## Evolution history

<!-- dated: 2026-08-31 -->
### Cindy 0.2.33.0 release

- Cindy `0.2.33.0` was released from independent marketplace `main` commit `3d25875` with immutable tag `vcindy-0.2.33.0`; 32 focused tests passed.
- The `claw-kit-cindy` marketplace entry remained on `./plugin`. No `.cindy` archive or GitHub Release was published, and the completed release does not assert a local installation refresh.

<!-- dated: 2026-08-28 -->
### CLI 0.2.32, Codex 0.2.32.0, and DSH 0.2.32.0 release batch

- CLI/Core/Client `0.2.32` was published through npm with immutable tag `v0.2.32` and a public GitHub Release. Codex `0.2.32.0` was released from committed marketplace source with immutable tag `vcodex-0.2.32.0` and a zero-asset GitHub Release.
- DSH released immutable source tag `vdsh-0.2.32.0`; its npm package was published as `@veewo/dsh-claw-kit@0.2.32-rc.0`. All three tags resolve to main-repository commit `ca5ceaa`, and the completed batch does not assert a local CLI, Codex plugin, or DSH profile refresh.

<!-- dated: 2026-08-24 -->
### Codex 0.2.27.1, DSH 0.2.27.1, and Cindy 0.2.27.0 release batch

- Codex `0.2.27.1` was released from the main-repository marketplace source with immutable tag `vcodex-0.2.27.1` and a zero-asset GitHub Release.
- DSH released immutable git tag `vdsh-0.2.27.1`; its independently distributed npm package `@veewo/dsh-claw-kit@0.2.27-rc.1` was published as `latest`.
- Cindy `0.2.27.0` was released from its independent marketplace repository with immutable tag `vcindy-0.2.27.0` and source path `./plugin`; it has no archive or GitHub Release.
- Each artifact retained its own source and terminal acceptance contract. The main repository and Cindy repository finished clean on `main` and equal to `origin/main`; this batch does not assert a local installation refresh.

<!-- dated: 2026-08-20 -->
### Cindy 0.2.23.1 and Codex 0.2.23.2 release

- Cindy `0.2.23.1` was released from its independent marketplace `main` commit `595edd0` with immutable tag `vcindy-0.2.23.1`; 32 focused tests passed. It has no archive or GitHub Release.
- Codex `0.2.23.2` was released from the committed main-repository marketplace snapshot at `8384c5e` with immutable tag `vcodex-0.2.23.2` and a public zero-asset GitHub Release. Its 21 focused plugin/marketplace tests, template and shared-skill checks, and exact-source release gate passed.
- Both release lines completed with their own clean `main == origin/main` boundary. These versioned release facts do not assert a local installation refresh.

<!-- dated: 2026-08-20 -->
### 0.2.23 multi-artifact release batch

- CLI/Core/Client `0.2.23` was published through npm with `v0.2.23` and a public GitHub Release. Codex `0.2.23.1` was released from the committed main-repository marketplace snapshot with `vcodex-0.2.23.1` and a zero-asset GitHub Release. Cindy `0.2.23.0` was released from its independent marketplace `main` with `vcindy-0.2.23.0`, without an archive or GitHub Release.
- Each artifact retained its independent exact-source and terminal acceptance gate. The main repository and Cindy repository both finished clean on `main` and equal to `origin/main`; this release batch does not assert a local CLI or plugin installation refresh.

<!-- dated: 2026-08-20 -->
### 0.2.22 multi-artifact release batch

- CLI/Core/Client `0.2.22` was published through npm with `v0.2.22` and a public GitHub Release. Codex `0.2.22.1` was released from the committed main-repository marketplace snapshot with `vcodex-0.2.22.1` and a zero-asset GitHub Release. Cindy `0.2.22.0` was released from its independent marketplace `main` with `vcindy-0.2.22.0`, without an archive or GitHub Release.
- Each artifact retained independent source and acceptance evidence. This completed batch does not assert a local CLI or plugin installation refresh.

## Search terms

- `artifact-specific release skill`
- `release-cindy-plugin`
- `Cindy custom Git marketplace`
- `claw-kit-cindy marketplace entry`
- `Cindy update local packaging`
