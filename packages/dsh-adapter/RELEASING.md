# Releasing the DSH adapter

`@claw-kit/dsh-adapter` is published to the npm registry; a DSH profile installs
it with `dsh plugin --profile <name> add @claw-kit/dsh-adapter` and activates it
on the next Host restart. Distribution is the npm package — there is no separate
marketplace repository or ZIP artifact.

1. **Resolve the CLI base version before editing.** For a multi-artifact
   release, use its authorized CLI candidate; for a dsh-only release, use the
   current published `@veewo/claw` version. Set `package.json` to
   `<cli-base>.<next-fourth-segment>`. Derive only the fourth segment from prior
   `vdsh-<cli-base>.*` tags; never carry forward the first three segments from an
   older `vdsh-*` tag.

2. **Run the focused adapter checks:**
   ```powershell
   npm run build -w @claw-kit/dsh-adapter
   npm test -w @claw-kit/dsh-adapter
   npm run check -w @claw-kit/dsh-adapter
   ```

3. **Publish the package:**
   ```powershell
   npm run publish:dsh-plugin        # builds, tests, exports, and publishes
   # or step-by-step:
   npm publish -w @claw-kit/dsh-adapter
   npm run export:dsh-plugin         # local tarball for profile installs
   ```
   Verify the published tarball contains `lib/`, `skills/`, and
   `cordis.patch.yml` (and no build junk). The first publication of a new
   `<cli-base>` needs npm access for the `@claw-kit` scope.

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
   dsh plugin --profile web add @claw-kit/dsh-adapter
   # restart the Host, then confirm:
   # - the claw_run tool appears in the tool list
   # - the six bundled skills (using-claw-kit/researcher/planning/config/
   #   create-claw-skill/claw-kit-doc) appear in the skill catalog
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
