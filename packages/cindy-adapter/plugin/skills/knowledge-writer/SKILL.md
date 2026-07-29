---
name: knowledge-writer
description: "Evaluate supplied completed-work materials and maintain canonical Truth followed by ADR knowledge in one consistency-aware pass."
---

# Knowledge writer

Use this skill only when the Host explicitly dispatches a completed-work
closeout with supplied materials. Do not trigger it for ordinary progress.

1. Inspect the current `.claw/` plan, report, task conclusions, and the files
   changed by the completed work.
2. Update canonical Truth documents first, then record durable decisions as
   ADRs. Preserve existing owners and repair only the selected documents.
3. Keep the scope bounded to the current project and plan. Do not reopen or
   silently complete plan tasks.
4. Report the files inspected, the documents changed, and whether the closeout
   completed successfully. If the CLI or required source is unavailable,
   report a recoverable failure instead of claiming success.

Truth describes current behavior. ADRs preserve accepted decisions, rationale,
alternatives, and consequences. Add dated evolution sections only for durable
changes that matter for rollback, compatibility, or future repetition.
