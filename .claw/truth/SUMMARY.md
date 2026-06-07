# Claw Kit Truth Summary

- `claw-kit` is a host-neutral `.claw` harness core extracted from OpenClaw semantics.
- Codex startup uses a prompt-driven workflow plus `SessionStart` context injection; the main entry skill is `claw-kit:using-claw-kit`.
- Codex-facing recall uses `claw search`; `memory.externalDocPaths` extends project recall sources.
- `claw plan write`, `claw plan edit`, and `claw plan done` return compact `workflowGuidance` and `planSummary` contracts.
- Thread goal mode starts on `plan write` and uses the plan goal to build the recommended objective.
- Truth and ADR deposition run through delegated writer specialists, not inline main-agent writes.
- Writer delegation contracts now carry explicit `skill` and `model` fields.
- `.claw/project.json` now supports explicit `externalTruthSkill` and `externalAdrSkill` overrides with `null` defaults.
