---
name: knowledge-capture
description: Use when the user explicitly asks to capture missed facts, changes, or decisions into project Truth and ADR, including omissions from an automatic finalizer. Never invoke automatically or recommend it based on inferred knowledge value.
---

# Knowledge capture

Supplement project documents with already-established knowledge from the current conversation. The goal is accurate Truth and ADR in the same format as the automatic finalizer, not registration or recovery of its lifecycle.

## Boundaries

- Start only when the user explicitly asks for manual capture. A completed task or inferred knowledge value is not authorization.
- Work in the same agent. Do not create a plan, report, subplan, task, job, background worker, thread, or collaboration subagent for capture.
- A user-requested supplement may cover missed knowledge from claw or non-claw work. Do not claim, resume, replay, or mark complete an automatic finalization job; do not invoke this skill automatically from a plan or finalizer.
- Use established facts and decisions already available in the current conversation. Read the affected documents to locate their current owner and avoid conflicts or duplication. Do not reconstruct missing execution evidence from old reports or fresh implementation research. If evidence is insufficient, skip the unsupported claim and explain what is missing; continue with independent supported content.
- Preserve unrelated edits. Do not invent facts or ADRs to fill a template.

## Direct editing

1. Locate the project Truth root using available project context or existing documentation. Read project configuration only if needed to resolve a custom documentation path; otherwise use `.claw/truth/`, with ADRs under `adr/`. Ask only if the target remains genuinely ambiguous. No CLI, runtime installation, prepare, claim, or complete operation is required.
2. Read the bundled [format appendix](references/knowledge-format.md) in full. It is copied from the same canonical source used by the finalizer.
3. Read the relevant existing Truth and ADR owners. Update the existing owner rather than creating a duplicate; create a document only for a new topic. Write current behavior to Truth and durable decisions with their rationale and tradeoffs to ADR. Keep them consistent, preserving useful superseded knowledge as history.
4. Check the changed passages for evidence, consistency and the appendix format. Correct mechanical formatting problems directly within the authorized edit; no additional user confirmation is needed. Do not migrate unrelated documents or rerun implementation tests merely to restate established conclusions.
5. Stop when the supported knowledge is correctly written. Do not run configured external writer assignments, registration, index refresh, or finalizer recovery as part of this skill. They are not prerequisites for document edits or completion.

## Completion

Briefly state which documents changed and what was supplemented, plus any unsupported claims skipped or actual write failures. If nothing needed changing, say so. Success means the documents were written and reviewed; never imply that registration, index refresh, or an automatic finalizer completed.
