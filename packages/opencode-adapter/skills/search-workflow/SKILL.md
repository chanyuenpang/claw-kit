---
name: search-workflow
description: Use when working with .claw project recall, indexed search, or pre-planning context lookup.
---
# claw-kit search workflow

## Commands

- `claw search "<text>"`
- `claw search --query "<text>"`
- `claw search index --refresh`

## Scope model

- Project-scoped, uses `.claw/memory.sqlite`
- Documentation recall: memory, truth docs, ADRs
- Call after `claw plan write` to improve task scope
- Not code search — use researcher specialist for code investigation
- When `gitnexus.enabled = true`, use researcher with GitNexus