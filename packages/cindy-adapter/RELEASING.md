# Releasing the Cindy artifact

Source is owned by the main claw-kit repository under this package. The existing
`https://github.com/chanyuenpang/claw-kit-cindy-adapter.git` repository is the
artifact-only marketplace delivery target; users keep the same market URL.

1. With explicit release authorization, resolve the CLI base: the authorized CLI candidate
   for a coordinated release, or published `@veewo/claw` version for Cindy-only delivery.
   Set source package and Ghost manifests to `<cli-base>.<next-fourth-segment>`; this is
   not a separate three-segment version line.
2. Review and commit intended source on main, preserving unrelated work. Run focused
   tests from the main repository, including `scripts/cindy-plugin-artifact.test.mjs`.
3. Build from that exact source revision into a fresh isolated directory:
   `npm run export:cindy-plugin -- --output-root <artifact-root>`. The output contains
   the marketplace catalog, `plugin/` without public skill files or registrations,
   and input/payload provenance. Private `node/shared-skills.json` identifies the
   independent package and tested minimum, not an exact global snapshot. The trusted
   plugin initializer uses existing Node capabilities; the npm package remains
   data-only. There is no bundled skill registration or user-facing install tool.
   Build the shared artifact from the same source revision with
   `npm run export:shared-skills -- <fresh-shared-root>`, pack and freeze it alongside
   the plugin. The shared package currently reuses the standard seven-skill inputs.
   Publishing this additional npm artifact requires explicit scope authorization;
   existing release scripts do not automatically publish it. Never publish the plugin
   until the matching frozen skill tarball has been published and retrieved/verified.
   Any changed skill bytes require a new shared package version and plugin candidate.
4. Verify the detached artifact; never restore generated skills inside this source tree.
   In a separately authorized publication checkout of the existing artifact repository,
   deliver only this complete assembled tree (excluding the checkout's own .git).
   Review removals as well as additions, commit/push artifact main, and create the
   immutable `vcindy-<version>` tag at that artifact commit. Keep source revision and
   artifact hash in release evidence. Never force-move an existing tag.
5. Only when installation/update is authorized, refresh Cindy Installed Markets, return
   to Plugins, review permissions and update `claw-kit`. Verify installed/enabled/running
   separately. Restart needs its own authorization.

The marketplace payload remains `plugin/`; no `.cindy` archive or GitHub Release
is needed for marketplace installation. The public skills are a separate npm
artifact, prepared automatically by the plugin at resident startup through
existing Cindy APIs. Do not modify/publish Cindy or invent a new Host compatibility
floor. Confirm startup preparation success, ordinary workflow behavior during a
failed/pending preparation, non-downgrade and fresh-session skill loading before
delivery. Market-install success alone is not preparation/loading evidence. Source ref and artifact
ref are different: do not require artifact HEAD to equal the main source commit.
Building/exporting alone never authorizes commit, push, remote creation or installation.
