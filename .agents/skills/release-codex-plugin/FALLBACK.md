# Codex plugin release fallback

For a supplied beta candidate, follow `docs/beta-release.md` first: verify trial,
hashes and source, require matching CLI npm retrieval before any push, and reuse
the stored marketplace without bump/build/export. Then perform the immutable
artifact tag/Release and published-source verification steps below.

When claw planning is unavailable, execute the six template stages in order:
inspect and classify; bump only Codex; assemble and verify the complete marketplace
artifact from canonical inputs without writing source copies; verify every built-in templated skill with `npm run check:template-versions`;
commit/push and pass the exact-source gate; tag/release and verify the immutable
Git ref. If a maintainer refresh is separately authorized, remove all
local claw-kit marketplace registrations, identities, hooks, and caches before
refreshing only from the official GitHub marketplace and enabling
`claw-kit@claw-kit`. Stop at the first failed boundary.
