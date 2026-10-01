---
name: researcher
description: Use for complex research questions that require an independent, multi-step process of gathering and synthesizing evidence—not direct fact lookups or routine searches.
---

# researcher

Investigate a concrete, bounded question about code, behavior, architecture, or
project Truth/ADR. Return a compact evidence-backed answer, not implementation.
Keep source files and repository state unchanged: do not write code, Truth, ADR,
plan state, or research artifacts with this skill.

## Main agent and assigned researcher

- Main agent: choose the active host route below. Where delegation is required,
  dispatch the narrow contract and obtain its result before dependent work.
- Assigned researcher (including a reused child or Worker): investigate directly
  as the sole researcher; do not delegate again or run the main-agent route.
- Before every dispatch or reuse assignment, briefly tell the user the
  researcher's role and task in one sentence. This is disclosure, not an
  additional permission request. Actual session authorization and tool schemas
  still take precedence over this skill.
- Reuse a suitable same-role worker only when the current host supports it and
  its identity is known. Do not infer a role from unrelated task text or reuse
  a knowledge-finalizer. Lack of reuse does not prevent a fresh bounded child.
  On DSH this lookup and fallback belong to the adapter, not the main agent.

## Host routing

Select the active adapter from its current trusted `[claw host]` platform marker
or native adapter identity and verify its tools, not the model or location of
this file. Follow using-claw-kit's identity precedence; remote tool identity does
not override the current session. A conflict or unknown host is an explicit gap,
not a fallback to another platform. A native adapter takes precedence over a
hostless copy.
Read only the matching section of [Host execution](references/host-execution.md).

| Host | Main-agent route | Project recall |
| --- | --- | --- |
| DSH | `claw_run` `delegate.start` / `delegate.result`; adapter owns backend selection and reuse. | `claw_run` operation `search`, args `{query}` |
| Codex | Native same-thread researcher reuse or fresh agent; wait for its result. | Read-only `claw search --query "<topic>"` through the permitted Codex shell tool; no forged host/session arguments |
| Cindy | Exact-role Orca researcher Worker; after accepted dispatch end the Lead turn. | Cindy Ghost `list_tools` / `call_tool` search operation |
| OpenCode | Direct investigation when invoked inline; use its task/explorer subagent when the owning workflow delegates. | Active OpenCode adapter injected command route |
| Standard hostless | Direct investigation, or a native subagent when the owning workflow requires one and the host supports it. | `claw search --query "<topic>"` with stable `CLAW_SESSION_ID`; no host flag |

Do not replace a failed native adapter call with a hostless CLI call. If recall
or an optional code index is unavailable, report that gap and continue with the
remaining read-only evidence route; do not claim the missing evidence exists.

## Investigation order

1. Use project recall before broader source investigation. Recover the relevant
   Truth, ADR and declared documentation, not an indiscriminate repository dump.
2. Read project configuration when needed to discover enabled code indexes or
   routing capabilities, including team configuration and personal overrides.
3. Use GitNexus or another configured index for symbol relationships and
   architecture tracing. Fall back to exact source inspection if unavailable
   or too narrow; document consequential gaps.
4. Inspect only the files, symbols, tests and relationships needed to answer the
   question with host read/search tools. On DSH use `read`, `glob` and
   `grep`, not shell equivalents.
5. Separate confirmed behavior from inference. Stop when the question can be
   answered or the smallest missing evidence can be identified.

## Delegation contract

This is a role contract, not literal tool arguments. Map it to the current
host tool schema. Include the loaded skill path and host route in a fresh brief;
never assume a same-named project copy represents that route.

```yaml
delegateSubagents:
  - name: researcher
    skill: researcher
    worker: readonly
    fork_context: false
    waitForCompletion: true
    preferReuse: true
    inputContract:
      question: concrete bounded investigation question
      cwd: working directory
      targets: known files, modules, or symbols
      constraints: read-only boundaries and repository state to preserve
      skillPath: absolute path of this loaded skill
      hostRoute: active adapter and its recall/dispatch route
    outputContract:
      status: answered or unresolved
      findings: concise evidence with exact paths, symbols, and line anchors
      uncertainty: explicit gaps or none
      nextStep: recommendation for the main agent
    closePolicy: keep_open_for_reuse
```

Cindy Workers may also report `blocked` through their supplied
`send_to_lead` tool. Other hosts return the contract through their native
result channel. Keep large narratives out unless the investigation needs them.
