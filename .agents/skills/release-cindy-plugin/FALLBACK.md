# Cindy artifact release fallback

When claw planning is unavailable:

1. Select the explicitly authorized tested frozen candidate for this artifact family. If absent, beta:prepare allocates a new formal version (adapter fourth segment only); review/commit locally, beta:pack --candidate and stop before publication until testing completes. No beta suffix or same-version different bytes.
2. Verify the exact sourceRevision, original artifact hash, manifest version/pins and seven-day trial. No bump/build/pack/export or workspace-content repair during promotion; errors requiring new inputs go through a new candidate/version.
3. Require clean source main at the tested revision and no divergence. Complete authorized source delivery without force.
4. Deliver the exact frozen Cindy tree to the existing authorized independent artifact repository main and immutable vcindy tag. Verify both source and artifact repository delivery states. Never create a .cindy archive or GitHub Release. Never use raw source main as an installable tree, move an existing tag, or publish npm through this artifact skill. Require main == origin/main and a clean worktree at completion.
5. Installation or maintainer refresh must be separately authorized. Preserve the host-specific official installation boundaries in references/artifact.md; installation is not activation and restart needs separate authority.

Follow docs/beta-release.md and references/artifact.md. Stop at the first failed boundary; an accepted/unknown remote write is reconciled rather than blindly resent.
