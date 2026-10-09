# CLI release fallback

Formal promotion consumes an explicitly selected tested frozen candidate with the same version and bytes. Do not execute bump/build/pack/export preparation steps below on that candidate. If no tested candidate exists, use beta:prepare for a new artifact-specific version, commit locally and freeze with beta:pack --candidate; stop before publication until testing completes. Failed same-input preparation may resume; frozen artifacts are never regenerated. For DSH use publish:dsh-plugin -- --candidate <directory> [--publish], preserving its formal rc npm mapping.


When claw planning is unavailable, follow `docs/beta-release.md` directly.
Preparation commits locally and freezes a final-version batch for seven days of
testing without pushing. Formal promotion preserves its version and bytes:
verify/publish with `--candidate <dir>`, check Core/Client/CLI retrieval before
pushing main, then finish immutable source tag/Release and clean main equality.
Stop at the first failed boundary; do not rebuild during promotion.
