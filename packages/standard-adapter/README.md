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

Cursor, Claude Code, and any other host without a native adapter use this
path. The same steps are the repository
[universal install](../../README.md#universal-install). Do not pass `--host`
or set `CLAW_HOST`.

### 1. Install the CLI

Requires Node.js 22.13 or newer. The published `@veewo/claw` package is the
CLI only.

```bash
npm install -g @veewo/claw
claw --version
```

If that fails with `EACCES` (often `mkdir '/usr/lib/node_modules'`), the first
`node` on `PATH` is a system binary and npm is targeting a root prefix. Put
your user-owned Node first — for nvm, its `bin` directory, such as
`export PATH="$HOME/.nvm/versions/node/<version>/bin:$PATH"` — until
`npm prefix -g` is a directory you can write, then run the install again. Or
install into a writable prefix:
`npm install -g --prefix "$HOME/.local" @veewo/claw` and
`export PATH="$HOME/.local/bin:$PATH"`.

### 2. Copy the standard skills

From a clone of this repository, copy only the directories named in
`skill-inputs.json` — `planning`, `config`, `create-claw-skill`,
`feature-architecture`, `researcher`, `using-claw-kit`, and `claw-kit-doc` —
from `.agents/skills/` into the target project. Those directories are the
canonical sources.

Cursor loads `<project>/.agents/skills/<skill>/SKILL.md`. For Cursor, and for
any host with that layout, the destination is the target project's
`.agents/skills/`:

```bash
mkdir -p /path/to/your-project/.agents/skills
cp -a .agents/skills/planning \
      .agents/skills/config \
      .agents/skills/create-claw-skill \
      .agents/skills/feature-architecture \
      .agents/skills/researcher \
      .agents/skills/using-claw-kit \
      .agents/skills/claw-kit-doc \
      /path/to/your-project/.agents/skills/
```

Another host uses the directory it scans for skills.
`npm run export:standard-skills` is optional. It reprints the same folders
under `dist/standard-skills/skills/` and needs `npm install` at the repository
root first. On a fresh clone it fails with `Cannot find package 'typescript'`
until those dependencies are installed.

### 3. Initialize, then let the agent follow the skill

```bash
cd /path/to/your-project
claw init
```

`claw init` writes a short `using-claw-kit` bootstrap into `AGENTS.md` and
`CLAUDE.md` when the host loads those files. Paste `docs/entry-contract.md`
only when the host's persistent prompt is neither file. The agent loads
`using-claw-kit`, sets one stable `CLAW_SESSION_ID` for the conversation, and
runs `claw context` before it decides whether to create a plan.

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
