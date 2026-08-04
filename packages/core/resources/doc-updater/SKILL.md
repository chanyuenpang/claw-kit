---
name: doc-updater
description: Update configured existing external documentation as the dependent documentation stage of knowledge finalization.
---

# Doc updater

Resolve `<skill-dir>` as the directory containing this file.

Use this skill only when it owns the external-document stage of an active
knowledge-finalization plan. Create its subplan with:

`claw subplan create --parent <parent-task-name> --task-id <id> --template-file "<skill-dir>/TEMPLATE.json"`

The parent stage supplies the frozen external documentation paths, finalization
materials, and the resulting canonical knowledge state. This skill has no
standalone plan route.
