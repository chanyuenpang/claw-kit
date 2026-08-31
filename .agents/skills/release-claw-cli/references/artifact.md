# CLI release contract

- Scope: root `package.json`, `packages/core`, `packages/cli`, shared CLI/runtime
  code, lockfile, synchronized templates/shared skills, and compatibility version
  resets required by the CLI baseline.
- Version: one three-segment version shared by root, `@veewo/claw-core`, and
  `@veewo/claw`. Pin core exactly from CLI and OpenClaw.
- **Version selection rule:** unless the owner explicitly names a version, the
  CLI release bumps the third segment by one minor over the currently published
  `@veewo/claw` (e.g. published 0.2.25 → 0.2.26). Never guess a major/minor
  jump or reuse an already-published version; when the published version is
  unknown, resolve it from npm (`npm view @veewo/claw version`) before bumping.
- **Skill catalog integrity rule:** before releasing, every SKILL.md under
  `.agents/skills` and the adapter `skills/` directories must carry a YAML
  frontmatter block with `name` and `description`. A skill file without
  frontmatter is silently dropped from the DSH skill catalog (learned
  2026-08-22: `release-dsh-plugin/SKILL.md` shipped without frontmatter and
  never appeared in the catalog). Verify with a frontmatter scan; fix any
  missing block in the same release commit.
- **Verification run rule:** always run workspace tests through the npm
  workspace scripts — `npm test -w @veewo/claw-core` and
  `npm test -w @veewo/claw`. The CLI suite compiles `test/**/*.ts` to
  `dist-test/` first (`tsc -p tsconfig.test.json`), so running
  `node --test packages/cli/test/*.test.ts` directly fails with
  ERR_MODULE_NOT_FOUND and is not a valid signal (learned 2026-08-22).
  Treat a direct-node failure as a runner mistake, re-run via npm, and only
  investigate when the npm run also fails.
- Reset every adapter version to `<cli>.0`; this does not publish an adapter.
- Publish `@veewo/claw-core` before `@veewo/claw`, then create tag `v<version>`
  and the GitHub Release.
- Before publishing, require clean `main`, `HEAD == origin/main`, focused checks,
  package dry-runs, `npm run check:template-versions`, `npm run verify:release`,
  and reviewed release diff. The template check is a required gate for every
  built-in skill package that contains `TEMPLATE.json`; its version must match
  `TEMPLATE_DRIVER_VERSION`, rather than the release package version.
- After publishing, verify npm metadata and real retrieval for both packages.
  Never reuse an already-published version or force-move an existing tag.
- Refresh local installations only when separately requested and only from the
  published npm/GitHub artifacts.
