# CLI release fallback

When claw planning is unavailable, follow `docs/beta-release.md` directly.
Preparation commits locally and freezes a final-version batch for seven days of
testing without pushing. Formal promotion preserves its version and bytes:
verify/publish with `--candidate <dir>`, check Core/Client/CLI retrieval before
pushing main, then finish immutable source tag/Release and clean main equality.
Stop at the first failed boundary; do not rebuild during promotion.
