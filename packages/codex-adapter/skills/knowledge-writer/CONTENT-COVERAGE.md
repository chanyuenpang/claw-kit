# knowledge-writer content coverage

## Source to converted-home mapping

- Trigger and trusted inputs: `SKILL.md`, `TEMPLATE.json` requirements, task 1, and template rules.
- Conclusion evidence from report plus plan retrospective/key decisions, with task-status interpretation: `SKILL.md`, `non-claw-fallback.md`, template task 1, acceptance criteria, and template rules.
- Evidence freshness and unresolved-conflict handling: `SKILL.md`, `non-claw-fallback.md`, template task 1, acceptance criteria, and template rules.
- Projectless stable harness: `TEMPLATE.json` declares top-level `scope: "session"`; `SKILL.md` explains direct entry and recursion avoidance.
- Fixed Truth-then-ADR sequence without routing choices: template tasks 2 and 3, `SKILL.md`, and `non-claw-fallback.md`.
- Canonical-owner discovery and exhaustive search: template tasks 1 through 4 plus template rules.
- One-owner stewardship and cross-document consistency: `SKILL.md`, template task 4, and template rules.
- Writing constraints, encoding, exact identifiers, and return behavior: `non-claw-fallback.md`, template task 4, and template rules.
- Prohibition on lifecycle/input mutation, nested writers, and recall refresh: template tasks 1 and 4 plus template rules.
- Verification gate: template task 4 requires focused and exhaustive post-write review before completion.

## Coverage result

- [x] Important source triggers and inputs are represented.
- [x] Report and explicit plan conclusions drive deposition; task status informs interpretation without turning the task list into an execution record.
- [x] The ordered workflow always performs the Truth pass before the ADR pass and has no route-choice task.
- [x] Search tools, ownership constraints, and safety boundaries are represented.
- [x] Time-bounded authority, current-anchor checks, and unresolved-freshness no-edit behavior are represented.
- [x] Writing and consistency verification requirements are represented.
- [x] Full direct behavior remains available in the adjacent fallback.
- [x] No source companion scripts or external links require migration.
