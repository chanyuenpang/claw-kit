# ADR: brainstorming test tree was not promoted to the maintained shared set

## Status

Accepted

## Context

`brainstorming` existed as a generated experiment during `create-claw-skill` validation, but the maintained shared-skill sync list is intentionally limited to the built-in skills that are meant to stay canonical.
The experiment still demonstrates the shape of the route-choice pattern, but it should not be kept in the repository as a formal shared skill/template unless it is explicitly promoted later.

Without a clear decision, the generated tree could drift back into the default sync set and be mistaken for a maintained contract.

## Decision

- Keep `scripts/sync-shared-skills.mjs` focused on the maintained shared skill set.
- Do not treat the generated `brainstorming` tree as part of the default shared corpus.
- If `brainstorming` is ever reintroduced, give it a fresh explicit promotion decision and a canonical shared source rather than relying on the earlier test artifact.

## Consequences

- The current maintained shared set stays small and intentional.
- Test-only skill trees do not become accidental long-lived interfaces.
- Any future brainstorming workflow needs a deliberate product decision before it is added back into sync.

## Related Code

- `scripts/sync-shared-skills.mjs`
- `.claw/truth/adr/shared-planning-skill-source.md`
- `.claw/truth/features/shared-planning-skill-source.md`
