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

There is no host marketplace to register with. The published `@veewo/claw`
package does not include these skills. To adopt the standard flow:

1. Install the CLI: `npm install -g @veewo/claw` (Node.js 22.13 or newer).
2. From a clone of this repository, copy each skill directory named in
   `skill-inputs.json` from `.agents/skills/` into the host's skill discovery
   location. Those directories are the canonical sources. Cursor, and any
   other agent that loads `<project>/.agents/skills/<skill>/SKILL.md`, uses
   the target project's `.agents/skills/`.
   `npm run export:standard-skills` writes the same folders to
   `dist/standard-skills/skills/`, but only after `npm install` at the repo
   root. On a fresh clone the export fails until dependencies are installed,
   because the exporter imports them at startup.
3. In the target project, run `claw init`. It writes the short
   `using-claw-kit` bootstrap into `AGENTS.md` and `CLAUDE.md` when the host
   loads those files. Paste `docs/entry-contract.md` only when the host's
   persistent prompt is neither file.
4. The `using-claw-kit` skill sets one stable `CLAW_SESSION_ID` for the
   conversation before claw commands. Do not pass `--host` or set `CLAW_HOST`.

## Key semantics

- **One creation flow, optional capture.** Core initializes missing local project
  structure/defaults automatically. Use `--knowledge-capture false` or
  `--no-knowledge-capture` when no deposition is intended; this does not change
  storage or completion rules. Internal writer templates prevent recursive capture.
  Old session-stored workflows remain recoverable; `--scope` is not a new input.
- **Direct knowledge closeout.** The agent runs `claw knowledge prepare/complete --source agent-memory` from conversation memory. No job, transcript capture, or worker is involved.

## Relationship to the named adapters

Codex, Cindy, DSH, and OpenCode adapters remain the enhanced paths on their
hosts (native projections, subagent dispatch, hooks). The standard adapter is
the floor that every platform gets for free, and the fallback shape when a
host's native integration is unavailable.
