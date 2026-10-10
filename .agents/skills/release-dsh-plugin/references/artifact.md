# DSH adapter release contract

## Candidate preparation versus promotion

Each new installable candidate allocates a fresh formal target number under this artifact family’s existing three-/four-segment rules; local unpublished/preparing candidates count as used. Use `beta:prepare -- --artifacts <selected-families>`, commit the prepared manifests locally, then `beta:pack -- --candidate <directory>`. No beta suffix is added. A failed same-input preparation may resume; a frozen candidate is reused, not rebuilt.

A tested candidate aligned with the target CLI base takes precedence over bump/build/export instructions below: promotion preserves its exact version and frozen tgz/tree, consumes the candidate hash and trial, and performs zero workspace rebuild/pack/export. DSH npm mapping remains `<cli-base>-rc.<N>` in both testing and formal publication. Formal release authority does not arise from candidate preparation. See `docs/beta-release.md` for the shared contract.


- Scope: `packages/dsh-adapter` only, published as `@veewo/dsh-claw-kit` on
  the npm registry. There is no separate marketplace repository or archive.
- Version: `<cli-base>.<next-fourth-segment>` in git; derive only the fourth
  segment from prior `vdsh-<cli-base>.*` tags. Never carry the first three
  segments from an older tag.
- **npm version mapping (learned 2026-08-22):** npm has no four-segment release
  version. Publishing the git version directly re-parses it as a wrong
  prerelease (`0.2.25.0` → `0.2.2-5.0`) and publishes that as `latest`. Always
  publish through `npm run publish:dsh-plugin -- --candidate <directory> --publish`, which stages the npm
  prerelease spelling `<cli-base>-rc.<n>` (`0.2.25-rc.0`) and tags it `latest`.
  The git tag stays the four-segment `vdsh-<cli-base>.<n>`.
- Bump only the adapter fourth segment; keep CLI/core and other adapters
  unchanged.
- Verify: run `npm run check:template-versions` to verify every built-in skill
  package with `TEMPLATE.json` matches `TEMPLATE_DRIVER_VERSION`; then run
  `npm run build/test/check -w @veewo/dsh-claw-kit`, then
  `npm run publish:dsh-plugin` (dry run) — the tarball must contain `lib/`,
  `skills/`, and `cordis.patch.yml` and no build junk, and its staged version
  must equal the npm mapping.
- Promotion: require clean local main at the tested sourceRevision and no remote divergence; publish with --candidate, verify registry retrieval, then complete the authorized source push and immutable vdsh tag. Require HEAD == origin/main at completion.
- A wrong-version publish cannot be removed with a granular token
  (bypass-2FA tokens cannot unpublish, E403); it lingers as a non-`latest`
  version. Publish the corrected version with `--tag latest`.
- The published npm package is the artifact; `export:dsh-plugin` additionally
  produces a local tarball for profile installs.
- **Tag completeness rule:** every published npm version must have a matching
  immutable `vdsh-<version>` git tag at the exact published commit. If a
  previous release published npm `<cli-base>-rc.<n>` but left the `vdsh-*`
  tag missing (learned 2026-08-22: `0.2.25-rc.8` was on npm before
  `vdsh-0.2.25.8` existed), backfill the missing tag on the release commit
  during the next release pass, before tagging the new version. Never repoint
  or force-move an existing tag.
- Profile delivery is a separate required checkpoint for a release targeting
  a known DSH profile: after npm visibility, install the exact published npm
  version into that profile. A non-Electron target accepts
  `dsh plugin --profile web add @veewo/dsh-claw-kit@<npm-version>` (substitute
  the authorized target). The Electron-managed `desktop` profile does not: the
  global `dsh` refuses it with `profile "desktop" is managed exclusively by the
  Electron application`, so use
  `plugin_manager(action: "install_bundle", target: "@veewo/dsh-claw-kit@<npm-version>")`
  or the exported/released tarball path instead, then confirm the new version
  through `plugin_manager(action: "list_bundles")`. Never write Electron-managed
  profile files with Agent filesystem tools, scripts, or shell commands; the
  canonical boundary is
  `packages/dsh-adapter/skills/update/references/desktop-profile-write-boundary.md`.
  If the target is unknown, ask; do not silently skip installation or install
  from workspace files. Verify installed `package.json`, `claw --version`
  compatibility (`--host dsh`), and — for profiles that command accepts — the
  `claw-kit` row in `dsh --profile <name> --dump-config`.
- Installation does not activate a running Host. Restart requires separate
  explicit authorization; if the owner will restart, report on-disk checks
  and defer runtime verification. After restart, verify `claw_run` and the
  seven bundled skills. An explicitly package-only release may stop at
  npm/tag verification.
