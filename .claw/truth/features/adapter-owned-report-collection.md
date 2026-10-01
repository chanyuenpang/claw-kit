# Adapter-owned report collection

<!-- state: current -->
## Current behavior

- Codex/Cindy claim-time capture uses versioned adapter-owned collector processes. The adapter owns discovery and interpretation of native history and payload; Core and CLI do not interpret Host message DTOs. DSH instead uses trusted live parent-side capture before writer admission, without an executable collector descriptor; its operational route is owned by [DSH finalization Truth](<dsh-knowledge-dispatch-and-finalization.md>) and the decision by [report-collection ADR](<../adr/adapter-owned-report-collection.md>).
- Codex/Cindy collector descriptors and requests use contract v1 and identify the collector version and a unique capture ID. Those collectors write only to the staging path supplied by CLI and communicate payload completeness through exit status, not stdout content.
- CLI owns the canonical report path and creates the staging file name in that report's directory. The process-collector path requires a successful exit and regular, non-symlink staging file, measures opaque bytes, and publishes by same-directory atomic rename. DSH's trusted private-input path publishes through CLI under the canonical job lock. Both paths record byte length and SHA-256 in a capture receipt.
- The receipt also records contract version, capture ID, host, session ID, collector version, and completion time. Core persists `reportCapture.status = "captured"` before a claim token is issued: Codex/Cindy through claim-time collection, DSH through trusted parent-side publication before claim.
- Empty payloads are valid and receive the same integrity receipt. Missing output, invalid staging objects, incompatible collector versions, or collector failures leave the job queued and do not publish a partial canonical report.

## Ownership boundaries

- Host adapters own history parsing, final-turn and completeness rules, and payload encoding.
- CLI owns process-collector registration validation, staging containment, integrity measurement, and atomic publication; DSH uses a trusted internal capture boundary rather than project collector registration.
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
