# Codex plugin release fallback

When claw planning is unavailable, execute the five template stages in order:
inspect and classify; bump only Codex; synchronize and verify the marketplace
payload; commit/push and pass the exact-source gate; tag/release and verify the
immutable Git ref. Stop at the first failed boundary.
