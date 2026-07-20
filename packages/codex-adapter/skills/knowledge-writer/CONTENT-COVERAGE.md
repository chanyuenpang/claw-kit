# knowledge-writer content coverage

## Source to converted-home mapping

- Trigger and template entry: `SKILL.md`; input and quality contract: `TEMPLATE.json` requirements, tasks, guidance, and rules.
- Template compatibility: `TEMPLATE.json` declares the current claw CLI version.
- Conclusion evidence from every supplied material, with task-status interpretation when present: `non-claw-fallback.md`, template tasks 1 and 2, acceptance criteria, and template rules.
- Evidence freshness and unresolved-conflict handling: `non-claw-fallback.md`, template task 2, acceptance criteria, and template rules.
- Runtime scope: `TEMPLATE.json` top-level `scope` only; it is not repeated in writer prompts.
- Fixed Truth-then-ADR sequence without routing choices: template tasks 4 and 5 and `non-claw-fallback.md`.
- Machine-stable current/history/superseded metadata and dated evolution grammar: `knowledge-format.md`, template tasks 4 and 5, and `non-claw-fallback.md`.
- On-write format inspection and repair without corpus-wide migration: `knowledge-format.md`, template tasks 3 through 6, acceptance criteria, and template rules.
- Canonical-owner discovery and exhaustive search: template tasks 3 through 6 plus template rules.
- One-owner stewardship and cross-document consistency: template task 6, template rules, and `non-claw-fallback.md`.
- Writing constraints, encoding, exact identifiers, and return behavior: `non-claw-fallback.md`, template task 6, and template rules.
- Supplied-material immutability: template task 1, acceptance criteria, template rules, and `non-claw-fallback.md`.
- Verification gate: template task 6 requires focused and exhaustive post-write review before completion.

## Coverage result

- [x] Important source triggers and inputs are represented.
- [x] Conclusion-bearing content from every supplied material drives deposition; task status informs interpretation without turning task metadata into an execution record.
- [x] The ordered workflow always performs the Truth pass before the ADR pass and has no route-choice task.
- [x] Search tools, ownership constraints, and safety boundaries are represented.
- [x] Time-bounded authority, current-anchor checks, and unresolved-freshness no-edit behavior are represented.
- [x] Writing and consistency verification requirements are represented.
- [x] Canonical state and dated evolution semantics are represented.
- [x] Every written owner is repaired to canonical format while untouched documents remain unmigrated.
- [x] Full direct behavior remains available in the adjacent fallback.
- [x] No source companion scripts or external links require migration.
