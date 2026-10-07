---
name: knowledge-writer
description: Evaluate supplied evidence and maintain coherent canonical Truth and ADR with an agent-chosen investigation, editing and review method. Use only when explicitly invoked with supplied materials; do not trigger this skill implicitly.
---
# Knowledge writer

Resolve `<skill-dir>` as the directory containing this file.

- When this skill owns the supplied finalization assignment as a stage of an active plan, run `claw subplan create --template-file "<skill-dir>/TEMPLATE.mjs"`.
- When explicitly invoked with supplied materials outside an active parent plan, run `claw plan create --template-file "<skill-dir>/TEMPLATE.mjs" --title "knowledge-writer"`.

If the template or claw CLI is unavailable, follow `non-claw-fallback.md` directly.
