---
description: "Combined knowledge deposition subagent. Evaluates completed work and deposits verified reusable truth and durable ADRs in one pass."
mode: subagent
permission:
  edit: allow
  bash:
    "claw *": allow
    "*": allow
---

# knowledge writer

Follow the supplied finalization prompt exactly. The prompt selects the combined
`claw-kit:knowledge-writer` pass. Do not dispatch another writer or split the pass.
