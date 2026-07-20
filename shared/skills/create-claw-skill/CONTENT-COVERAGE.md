# create-claw-skill content coverage

- Trigger, ownership routing, upgrade entry, and companion-file links: `SKILL.md`.
- Structured conversion and upgrade workflow: `TEMPLATE.json` tasks, guidance, acceptance criteria, and rules.
- Plan-independent conversion behavior: `FALLBACK.md`.
- Current authoring, lifecycle, routing, choice, and validation contract: `references/template-authoring.md`.
- Out-of-date template upgrade checklist: `references/template-upgrade.md`.
- Version-aware package generation: `scripts/create-claw-skill-stub.mjs`.

## Coverage result

- [x] Whole-task, independent-stage, batch-stage, and mixed-stage routes are represented.
- [x] Goal handoff and optional `guidance.onPlanStart` semantics are represented.
- [x] Choice guidance and file-based validation requirements are represented.
- [x] Missing or stale versions route through inspection and optimization before upgrade.
- [x] Every runtime reference is contained in the installed skill package.
