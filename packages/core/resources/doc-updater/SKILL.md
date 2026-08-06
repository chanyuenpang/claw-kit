---
name: doc-updater
description: Update configured existing external documentation as the dependent documentation stage of knowledge finalization.
---

# Doc updater

Resolve `<skill-dir>` as the directory containing this file.

Use this skill only when it owns the external-document stage of an active
knowledge-finalization plan.

- When this skill owns the supplied finalization assignment as a stage of an active plan, run `claw subplan create --parent <parent-task-name> --task-id <id> --template-file "<skill-dir>/TEMPLATE.json"`.
- When explicitly invoked with supplied materials outside an active parent plan, run `claw plan create --template-file "<skill-dir>/TEMPLATE.json" --title "doc-updater"`.

The parent stage supplies the frozen external documentation paths, finalization
materials, and the resulting canonical knowledge state.

If the template or claw CLI is unavailable, follow `FALLBACK.md` directly.
