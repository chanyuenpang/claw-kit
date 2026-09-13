# Standard hostless adapter

The standard adapter is claw-kit's host-neutral surface: the full `.claw`
workflow usable from **any** agent platform that can run shell commands — no
native adapter, no `--host` registration, no lifecycle hooks.

It exists because the claw CLI already owns the canonical workflow state
machine. The standard flow simply removes the host layer: session identity
comes from `CLAW_SESSION_ID`, recovery comes from `claw context`, and
knowledge closeout is executed by the invoking agent itself through the
background chain.

## What's here

- `docs/entry-contract.md` — the entry rules to paste into any platform's
  system-prompt surface (CLAUDE.md / AGENTS.md / rules / custom instructions).
- `skills/` — the skill set:
  - `using-claw-kit` — main entry: host identity, first action, lifecycle,
    and the three-step background closeout chain.
  - `planning`, `researcher`, `config`, `feature-architecture`,
    `create-claw-skill` — host-neutral workflow skills generated from the
    shared source.
  - `claw-kit-doc` — documentation entry (configuration, knowledge format).
- `package.json` — package metadata.

## Installation on a host platform

There is no host marketplace to register with. To adopt the standard flow:

1. Install the CLI: `npm install -g @veewo/claw`.
2. Copy (or vendor) the `skills/` directories into the platform's skill
   discovery location, or reference them from the project's skill config.
3. Paste `docs/entry-contract.md` into the platform's persistent prompt
   surface for the project.
4. Ensure the conversation exports a stable `CLAW_SESSION_ID`.

## Key semantics

- **Session scope is not the standard flow.** `--scope session` marks a
  temporary task that deliberately skips knowledge deposition. The standard
  flow's root plans are project-scoped; only the knowledge-writer delegate
  plan is session-scoped, as a recursion guard.
- **Main-agent policy by default.** The hostless shape resolves an omitted
  `knowledgeWriter.executionPolicy` to `main-agent`: the agent itself runs the
  `claw knowledge prepare/complete --source agent-memory` closeout from its own
  memory with no transcript capture. `background` remains available as an
  explicit opt-in (inline capture + agent-executed writer plan). `subagent`
  requires a host-registered claim-time report collector (Codex, Cindy, DSH)
  and is rejected on this shape.
- **Recovery is durable.** Unfinished background jobs remain claimable; a
  later conversation resumes the chain from the dispatch step (or capture, if
  the report was never written).

## Relationship to the named adapters

Codex, Cindy, DSH, and OpenCode adapters remain the enhanced paths on their
hosts (native projections, subagent dispatch, hooks). The standard adapter is
the floor that every platform gets for free, and the fallback shape when a
host's native integration is unavailable.
