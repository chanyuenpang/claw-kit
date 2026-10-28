# ADR: Project memory embedding is explicit opt-in

## Context

Project memory search and indexing previously inferred that vector work was enabled from the presence of an embedding provider/model configuration. This made older projects unexpectedly start model and vector paths, while disabling all memory would also change unrelated finalization-time external-document behavior. Users need embedding to be independently controllable and, when it is off, `claw search` must still help agents find the canonical documents for native text search.

The implemented contract is represented by `packages/core/src/memory.ts` and the project configuration protocol. The completed implementation verification recorded in the task closeout covered Core, CLI, DSH projection, configuration documentation, and finalization/doc-update snapshots; it did not install or publish the change, run a real model, or exercise a real LLM writer E2E.

## Decision

- `memory.embedding.enabled` is the project's explicit vector-runtime permission. Only literal `true` enables embedding-backed search/indexing; missing, `null`, and legacy provider/model objects without the flag are disabled. `memory.enabled` remains the broader memory switch and retains its existing semantics. Enabling embeddings requires the existing valid provider/model configuration.
- Core's `resolveProjectMemoryEmbeddingConfig` is the single owner of effective permission. Search, sync/async index paths, warm/prime behavior, and CLI scheduling consume that resolved policy rather than independently inferring enablement.
- With embedding disabled, project `claw search` is a successful directory-discovery response, not an error or an unavailable recall result. It returns the absolute Truth directory (which includes ADRs) and configured external document files/directories, with existence/type information and native-search guidance. It does not refresh an index, load or download a model, generate vectors, or access vector storage for search. Missing configured locations are reported as missing rather than created.
- Disabled index/refresh work is skipped without deleting existing vector databases or caches. Queued refresh work must observe current configuration at execution time. Finalization, Truth/ADR governance, configured external-document maintenance, retention, and GitNexus remain independently governed; embedding opt-out is not a finalizer opt-out.
- The explicit opt-in is an intentional upgrade behavior change: existing provider/model settings are preserved, but users who want semantic indexing after upgrade must set `memory.embedding.enabled: true`.

## Alternatives

- Infer enablement from a configured provider/model: rejected because old generated configurations do not reliably express current user intent and would violate default-off behavior.
- Disable all memory to turn off embeddings: rejected because it couples vector runtime permission to broader memory and finalization-time document maintenance.
- Treat disabled search as unavailable/error or silently substitute another text-search engine: rejected because search can provide useful document locations without pretending to return ranked recall results or adding another search owner.
- Delete old databases/caches or cancel all completion refresh work: rejected because opt-out should prevent new vector work without destructive cleanup or suppressing independent retention/GitNexus operations.

## Consequences

- New and upgraded projects default to no embedding runtime work until explicitly opted in; provider/model settings remain available for a later opt-in.
- Agents can continue with native file/text search using the returned corpus locations, even when vector search is off or locations are absent.
- Core owns the policy boundary while adapters project discovery fields; adapters must not recompute the effective setting or discard the discovery payload.
- Focused tests cover default/legacy/override behavior, discovery and zero-vector side effects, skipped indexing, queue behavior, adapter projection, and finalizer/document-update independence. Real model execution and publication/install validation remain outside the verified scope of this decision.

## Related Code

- `packages/core/src/memory.ts`
- `packages/core/src/project-config.ts`
- `packages/core/src/context.ts`
- `packages/core/src/project-check.ts`
- `packages/core/src/types.ts`
- `packages/cli/src/cli.ts`
- `packages/cli/src/completion-refresh.ts`
- `packages/dsh-adapter/src/host-actions.ts`
- `packages/core/test/embedding-switch.test.ts`
- `packages/cli/test/completion-refresh-recovery.test.ts`
- `docs/project-json-reference.md`
