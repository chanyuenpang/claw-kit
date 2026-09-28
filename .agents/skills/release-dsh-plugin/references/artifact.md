# DSH adapter release contract

- Scope: `packages/dsh-adapter` only, published as `@veewo/dsh-claw-kit` on
  the npm registry. There is no separate marketplace repository or archive.
- Version: `<cli-base>.<next-fourth-segment>` in git; derive only the fourth
  segment from prior `vdsh-<cli-base>.*` tags. Never carry the first three
  segments from an older tag.
- **npm version mapping (learned 2026-08-22):** npm has no four-segment release
  version. Publishing the git version directly re-parses it as a wrong
  prerelease (`0.2.25.0` → `0.2.2-5.0`) and publishes that as `latest`. Always
  publish through `npm run publish:dsh-plugin -- --publish`, which stages the npm
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
- Release: require clean `main`, `HEAD == origin/main`, publish with
  `npm run publish:dsh-plugin -- --publish`, then tag `vdsh-<version>`.
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
  version with `dsh plugin --profile web add
  @veewo/dsh-claw-kit@<npm-version>` (substitute the authorized target). If
  the target is unknown, ask; do not silently skip installation or install
  from workspace files. Verify installed `package.json`, `claw --version`
  compatibility (`--host dsh`), and the `claw-kit` row in
  `dsh --profile web --dump-config`.
- Installation does not activate a running Host. Restart requires separate
  explicit authorization; if the owner will restart, report on-disk checks
  and defer runtime verification. After restart, verify `claw_run` and the
  seven bundled skills. An explicitly package-only release may stop at
  npm/tag verification.
