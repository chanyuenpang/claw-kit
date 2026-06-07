# Claw Kit Truth Summary

- `claw-kit` is a host-neutral `.claw` harness core extracted from OpenClaw semantics.
- Codex startup uses prompt-driven bootstrap plus `SessionStart` context injection.
- `claw search` is the Codex-facing recall command; `memory.externalDocPaths` extends project recall sources.
- `claw plan write`, `claw plan edit`, and `claw plan done` return compact `workflowGuidance` and `planSummary` contracts.
- Thread goal mode starts on `plan write`.
- Truth and ADR deposition run through delegated writer specialists, not inline main-agent writes.
- Writer delegation contracts now carry explicit `skill` and `model` fields.
- `.claw/project.json` supports explicit `externalTruthSkill` and `externalAdrSkill` overrides with `null` defaults.
