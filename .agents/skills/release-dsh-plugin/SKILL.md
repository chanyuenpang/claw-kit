---
name: release-dsh-plugin
description: Release the claw-kit DSH adapter and the published @veewo/dsh-claw-kit npm package. Use only when the repository owner explicitly asks to publish or release the DSH adapter or a vdsh version.
---
# Release DSH adapter

Run only inside the claw-kit repository. This skill owns only
`packages/dsh-adapter` source changes and the published `@veewo/dsh-claw-kit`
npm package. For a known authorized target DSH profile, release delivery also
installs the exact published npm version into that profile after publication;
ask for the target when it is unknown.

The profile write path depends on the profile's owner. A non-Electron profile
(`web`, `headless`, custom names) accepts
`dsh plugin --profile <name> add <exact-published-package>`. The
Electron-managed `desktop` profile does not: the global `dsh` on `PATH` refuses
it with `profile "desktop" is managed exclusively by the Electron application`,
so install through the profile's own plugin manager,
`plugin_manager(action: "install_bundle", target: "<exact spec or tarball>")` —
the same service as the Desktop app's **Plugins** page. Never write
Electron-managed profile files with an Agent, a filesystem tool, or a script;
a rejection naming Electron is this boundary, not a broken command. Read the
canonical boundary at
`packages/dsh-adapter/skills/update/references/desktop-profile-write-boundary.md`
before delivery.
Installation is not activation: never restart a running Host without separate
explicit authorization.

Resolve `<skill-dir>` as this file's directory. For a whole release, create the
plan with `claw plan create --template-file "<skill-dir>/TEMPLATE.json" --title
"release-dsh-plugin"`. For an independent stage of an authorized batch, use the
template as a subplan. If claw planning is unavailable, follow `FALLBACK.md`.

Read `references/artifact.md` before editing. Require explicit release authority;
package-only or verification-only work belongs to `test-claw-kit`. Never change
CLI/core or another adapter version, and do not build or upload a
marketplace/`.cindy`-style archive — distribution is the npm package.
