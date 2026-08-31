# CLI release fallback

When claw planning is unavailable, execute the six template stages in order:
inspect and classify; prepare the three-segment CLI/core baseline; run focused
checks and dry-runs; verify every built-in templated skill with
`npm run check:template-versions`; commit/push and pass the exact-source gate;
publish core then CLI and verify npm/GitHub evidence. Stop at the first failed boundary.
