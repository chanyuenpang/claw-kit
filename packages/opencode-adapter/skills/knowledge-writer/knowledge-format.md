# Canonical knowledge evolution format

Use this format for every new Truth or ADR document and every existing owner written by the current writer pass. Inspect the selected owner before writing and repair nonconforming structure in the same edit. Do not mass-rewrite untouched documents.

## Document metadata

Document kind is inferred from its canonical path: documents under `adr/` are ADRs; other documents under the Truth root are Truth documents. Do not add a document-kind field.

Truth documents default to `current`. ADR documents default to `accepted`. When a different document state must be explicit, place a renderer-hidden generic comment immediately after the title:

```markdown
# ADR: Replaced decision

<!-- document-state: superseded -->
```

Allowed document states are:

- Truth: `current` or `historical`
- ADR: `accepted`, `superseded`, or `historical`

An ordinary leading `## Status` or `## 状态` section may also supply the document state. Do not emit tool-specific metadata names.

## Current and evolution sections

Use renderer-hidden, machine-stable ASCII comments before natural-language headings:

```markdown
<!-- state: current -->
## Current behavior

Current canonical content.

<!-- state: history -->
## Evolution history

<!-- dated: 2026-07-20 -->
### Replaced the earlier route

The prior behavior and why it matters for rollback or repeated work.
```

For ADRs, the ordinary Context, Decision, Alternatives, and Consequences sections inherit the document state. Mark only retained decision evolution with `<!-- state: history -->`.

Each `<!-- dated: YYYY-MM-DD -->` comment starts one complete evolution unit at the level-three heading that follows it. The unit extends to the next dated comment or the next level-two heading. The date is a stable checkpoint label and search signal, not a time-to-live value. Multiple checkpoints may use the same date. Their canonical evolution order is document order.

Do not append an evolution unit for routine progress or every successful turn. Add one only when the former fact or decision remains useful for rollback, compatibility, feature repetition, incident reasoning, or understanding a meaningful transition.
