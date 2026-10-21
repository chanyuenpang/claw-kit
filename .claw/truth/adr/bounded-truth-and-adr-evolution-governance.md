# ADR: Bounded Truth and ADR evolution governance

## Context

Canonical Truth and ADR are the trusted compressed result of knowledge finalization. Source plans and adjacent reports are intentionally short-lived work buffers governed by task retention, not an audit archive that must remain available for every future review. At the same time, a pure current-state snapshot loses useful explanations for rollback, compatibility, repeated feature changes, and reversals, while append-only canonical documents grow without a stable retirement rule.

The corpus previously relied on prose conventions for current, historical, accepted, and superseded knowledge. Runtime could not reliably identify document state, section state, or evolution boundaries, so it could neither retire history deterministically nor help search distinguish a current claim from an older explanation. Governance also had to avoid mechanically deleting current knowledge or mass-rewriting the existing corpus.

## Decision

- Infer Truth versus ADR from the canonical path and use renderer-hidden generic HTML comments for the remaining machine-stable metadata. `<!-- document-state: ... -->` expresses only a non-default document state, while `<!-- state: ... -->` and `<!-- dated: YYYY-MM-DD -->` precede natural-language section headings. Truth states are `current` and `historical`; ADR states are `accepted`, `superseded`, and `historical`.
- Retire the tool-specific frontmatter and visible bracket-token grammar without a compatibility parser or compatibility tests. Existing untouched documents may remain readable Markdown until a writer materially updates their owner, but retired markers are not interpreted as canonical state.
- Require every canonical writer, including configured external skills, to read the shared `knowledge-format.md` minimum before writing. New or changed canonical content must retain meaningful Truth/ADR structure, evidence and relevant implementation anchors; repair relevant structural ambiguity without overwriting unrelated edits or mass-migrating untouched documents.
- Treat each dated section as an ordered evolution checkpoint, not as a time-to-live record. Multiple checkpoints may share a date; document order defines retirement order.
- Apply the same bounded evolution model to Truth and ADR written by the built-in writer. `knowledgeWriter.datedSectionsToKeep` is a writer instruction, defaulting to `6` complete dated sections per changed canonical document, not a runtime hard gate. It is a direct option; the old nested `knowledgeWriter.retention` shape is unsupported. External skills retain the shared canonical minimum but choose their own retention method.
- When a changed owner exceeds the configured count, remove the earliest complete dated sections by document order until the count is satisfied. Never mechanically delete current Truth, accepted ADR content, part of a dated section, or unrelated edits.
- Do not impose line, paragraph, character, per-section, or age limits. If current or accepted content becomes too broad, the writer must semantically compress it or split ownership by topic; deterministic governance must not rewrite its meaning.
- Do not copy retired evolution into another archive, retain plan/report links as recovery records, or promise claw-level restoration. Canonical Truth and ADR remain the accepted compressed knowledge after retirement.
- Scope semantic maintenance to the canonical owners selected by this pass. Preserve unrelated edits and untouched documents; do not mass-rewrite the corpus or infer mechanically removable boundaries from legacy prose. Finalizers do not snapshot or trim either writer route.
- Split responsibility deliberately: writers own evidence eligibility, owner routing, current/history meaning, bounded evolution, semantic compaction and Truth/ADR consistency. Runtime parses metadata for recall, but does not enforce governance phases, changed-file retention or all-done session workflow assertions. Canonical claim/CAS completion remains independent of ancillary encoding, refresh and report maintenance.
- Preserve heading and temporal context in project recall. Canonical chunks carry document kind/state, effective section state, date, and heading path; each long-section token window repeats a compact breadcrumb. Current, historical, superseded, and explicit-date intent affects soft ranking before per-document chunk collapse, never recall-time hard filtering.
- Bump the project index compatibility boundary when adopting this grammar so old vectors cannot be treated as marker-compatible. The concrete `embedding_chunking_version`, reset behavior, and refresh contract are owned by `search-index-refresh-and-openai-embeddings.md`.

