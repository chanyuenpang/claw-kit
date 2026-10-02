# Standard hostless adapter

The standard adapter is claw-kit's host-neutral surface: the full `.claw`
workflow usable from **any** agent platform that can run shell commands — no
native adapter, no `--host` registration, no lifecycle hooks.

It exists because the claw CLI already owns the canonical workflow state
machine. The standard flow simply removes the host layer: session identity
comes from `CLAW_SESSION_ID`, recovery comes from `claw context`, and
knowledge closeout is executed by the invoking agent itself through the
default main-agent prepare/complete route (or the explicitly selected background chain).

## What's here

- `docs/entry-contract.md` — the entry rules to paste into any platform's
  system-prompt surface (CLAUDE.md / AGENTS.md / rules / custom instructions).
- `skill-inputs.json` — the declared skill inputs, assembled into artifact `skills/`:
  - `using-claw-kit` — main entry: host identity, first action, lifecycle,
    and policy-specific closeout (main-agent by default).
  - `planning`, `researcher`, `config`, `feature-architecture`,
    `create-claw-skill` — canonical shared workflow packages; no source mirrors.
  - `claw-kit-doc` — documentation entry (configuration, knowledge format).
- `package.json` — package metadata.

## Installation on a host platform

There is no host marketplace to register with. To adopt the standard flow:

1. Install the CLI: `npm install -g @veewo/claw`.
2. Build the complete standard artifact with `npm run export:standard-skills`.
   Copy its `skills/` into the platform's discovery location, or explicitly
   reference the canonical source packages in development; the adapter source
   tree intentionally contains no generated skill copies.
3. Paste `docs/entry-contract.md` into the platform's persistent prompt
   surface for the project.
4. Ensure the conversation exports a stable `CLAW_SESSION_ID`.

## Key semantics

- **Scope and capture are independent.** `--scope session` selects temporary
  storage; use the explicit `--no-knowledge-capture` opt-out when no deposition
  is intended. Internal writer templates disable recursive capture explicitly.
- **Direct knowledge closeout.** The agent runs `claw knowledge prepare/complete --source agent-memory` from conversation memory. No job, transcript capture, or worker is involved.

## Relationship to the named adapters

Codex, Cindy, DSH, and OpenCode adapters remain the enhanced paths on their
hosts (native projections, subagent dispatch, hooks). The standard adapter is
the floor that every platform gets for free, and the fallback shape when a
host's native integration is unavailable.
