# Releasing the DSH claw-kit plugin

`@veewo/dsh-claw-kit` is published to the npm registry; a DSH profile installs
it with `dsh plugin --profile <name> add @veewo/dsh-claw-kit` and activates it
on the next Host restart. Distribution is the npm package — there is no separate
marketplace repository or ZIP artifact.

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

2. **Run the focused adapter checks:**
   ```powershell
   npm run build -w @veewo/dsh-claw-kit
   npm test -w @veewo/dsh-claw-kit
   npm run check -w @veewo/dsh-claw-kit
   ```

3. **Publish the package** (this is the ONLY supported publish path):
   ```powershell
   npm run publish:dsh-plugin            # dry run: builds, tests, stages, packs
   npm run publish:dsh-plugin -- --publish   # publish with version mapping
   ```
   The script maps `<cli-base>.<n>` → npm `<cli-base>-rc.<n>`, verifies the
   tarball contains `lib/`, `skills/`, and `cordis.patch.yml` (no build junk),
   and publishes with `--tag latest`. The first publication of a new
   `<cli-base>` needs npm access for the `@veewo` scope.

4. **Commit, push, and tag.** Commit the intended adapter changes on `main`,
   push `origin/main`, then create and push the immutable tag at that exact
   commit:
   ```powershell
   git tag vdsh-<version>
   git push origin vdsh-<version>
   ```

5. **Verify in a real DSH profile.** From an environment whose CLI carries the
   `dsh` host support:
   ```powershell
   dsh plugin --profile web add @veewo/dsh-claw-kit
   # restart the Host, then confirm:
   # - the claw_run tool appears in the tool list
   # - the seven bundled skills (using-claw-kit/researcher/planning/config/
   #   create-claw-skill/claw-kit-doc/update) appear in the skill catalog
   # - a project plan completes and its knowledgeDispatch is auto-dispatched
   ```
   Version alignment: the adapter and the installed CLI are one validation
   unit — the CLI must accept `--host dsh` (SUPPORTED_CLAW_HOSTS includes
   `dsh`).

## Versioning rule

The adapter shares the CLI's first three segments and owns only the fourth:
`<cli-base>.<n>`. `0.2.21.14` means CLI base `0.2.21`, adapter revision 14.
Bumping the CLI base (e.g. to `0.2.22`) starts a new adapter line at
`0.2.22.0`.

The git version is always the four-segment `<cli-base>.<n>` (tagged
`vdsh-<cli-base>.<n>`); the npm version is the mapped prerelease
`<cli-base>-rc.<n>`. They are two spellings of the same release — never publish
the four-segment spelling directly.
