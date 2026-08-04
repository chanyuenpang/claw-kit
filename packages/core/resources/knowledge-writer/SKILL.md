---
name: knowledge-writer
description: Evaluate supplied materials by their content, then maintain canonical Truth followed by ADR knowledge in one consistency-aware pass. Use only when explicitly invoked with supplied materials; do not trigger this skill implicitly.
---
# Knowledge writer

Resolve `<skill-dir>` as the directory containing this file.

- When this skill owns the supplied finalization assignment as a stage of an active plan, run `claw subplan create --parent <parent-task-name> --task-id <id> --template-file "<skill-dir>/TEMPLATE.json"`.
- When explicitly invoked with supplied materials outside an active parent plan, run `claw plan create --template-file "<skill-dir>/TEMPLATE.json" --title "knowledge-writer"`.

If the template or claw CLI is unavailable, follow `non-claw-fallback.md` directly.