This ADR owns the built-in bounded canonical-evolution instruction and its writer/runtime division. `external-writer-skill-config.md` owns external methods and the shared canonical minimum; `hook-owned-two-phase-knowledge-finalization.md` owns finalizer lifecycle; `search-index-refresh-and-openai-embeddings.md` owns retrieval architecture.

## Alternatives Considered

- Keep canonical knowledge append-only: rejected because growth remains unbounded and stale explanations compete indefinitely with current claims.
- Keep only current state and discard all evolution: rejected because rollback rationale, compatibility history, and important reversals remain reusable knowledge.
- Trigger trimming by line, paragraph, or character count: rejected because formatting and prose length are poor proxies for the number of retained evolution units and can pressure the system to delete or fragment meaningful content.
- Treat dated headings as TTL records: rejected because age alone does not determine value; dates identify checkpoints and search context, while retirement follows document order only after the configured count is exceeded.
- Bound Truth but never ADR: rejected because durable decisions also evolve and can accumulate obsolete checkpoints; current accepted decision content remains protected under the shared model.
- Archive removed sections or retain source evidence indefinitely: rejected because it creates a second knowledge/evidence system with storage, routing, and trust costs that contradict the accepted canonical-memory model.
- Enforce retention with a finalizer snapshot/trim gate: rejected in the current design. It duplicates writer maintenance and can delete concurrent edits or negate otherwise successful canonical maintenance; claim/CAS safety does not require that content gate.
- Mass-migrate every legacy document immediately: rejected because it would create a large mechanical diff and risks inferring section boundaries the existing prose never declared.
- Defer format repair after a writer has already changed an owner: rejected because it leaves newly written canonical knowledge structurally ambiguous and pushes a known mismatch into a later governance pass.
- Hard-filter historical or superseded chunks before recall: rejected because historical, rationale, rollback, and explicit-date questions require those chunks; intent-aware soft ranking preserves recall while preferring the right section.

## Consequences

- Current Truth and accepted ADR content have no mechanical prose limit; only the count of complete retained evolution checkpoints is bounded.
- Every writer route retains the shared minimum format for new or changed canonical content; untouched legacy documents are not a reason to broaden the edit scope.
- The corpus can preserve useful recent evolution without making raw plans, reports, or a parallel evidence archive part of its long-term trust contract.
- Retention is an evidence-aware writer responsibility, not a runtime guarantee; completion must not imply a deterministic trim was performed.
- Untouched documents remain readable and searchable as Markdown, but retired metadata carries no parsing semantics; generic hidden comments enable state-aware ranking, not automatic retirement.
- Search can distinguish current, historical, superseded, and date-specific sections within one file before choosing that file's representative chunk, while still allowing every state to be recalled.
- The chunking-version bump intentionally invalidates older vectors; deployments must rebuild existing project indexes once after release.
- Git may incidentally retain deleted text, but neither Git recovery nor source artifact retention is a supported knowledge-governance guarantee.

## Related Code

- `.agents/skills/claw-kit-doc/references/knowledge-format.md` (copied into packaged knowledge-writer resources during build)
- `packages/core/resources/knowledge-writer/TEMPLATE.json`
- `packages/core/src/knowledge-document.ts`
- `packages/core/src/knowledge-governance.ts`
- `packages/core/src/knowledge-sidecar.ts`
- `packages/core/src/memory.ts`
- `packages/cli/src/cli.ts`
- `.claw/truth/features/truth-and-adr-corpus-semantics.md`
- `.claw/truth/adr/hook-owned-two-phase-knowledge-finalization.md`
- `.claw/truth/adr/external-writer-skill-config.md`
- `.claw/truth/adr/search-index-refresh-and-openai-embeddings.md`

## Search Terms

- `datedSectionsToKeep`
- `bounded evolution`
- `evolution checkpoint`
- `document-state`
- `state: history`
- `generic hidden comments`
- `temporal chunk ranking`
- `canonical compressed knowledge`
- `evidence archive`
