# Codex plugin release fallback

When claw planning is unavailable, execute the five template stages in order:
inspect and classify; bump only Codex; synchronize and verify the marketplace
payload; commit/push and pass the exact-source gate; tag/release and verify the
immutable Git ref. If a maintainer refresh is separately authorized, remove all
local claw-kit marketplace registrations, identities, hooks, and caches before
refreshing only from the official GitHub marketplace and enabling
`claw-kit@claw-kit`. Stop at the first failed boundary.
