# DSH adapter release contract

- Scope: `packages/dsh-adapter` only, published as `@veewo/dsh-claw-kit` on
  the npm registry. There is no separate marketplace repository or archive.
- Version: `<cli-base>.<next-fourth-segment>` in git; derive only the fourth
  segment from prior `vdsh-<cli-base>.*` tags. Never carry the first three
  segments from an older tag.
- **npm version mapping (learned 2026-08-22):** npm has no four-segment release
  version. Publishing the git version directly re-parses it as a wrong
  prerelease (`0.2.25.0` → `0.2.2-5.0`) and publishes that as `latest`. Always
  publish through `npm run publish:dsh-plugin --publish`, which stages the npm
  prerelease spelling `<cli-base>-rc.<n>` (`0.2.25-rc.0`) and tags it `latest`.
  The git tag stays the four-segment `vdsh-<cli-base>.<n>`.
- Bump only the adapter fourth segment; keep CLI/core and other adapters
  unchanged.
- Verify: `npm run build/test/check -w @veewo/dsh-claw-kit`, then
  `npm run publish:dsh-plugin` (dry run) — the tarball must contain `lib/`,
  `skills/`, and `cordis.patch.yml` and no build junk, and its staged version
  must equal the npm mapping.
- Release: require clean `main`, `HEAD == origin/main`, publish with
  `npm run publish:dsh-plugin --publish`, then tag `vdsh-<version>`.
- A wrong-version publish cannot be removed with a granular token
  (bypass-2FA tokens cannot unpublish, E403); it lingers as a non-`latest`
  version. Publish the corrected version with `--tag latest`.
- The published npm package is the artifact; `export:dsh-plugin` additionally
  produces a local tarball for profile installs.
- Verify the release in a real DSH profile only when separately authorized:
  `dsh plugin --profile web add @veewo/dsh-claw-kit` + restart + `claw_run`
  tool and the six bundled skills present. The CLI must accept `--host dsh`.
