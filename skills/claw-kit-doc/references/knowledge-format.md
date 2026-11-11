# Canonical Truth and ADR format

Use this format for every new Truth or ADR document and every existing owner
written by the current governance pass. Repair a selected owner's format in the
same edit, but do not mass-rewrite untouched documents.

## Kind, path, and state

Document kind is inferred from its canonical path: documents under `adr/` are
ADRs; other documents under the Truth root are Truth documents. Do not add a
document-kind field.

Truth defaults to `current`. ADR defaults to `accepted`. When another state is
required, place a renderer-hidden comment immediately after the title:

```markdown
# ADR: Replaced decision

<!-- document-state: superseded -->
```

Allowed states:

- Truth: `current`, `historical`
- ADR: `accepted`, `superseded`, `historical`

An ordinary leading `## Status` or `## 状态` section may also supply the state.
Do not emit tool-specific metadata names.

## Truth structure

```markdown
# Feature or behavior title

<!-- state: current -->
## Current behavior

Current canonical facts, constraints, ownership, implementation anchors, and
verification rules.

<!-- state: history -->
## Evolution history

<!-- dated: 2026-08-05 -->
### Replaced behavior

The former fact and why it remains useful.
```

Keep one current owner for each material fact. Move former behavior into
history only when it remains useful for rollback, compatibility, repeated
work, incident reasoning, or understanding a meaningful transition.

## ADR structure

```markdown
# ADR: Decision title

## Context

The forces and problem that required a durable decision.

## Decision

The accepted decision and its ownership boundary.

## Alternatives

The material alternatives and why they were not selected.

## Consequences

The tradeoffs, follow-up constraints, and verification implications.

<!-- state: history -->
## Decision evolution

<!-- dated: 2026-08-05 -->
### Earlier decision

The superseded choice and why retaining it is useful.
```

Context, Decision, Alternatives, and Consequences inherit the document state.
Do not manufacture an ADR when no durable decision exists.

## Evolution grammar

Place `<!-- state: current -->` and `<!-- state: history -->` before natural
language headings. Each `<!-- dated: YYYY-MM-DD -->` comment starts one complete
evolution unit at the following level-three heading. The unit ends at the next
dated comment or level-two heading. The date is a stable checkpoint and search
signal, not a time-to-live value; multiple checkpoints may share a date.

Do not append history for routine progress or every successful task.
