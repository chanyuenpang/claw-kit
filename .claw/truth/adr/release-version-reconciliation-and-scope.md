# ADR: Release version reconciliation and platform scope

## Status

Accepted

## Context

Beta batches may intentionally test a subset of artifact families, while a formal release must make an explicit decision about the current CLI baseline and authorized platform scope. Reusing an older frozen adapter candidate can silently publish a version incompatible with the selected CLI. Conversely, treating remote version metadata or a version audit as authorization can widen scope or block a valid owner decision on uncertain external information.

## Decision

- Before beta preparation and formal publication, the release owner resolves the target CLI base and records a worksheet per artifact family: source version, selected frozen candidate, known published version, exact CLI pins, and the DSH npm-version mapping.
- Adapter version segments 1–3 align with the target CLI base; the fourth segment remains independently incremented. The read-only audit:release-versions command checks explicitly authorized families and their selected frozen candidates. It is a reconciliation aid owned by release workflows, not a Host/adapter authorization gate.
- Beta may test only selected platforms. Formal release re-evaluates the authorized platform scope against the target base. A selected platform missing a current candidate, or holding a stale one, requires a newly versioned candidate; after its trial or explicit owner waiver, promote those exact frozen bytes without rebuilding or relabeling.
- Do not publish an older CLI merely to mask adapter mismatch. Inventory out-of-scope platforms and request expanded authorization before publishing them. Unknown remote metadata is recorded as unknown, not treated as authorization or a blocker for unrelated families.

## Consequences

- Version compatibility and scope are reviewed before mutating preparation/publication steps, while the audit remains read-only and does not duplicate authorization ownership.
- Frozen artifacts retain stable version-to-bytes identity. A stale candidate cannot be made current by changing its label or by downgrading the CLI target.
- Beta evidence does not implicitly select formal release scope; each formal release explicitly reconciles its authorized families.

## Related Truth

- .claw/truth/features/artifact-specific-plugin-release-and-cindy-update.md
- .claw/truth/features/pre-release-candidate-testing.md
