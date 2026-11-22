# ADR: Install standalone knowledge-capture skill with project initialization

## Context

A collaborator may work in a project without the claw-kit plugin or CLI skill bundle and still need to record explicitly requested project knowledge. Requiring the adapter's globally supplied `knowledge-capture` skill would make that workflow unavailable in such a project. The skill already has a shared authoring source and an explicit manual-capture boundary; project availability should not create another knowledge lifecycle or alter automatic finalization.

## Decision

Core project initialization installs the standalone `knowledge-capture` skill into both `.agents/skills/knowledge-capture` and `.claude/skills/knowledge-capture`, including OpenAI invocation-policy metadata and the format reference copied from the same knowledge-writer format resource used by finalization. The shared skill remains the source; these project copies are installed resources, not a second authoring source.

Install only missing files. Do not overwrite an existing user skill, project configuration, personal override, or Truth content. The regular project-environment setup path also runs this installer, so existing projects can receive missing files through a normal setup/plan-create flow, and re-running `claw init` without `--force` is non-destructive. Keep the skill project-scoped rather than declaring it as a global DSH/Codex adapter skill. Its explicit user-request invocation boundary remains unchanged; initialization does not automatically capture knowledge.

## Alternatives

- Keep the skill only in plugin bundles: rejected because collaborators without that plugin would lack the manual project entry.
- Add another configurable Truth directory or a separate capture lifecycle: rejected because the established writer contract already owns directory/format behavior, and a second lifecycle would duplicate responsibilities.
- Replace project files on each initialization: rejected because project-local skill edits belong to the user and initialization must only fill missing resources.

## Consequences

Projects may contain a self-contained manual knowledge-capture entry usable by Claude/OpenAI-compatible project skill discovery without requiring a claw-kit plugin. The project skill is separate from automatic finalization and does not imply that other shared skills or the CLI were installed. If the canonical skill or format changes, update its shared source/resource and the initialization installer inputs rather than maintaining generated project copies as independent sources.

Implementation anchors: [Core initialization](../../../packages/core/src/init.ts), [plan environment setup](../../../packages/core/src/plan.ts), [project skill installer](../../../packages/core/src/project-skills.ts), [project skill regression coverage](../../../packages/core/test/project-skills.test.ts), [DSH skill inputs](../../../packages/dsh-adapter/skill-inputs.json), and [Codex skill inputs](../../../packages/codex-adapter/skill-inputs.json).
