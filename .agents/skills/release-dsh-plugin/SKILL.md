# Release DSH adapter

Run only inside the claw-kit repository. This skill owns only
`packages/dsh-adapter` and the published `@claw-kit/dsh-adapter` npm package.

Resolve `<skill-dir>` as this file's directory. For a whole release, create the
plan with `claw plan create --template-file "<skill-dir>/TEMPLATE.json" --title
"release-dsh-plugin"`. For an independent stage of an authorized batch, use the
template as a subplan. If claw planning is unavailable, follow `FALLBACK.md`.

Read `references/artifact.md` before editing. Require explicit release authority;
package-only or verification-only work belongs to `test-claw-kit`. Never change
CLI/core or another adapter version, and do not build or upload a
marketplace/`.cindy`-style archive — distribution is the npm package.
