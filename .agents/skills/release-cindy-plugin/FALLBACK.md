# Cindy artifact release fallback

When claw planning is unavailable, follow `references/artifact.md` and the
main repository's `packages/cindy-adapter/RELEASING.md`. Resolve and verify
the source revision first, build a fresh complete marketplace artifact, and
validate its flat plugin/skills payload. Only with release authority, deliver
that tree to the existing independent artifact repository main and create its
immutable vcindy tag. Do not publish raw adapter source, rebuild skills inside
source, upload a .cindy archive, or create a GitHub Release. Stop at the first
failed boundary; installation and restart remain separately authorized.
