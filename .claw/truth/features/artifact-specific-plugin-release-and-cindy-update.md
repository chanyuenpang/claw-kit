# Artifact-specific plugin release and Cindy update

## Status

Accepted working truth for the current repository-maintainer release surfaces and the Cindy user update surface.

<!-- state: current -->
## Core facts

- `release-claw-kit` is a router only. It selects one artifact-specific release skill and does not itself edit versions, package, publish, install, or combine release acceptance across artifact families.
- Repository-maintainer release ownership is split by artifact family: `release-claw-cli` owns the npm CLI/core/client release line; `release-codex-plugin`, `release-cindy-plugin`, `release-openclaw-plugin`, and `release-opencode-plugin` own their respective versioned plugin artifacts.
- A multi-family request creates independent parent tasks or subplans. Naming a platform does not select the CLI flow, and package-only validation continues to use `test-claw-kit` rather than any release skill.
- `release-cindy-plugin` is scoped to `packages/cindy-adapter`, the `claw-kit-cindy` repository-marketplace entry, and the `vcindy-*` tag. It never publishes npm packages or changes another adapter version.
- A Cindy release verifies the committed marketplace source tree and the tagged `ghost.json`; it does not build or upload a `.cindy` archive and does not create a GitHub Release. Cindy packages the marketplace source locally during install or update.
- The marketplace entry points at `packages/cindy-adapter/plugin`; a changed plugin requires a new manifest version before release, and the source/tag must reach `origin/main` before the tag is pushed.
- The Cindy `update` skill refreshes `chanyuenpang/claw-kit` as an unpinned custom Git marketplace source, then uses Cindy's confirmation-gated install/update action. It must not download or open a `.cindy` archive.
- Cindy update refreshes the published global CLI first and the marketplace plugin second. Success requires the installed `claw-kit` plugin at the selected version to be enabled and running; refreshed source/cache presence alone is not installation proof.

## Maintenance anchors

- `.agents/skills/release-claw-kit/SKILL.md`
- `.agents/skills/release-claw-cli/`
- `.agents/skills/release-codex-plugin/`
- `.agents/skills/release-cindy-plugin/`
- `.agents/skills/release-openclaw-plugin/`
- `.agents/skills/release-opencode-plugin/`
- `packages/cindy-adapter/plugin/skills/update/`

<!-- state: history -->
## Evolution history

<!-- dated: 2026-08-02 -->
### Cindy 0.2.8.2 moved distribution to the repository marketplace

- `vcindy-0.2.8.2` was published from clean `origin/main` with the tagged marketplace entry resolving `claw-kit-cindy` to the `0.2.8.2` plugin manifest.
- This release deliberately created neither a `.cindy` archive nor a GitHub Release. It replaces the former immutable-installer-asset path; the retained local `0.2.8.1`/`0.2.7.6` archives are historical artifacts, not the current distribution contract.

<!-- dated: 2026-08-02 -->
### 0.2.8 multi-artifact release

- The independently versioned release set was published and verified as CLI/Core/Client `0.2.8`, Codex `0.2.8.1`, and Cindy `0.2.8.1`.
- The current source records the dedicated release commits `41f95bf` (CLI preparation), `e7176d8` (Codex), `8432efd` (Cindy), and post-release local retention cleanup `c2f28d3`.
- Cindy's plugin source retains `claw-kit-0.2.8.1.cindy` and the single lower-version rollback package `claw-kit-0.2.7.6.cindy`; this is local artifact retention evidence, not an installation claim.

<!-- dated: 2026-08-02 -->
### Codex 0.2.7.1 asset-free marketplace release

- `vcodex-0.2.7.1` was published as an immutable public GitHub Release from commit `ff377b6f33c93c192a66874286b2883e657d745c`. The Codex adapter package and `.codex-plugin/plugin.json` both carry `0.2.7.1`.
- This release deliberately contains no ZIP asset, preserving the Codex marketplace-source boundary. It does not imply npm publication or a Cindy artifact release.

## Search terms

- `artifact-specific release skill`
- `release-cindy-plugin`
- `Cindy custom Git marketplace`
- `claw-kit-cindy marketplace entry`
- `Cindy update local packaging`
