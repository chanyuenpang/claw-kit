# Artifact-specific plugin release and Cindy update

<!-- state: current -->
## Current behavior

- `release-claw-kit` is a router only. It selects one artifact-specific release skill and does not itself edit versions, package, publish, install, or combine release acceptance across artifact families.
- Repository-maintainer release ownership is split by artifact family: `release-claw-cli` owns the npm CLI/core/client release line; `release-codex-plugin`, `release-dsh-plugin`, `release-cindy-plugin`, `release-openclaw-plugin`, and `release-opencode-plugin` own their respective versioned plugin artifacts. `release-dsh-plugin` owns DSH adapter source and publication, with delivery of that published package to a known authorized DSH profile; it does not own CLI/core or another adapter release.
- A multi-family request creates independent parent tasks or subplans. Naming a platform does not select the CLI flow, and package-only validation continues to use `test-claw-kit` rather than any release skill.
- For a DSH release targeting a known authorized profile, publish from clean committed `main` source and confirm the exact npm version is available before installing that published version into the target profile. Verify the installed package version, compatible published CLI base, and `claw-kit` dump-config row. An unknown target requires clarification; a workspace build or unpinned `latest` is not profile-delivery evidence. Profile installation changes disk state only: the running DSH Host needs separately authorized restart and subsequent real-session `claw_run` verification before activation can be claimed. See `packages/dsh-adapter/RELEASING.md` and `.agents/skills/release-dsh-plugin/`.
- Cindy source is main-repository-owned under [its package](<../../../packages/cindy-adapter/>), no longer an independent submodule worktree. Its existing claw-kit-cindy-adapter remote is the artifact-only marketplace delivery target, preserving the market URL. The migration preserved the original Git database/link backup and did not publish or rewrite remote history.
- An authorized Cindy release reviews source, assembles a detached complete marketplace with [the builder](<../../../scripts/cindy-plugin-artifact.mjs>), and publishes its ./plugin tree to the artifact remote with a matching manifest version and vcindy-* tag. Source commit, artifact commit and activated host version are separate evidence. It never publishes npm, a .cindy archive or a GitHub Release, nor changes another adapter version. Cindy packages the marketplace payload locally during install/update.
- Cindy intentionally exposes no claw-kit `update` skill. Existing workflow entries remain available, and the complete claw-kit-doc package routes using the actual host rather than pruning content for Cindy; shared entry/package ownership is defined by [shared-source Truth](<shared-planning-skill-source.md>). Users update from the UI: Plugins → Market → Installed Markets → refresh the market source, then return to Plugins and confirm the claw-kit update.
- Refreshing the Cindy marketplace source only updates available source metadata. It is not installation proof; the separate plugin-page update remains user-confirmed, and the flow must not download or open a `.cindy` archive.

## Maintenance anchors

- `.agents/skills/release-claw-kit/SKILL.md`
- `.agents/skills/release-claw-cli/`
- `.agents/skills/release-codex-plugin/`
- `.agents/skills/release-dsh-plugin/`
- `.agents/skills/release-cindy-plugin/`
- `.agents/skills/release-openclaw-plugin/`
- `.agents/skills/release-opencode-plugin/`
- [Documentation source](<../../../.agents/skills/claw-kit-doc/references/update.md>)

<!-- state: history -->
## Evolution history

<!-- dated: 2026-09-28 -->
### DSH 0.2.39.3 and Cindy 0.2.39.1 independent releases

- DSH git version `0.2.39.3` was published as `@veewo/dsh-claw-kit@0.2.39-rc.3` and tagged `vdsh-0.2.39.3`; registry `latest` and tarball integrity, the immutable source tag, and remote commit were verified. Local release checks recorded DSH 77/77, Core 185/185, CLI 177 passed/18 skipped, plus repository/template checks and the final tarball dry-run.
- Cindy `0.2.39.1` was released from its independent marketplace source with immutable tag `vcindy-0.2.39.1` and verified remote commit; 36/36 focused tests passed. Both repositories ended clean on `main`. This release did not publish CLI or Codex. At release completion, neither the Cindy runtime nor DSH profile had been installed or updated; no DSH Host restart occurred.
- A subsequent delivery follow-up installed the already-published `@veewo/dsh-claw-kit@0.2.39-rc.3` into the existing DSH web profile, verified the pinned on-disk package and `claw-kit` dump-config row against compatible published CLI `0.2.39`, and updated the release guide, skill, template, artifact reference, and fallback to separate clean-source publication, exact-version profile delivery, and authorized restart. Commit `a278b65` was pushed with clean `main == origin/main`; no new npm version was published, and no DSH restart or post-restart runtime verification was claimed.

<!-- dated: 2026-08-31 -->
### CLI 0.2.34 与 Codex 0.2.34.0 release

- CLI/Core/Client `0.2.34` 已通过 npm 发布，并以 immutable `v0.2.34` GitHub Release 完成核验。Codex `0.2.34.0` 已从 committed official marketplace source 发布为 immutable `vcodex-0.2.34.0` GitHub Release。
- 两条 artifact 线在同一主仓提交 `5f8a599` 结束；本轮另有明确证据表明全局 CLI 与官方 `claw-kit@claw-kit` Codex plugin 都已更新，未对 Cindy 或其他平台 profile 作出安装断言。

<!-- dated: 2026-08-31 -->
### Cindy 0.2.33.0 release

- Cindy `0.2.33.0` was released from independent marketplace `main` commit `3d25875` with immutable tag `vcindy-0.2.33.0`; 32 focused tests passed.
- The `claw-kit-cindy` marketplace entry remained on `./plugin`. No `.cindy` archive or GitHub Release was published, and the completed release does not assert a local installation refresh.

<!-- dated: 2026-08-28 -->
### CLI 0.2.32, Codex 0.2.32.0, and DSH 0.2.32.0 release batch

- CLI/Core/Client `0.2.32` was published through npm with immutable tag `v0.2.32` and a public GitHub Release. Codex `0.2.32.0` was released from committed marketplace source with immutable tag `vcodex-0.2.32.0` and a zero-asset GitHub Release.
- DSH released immutable source tag `vdsh-0.2.32.0`; its npm package was published as `@veewo/dsh-claw-kit@0.2.32-rc.0`. All three tags resolve to main-repository commit `ca5ceaa`, and the completed batch does not assert a local CLI, Codex plugin, or DSH profile refresh.

<!-- dated: 2026-09-14 -->
### DSH 0.2.38.0 release

- The DSH adapter git version `0.2.38.0` was released as npm `@veewo/dsh-claw-kit@0.2.38-rc.0` and tagged `vdsh-0.2.38.0`; template compatibility, focused build/test/type-check, dry-run, tarball, exact-source, and registry checks were completed.
- The registry recorded `0.2.38-rc.0` as `latest`; no live DSH Web profile installation or Host restart was authorized or asserted.

<!-- dated: 2026-09-03 -->
### DSH 0.2.37.1 release

- The DSH adapter git version `0.2.37.1` was released as npm `@veewo/dsh-claw-kit@0.2.37-rc.1` with source tag `vdsh-0.2.37.1`; template compatibility, focused build/test/type-check, dry-run, exact-source, registry retrieval, and tarball verification were completed.
- The completion evidence recorded the registry `latest` tag at `0.2.37-rc.1` and a clean main-repository boundary; no local DSH Web profile replacement or Host restart was authorized or asserted.


## Search terms

- `artifact-specific release skill`
- `release-cindy-plugin`
- `Cindy custom Git marketplace`
- `claw-kit-cindy marketplace entry`
- `Cindy update local packaging`
