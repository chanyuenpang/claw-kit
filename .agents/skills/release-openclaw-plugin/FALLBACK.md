# OpenClaw plugin release fallback

When claw planning is unavailable, execute the five template stages in order:
inspect and classify; bump only OpenClaw; run focused checks; commit/push and pass
the exact-source gate; tag/release and verify GitHub evidence. Stop at the first
failed boundary.
