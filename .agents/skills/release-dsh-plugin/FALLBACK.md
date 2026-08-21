# Release DSH adapter — fallback route (no claw planning)

If claw planning is unavailable, follow the documented release steps directly:

1. Resolve the CLI base version (authorized candidate or current published
   `@veewo/claw`); set `packages/dsh-adapter/package.json` to
   `<cli-base>.<next-fourth-segment>` from prior `vdsh-<cli-base>.*` tags.
2. Verify:
   `npm run build/test/check -w @veewo/dsh-adapter`.
3. Publish:
   `npm run publish:dsh-plugin` (dry run) → review the tarball → with release
   authority `npm run publish:dsh-plugin --publish`.
4. Commit on `main`, push `origin/main`, tag `vdsh-<version>`, push the tag.
5. Verify the published package installs in a real DSH profile
   (`dsh plugin --profile web add @veewo/dsh-adapter`, restart, claw_run +
   bundled skills present).
