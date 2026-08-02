# Artifact-specific plugin release and Cindy update

## Status

Accepted working truth for the current repository-maintainer release surfaces and the Cindy user update surface.

<!-- state: current -->
## Core facts

- `release-claw-kit` is a router only. It selects one artifact-specific release skill and does not itself edit versions, package, publish, install, or combine release acceptance across artifact families.
- Repository-maintainer release ownership is split by artifact family: `release-claw-cli` owns the npm CLI/core/client release line; `release-codex-plugin`, `release-cindy-plugin`, `release-openclaw-plugin`, and `release-opencode-plugin` own their respective versioned plugin artifacts.
- A multi-family request creates independent parent tasks or subplans. Naming a platform does not select the CLI flow, and package-only validation continues to use `test-claw-kit` rather than any release skill.
- `release-cindy-plugin` is scoped to `packages/cindy-adapter` and `vcindy-*` GitHub Releases. It never publishes npm packages or changes another adapter version.
- A Cindy release builds and verifies the target `.cindy` installer before deleting old local build outputs. Cleanup is non-recursive and limited to matching files in the plugin source directory; it retains the target and, when available, the numerically greatest lower version as the one rollback package.
- A Cindy GitHub Release is complete only when it contains the matching immutable `.cindy` installer asset. Installing that asset is a separate, explicitly requested boundary.
- The Cindy `update` skill resolves the newest stable official `vcindy-*` GitHub Release numerically and requires a `.cindy` asset whose filename and embedded `ghost.json` version match the tag. It must not use the repository-wide `releases/latest` shortcut, GitHub `main`, a marketplace snapshot, or a workspace package.
- Cindy update refreshes the published global CLI first and the selected Cindy installer second. Success requires the installed `claw-kit` plugin at the selected version to be enabled and running; download or cache presence alone is not installation proof.

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
### Codex 0.2.7.1 asset-free marketplace release

- `vcodex-0.2.7.1` was published as an immutable public GitHub Release from commit `ff377b6f33c93c192a66874286b2883e657d745c`. The Codex adapter package and `.codex-plugin/plugin.json` both carry `0.2.7.1`.
- This release deliberately contains no ZIP asset, preserving the Codex marketplace-source boundary. It does not imply npm publication or a Cindy artifact release.

## Search terms

- `artifact-specific release skill`
- `release-cindy-plugin`
- `vcindy GitHub Release asset`
- `Cindy rollback package retention`
- `Cindy update matching cindy asset`
