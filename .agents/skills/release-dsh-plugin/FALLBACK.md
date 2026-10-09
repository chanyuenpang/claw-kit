# Release DSH adapter — fallback route

1. With explicit release authority, select the tested frozen candidate containing DSH. If none exists, use beta:prepare -- --artifacts dsh (or the authorized combined set), commit prepared versions locally and beta:pack --candidate; stop before publication until installation and seven-day trial are complete.
2. Verify the exact candidate hash, original tgz, unchanged formal four-segment version and npm CLI-base-rc.N mapping, sourceRevision and trial. Never bump, build, export or pack workspace source during promotion.
3. Require clean local source main at that tested revision with no remote divergence. Run npm run publish:dsh-plugin -- --candidate <directory> for verification, then with authority add --publish. The owner uploads original bytes and verifies registry retrieval; accepted/unknown uploads are reconciled, not resent.
4. Only after matching retrieval, complete the authorized source main push and immutable vdsh-<candidate-version> tag. Never force-move a tag; require clean main == origin/main at completion.
5. For an authorized known profile, install the exact published npm version through the profile’s own plugin manager. A non-Electron profile accepts dsh plugin --profile <name> add <exact-spec>; desktop requires plugin_manager install_bundle, never direct profile writes. Ask for the target when required and unknown. An explicitly package-only release does not authorize installation.
6. Verify on-disk bundle version and compatible CLI. Never restart a running Host without separate explicit permission or claim activation from installation. Verify claw_run/skills after the authorized restart.

See references/artifact.md, docs/beta-release.md and packages/dsh-adapter/RELEASING.md. Old beta directories are historical and must not be overwritten.
