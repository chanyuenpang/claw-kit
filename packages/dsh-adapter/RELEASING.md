# Releasing the DSH claw-kit plugin

`@veewo/dsh-claw-kit` is published to the npm registry. A release to a known
DSH profile also installs that exact published npm version there; installation
updates the profile on disk but activation waits for the next Host restart.
Distribution is the npm package — there is no marketplace repository or ZIP.

> **npm version caveat (learned 2026-08-22):** npm/semver has no four-segment
> release version. Publishing a `package.json` whose version is `<cli-base>.<n>`
> (e.g. `0.2.25.0`) does NOT fail — npm silently re-parses it as a prerelease of
> the first three segments (`0.2.25.0` → `0.2.2-5.0`) and publishes THAT as
> `latest`. Always publish through `npm run publish:dsh-plugin`, which stages a
> tarball whose package.json carries the npm-legal prerelease spelling
> `<cli-base>-rc.<n>` (`0.2.25.0` → `0.2.25-rc.0`) while the git tag stays the
> four-segment `vdsh-0.2.25.0`. Never run bare `npm publish -w @veewo/dsh-claw-kit`.
>
> A mistakenly published wrong-version tarball cannot be removed with a
> granular token (bypass-2FA tokens cannot `unpublish`, E403); it lingers as a
> non-`latest` version. Publish the corrected version with
> `--tag latest` so consumers resolve the intended release.

1. **Resolve the CLI base version before editing.** For a multi-artifact
   release, use its authorized CLI candidate; for a dsh-only release, use the
   current published `@veewo/claw` version. Set `package.json` to
   `<cli-base>.<next-fourth-segment>`. Derive only the fourth segment from prior
   `vdsh-<cli-base>.*` tags; never carry forward the first three segments from an
   older `vdsh-*` tag.

2. **Run local checks before upload:**
   ```powershell
   npm run check:template-versions
   npm run build -w @veewo/dsh-claw-kit
   npm test -w @veewo/dsh-claw-kit
   npm run check -w @veewo/dsh-claw-kit
   npm run publish:dsh-plugin  # dry run: builds, tests, stages, packs
   ```
   The dry-run tarball must contain `lib/`, `skills/`, and
   `cordis.patch.yml` without build junk; the staged npm version must be
   `<cli-base>-rc.<n>`. Never run bare `npm publish -w`.

3. **Pass the exact-source gate before publishing.** Classify all worktree
   changes, commit intended content on `main`, push `origin/main`, and require
   an empty `git status --porcelain` with `HEAD == origin/main`. Do not stash
   unrelated work to bypass this gate.

4. **Publish and tag the immutable source:**
   ```powershell
   npm run publish:dsh-plugin -- --publish
   $gitVersion = (Get-Content .\packages\dsh-adapter\package.json | ConvertFrom-Json).version
   git tag -a "vdsh-$gitVersion" -m "DSH plugin $gitVersion"
   git push origin "vdsh-$gitVersion"
   ```
   The publish script enforces the clean-source gate, maps the four-segment
   git version to the npm prerelease spelling, and publishes with `latest`.
   Verify the npm registry actually serves the exact version and `latest`
   points to it (npm may initially report asynchronous processing), then
   verify the remote tag resolves to the published commit.

5. **Install the published package into the known target profile.** A source
   release is not a profile update. Use the exact npm version, not an
   unpublished workspace build or an unpinned `latest` resolution. For the
   existing `web` profile, for example (replace both profile and version for
   another authorized target):
   ```powershell
   $gitVersion = (Get-Content .\packages\dsh-adapter\package.json | ConvertFrom-Json).version
   $parts = $gitVersion.Split('.')
   $npmVersion = "$($parts[0]).$($parts[1]).$($parts[2])-rc.$($parts[3])"
   claw --version  # must match the published CLI base and support --host dsh
   dsh plugin --profile web add "@veewo/dsh-claw-kit@$npmVersion"
   (Get-Content "$HOME\.dsh\profiles\web\node_modules\@veewo\dsh-claw-kit\package.json" | ConvertFrom-Json).version
   dsh --profile web --dump-config  # confirm the claw-kit plugin row
   ```
   Install only when the target profile is known and profile delivery is
   authorized; ask which profile otherwise. If the installed CLI is behind
   the published CLI base, update and verify it before the adapter install.
   Record peer-dependency warnings rather than changing unrelated packages.

6. **Leave activation to the Host owner unless restart is separately
   authorized.** Installing changes files on disk, not the already-running
   DSH Web process. Do not restart it or claim the live GUI uses the new
   adapter merely because the package and dump-config look correct. After
   the owner restarts, verify a real session mounts `claw_run`, the bundled
   skills are present, and a project plan dispatches knowledge as expected.
   Until that restart, report only the installed version and deferred
   runtime verification.

## Versioning rule

The adapter shares the CLI's first three segments and owns only the fourth:
`<cli-base>.<n>`. `0.2.21.14` means CLI base `0.2.21`, adapter revision 14.
Bumping the CLI base (e.g. to `0.2.22`) starts a new adapter line at
`0.2.22.0`.

The git version is always the four-segment `<cli-base>.<n>` (tagged
`vdsh-<cli-base>.<n>`); the npm version is the mapped prerelease
`<cli-base>-rc.<n>`. They are two spellings of the same release — never publish
the four-segment spelling directly.
