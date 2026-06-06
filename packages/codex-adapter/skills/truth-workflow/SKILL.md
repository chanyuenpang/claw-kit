---
name: truth-workflow
description: Use when canonical .claw truth needs to be captured or updated.
---

# claw-kit truth workflow

Use this skill when the user wants to capture canonical project truth in an existing `.claw/` project.

## Commands

- Inspect current harness context:
  - `claw context`
- Replace a truth document:
  - `claw truth ingest --target features/<slug>.md --input <report-file>`
- Append to a truth document:
  - `claw truth ingest --target SUMMARY.md --input <report-file> --append`

## Guardrails

- Use truth deposition as an explicit completion step; do not wait for a host hook to remind you.
- Prefer truth deposition when `workflowGuidance.delegateSubagents` contains a `truth-writer` entry, especially at subtask completion or all-task-done time before plan closure.
- Treat truth deposition as earlier than ADR deposition: truth around task completion, ADR only after `claw plan done` completes the plan.
- Canonical truth root is `.claw/truth/`.
- Do not write a second visible, internal, or collab truth tree.
- Treat `truth ingest` as file-level canonical I/O; runtime dispatch belongs to host adapters such as OpenClaw.
