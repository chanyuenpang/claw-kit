# CLI release fallback

Before selecting any beta or formal candidate, read docs/beta-release.md and resolve the target CLI base and authorized families. Run npm run audit:release-versions with --phase beta|release, --artifacts <authorized-families>, and each frozen --candidate when applicable. Show source/candidate/known-public versions and exact CLI pins for all families. A selected platform with a missing/stale candidate needs fresh latest-source preparation and freezing at that base before promotion; never relabel frozen artifacts or publish an older CLI to disguise mismatch. Other platforms are inventory only until scope expansion is authorized. Each new candidate requires its own trial or explicit owner waiver.

Formal promotion consumes an explicitly selected tested frozen candidate with the same version and bytes. Do not execute bump/build/pack/export preparation steps below on that candidate. If no tested candidate exists, use beta:prepare for a new artifact-specific version, commit locally and freeze with beta:pack --candidate; wait for the new candidate’s own trial or an explicitly recorded owner waiver before publication. Failed same-input preparation may resume; frozen artifacts are never regenerated. For DSH use publish:dsh-plugin -- --candidate <directory> [--publish], preserving its formal rc npm mapping.


When claw planning is unavailable, follow `docs/beta-release.md` directly.
Preparation commits locally and freezes a final-version batch for seven days of
testing without pushing. Formal promotion preserves its version and bytes:
verify/publish with `--candidate <dir>`, check Core/Client/CLI retrieval before
pushing main, then finish immutable source tag/Release and clean main equality.
Stop at the first failed boundary; do not rebuild during promotion.
