# Release DSH adapter — fallback route (no claw planning)

If claw planning is unavailable, follow the documented release steps directly:

1. Resolve the CLI base version (authorized candidate or current published
   `@veewo/claw`); set `packages/dsh-adapter/package.json` to
   `<cli-base>.<next-fourth-segment>` from prior `vdsh-<cli-base>.*` tags.
2. Verify every built-in templated skill with `npm run check:template-versions`.
3. Verify:
   `npm run build/test/check -w @veewo/dsh-claw-kit`.
4. Run `npm run publish:dsh-plugin` (dry run) and review the tarball.
5. Classify changes, commit on `main`, push `origin/main`, and require a clean
   worktree with `HEAD == origin/main`; do not stash to bypass this gate.
6. With release authority, run `npm run publish:dsh-plugin -- --publish`,
   verify the exact npm version is public, tag the matching commit
   `vdsh-<version>`, and push that immutable tag.
7. For a known authorized target profile, install the **exact published npm
   version** derived from `<cli-base>.<n>` as `<cli-base>-rc.<n>`
   (see `packages/dsh-adapter/RELEASING.md` step 5 for the pinned install
   command), then verify on-disk package.json,
   compatible `claw --version`, and the `claw-kit` row in
   `dsh --profile web --dump-config`. Ask when the profile is unknown.
   **Do not restart without separate explicit authorization.** A running
   Host is not verified merely by an on-disk install; after the owner restarts,
   verify `claw_run` and the bundled skills in a real session.
