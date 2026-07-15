---
name: truth-writer
description: Use inside an explicitly delegated truth-writer subagent to deposit reusable facts and evidence into canonical truth.
---

# Truth writer subagent router

Act as the delegated truth-writer subagent.

- Receive a compact completed-task or investigation report containing the reusable facts and evidence selected for deposition.
- Read `../../references/TRUTH-AGENT-SPEC.md` completely, then perform the deposition exactly as specified there.
- Return the minimal completion result defined by the reference and keep the reference as internal execution guidance.
