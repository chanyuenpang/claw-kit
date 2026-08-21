# DSH adapter release contract

- Scope: `packages/dsh-adapter` only, published as `@claw-kit/dsh-adapter` on
  the npm registry. There is no separate marketplace repository or archive.
- Version: `<cli-base>.<next-fourth-segment>`; derive only the fourth segment
  from prior `vdsh-<cli-base>.*` tags. Never carry the first three segments from
  an older tag.
- Bump only the adapter fourth segment; keep CLI/core and other adapters
  unchanged.
- Verify: `npm run build/test/check -w @claw-kit/dsh-adapter`, then
  `npm run publish:dsh-plugin` (dry run) — the tarball must contain `lib/`,
  `skills/`, and `cordis.patch.yml` and no build junk.
- Release: require clean `main`, `HEAD == origin/main`, publish with
  `npm run publish:dsh-plugin --publish`, then tag `vdsh-<version>`.
- The published npm package is the artifact; `export:dsh-plugin` additionally
  produces a local tarball for profile installs.
- Verify the release in a real DSH profile only when separately authorized:
  `dsh plugin --profile web add @claw-kit/dsh-adapter` + restart + `claw_run`
  tool and the six bundled skills present. The CLI must accept `--host dsh`.
