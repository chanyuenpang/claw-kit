# Adapter-owned report collection

<!-- state: current -->
## Current behavior

- Each supported claim-time capture host registers a versioned adapter-owned collector. The adapter owns discovery and interpretation of its native history plus the opaque report payload; Core and CLI do not normalize Host message DTOs, ordering, or merge semantics.
- Collector descriptors and requests use contract v1 and identify the collector version and a unique capture ID. The collector writes only to the staging path supplied by CLI and communicates payload completeness through its exit status, not through stdout content.
- CLI owns the canonical report path and creates the staging file name in that report's directory. After a successful collector exit, CLI requires a regular, non-symlink file, reads its opaque bytes, records byte length and SHA-256 in a capture receipt, and publishes it with a same-directory atomic rename.
- The receipt also records contract version, capture ID, host, session ID, collector version, and completion time. `knowledge claim` persists the receipt with `reportCapture.status = "captured"` before issuing the claim token.
- Empty payloads are valid and receive the same integrity receipt. Missing output, invalid staging objects, incompatible collector versions, or collector failures leave the job queued and do not publish a partial canonical report.

## Ownership boundaries

- Host adapters own history parsing, final-turn and completeness rules, and payload encoding.
- CLI owns collector registration validation, staging containment, integrity measurement, and atomic publication.
- Core owns the persisted finalization job, report-capture receipt shape, claim token, and finalization lifecycle.
- The rationale and rejected normalized-DTO alternatives are owned by `../adr/adapter-owned-report-collection.md`.

## Implementation and verification anchors

- `packages/cli/src/report-collector-registry.ts`
- `packages/cli/src/cli.ts`
- `packages/core/src/knowledge-sidecar.ts`
- `packages/codex-adapter/scripts/knowledge-finalizer.mjs`
- `packages/dsh-adapter/src/index.ts`
- `packages/cindy-adapter/`
- Host-specific collector tests verify native history completeness; common CLI tests verify opaque bytes, digest and length receipts, empty payloads, failure retention, and atomic publication.

## Search terms

`adapter-owned report`, `collector contract v1`, `captureId`, `payloadBytes`,
`payloadSha256`, `collectorVersion`, `same-directory atomic rename`, `opaque payload`
