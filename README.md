[English](README.md) · [简体中文](README.zh-CN.md)

# claw-kit

An out-of-the-box, beginner-friendly, professional-grade harness for coding agents.

[![npm version](https://img.shields.io/npm/v/@veewo/claw)](https://www.npmjs.com/package/@veewo/claw)
[![npm downloads](https://img.shields.io/npm/dm/@veewo/claw)](https://www.npmjs.com/package/@veewo/claw)
[![license](https://img.shields.io/npm/l/@veewo/claw)](./LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/chanyuenpang/claw-kit)](https://github.com/chanyuenpang/claw-kit/stargazers)

## What you get

### Project memory

The plan and the findings stay in the repo. The agent writes the workflow under `.claw/tasks/` and recovers it on a later session. Closeout writes reusable Truth notes and ADRs into the project, and the agent searches those notes when it needs them. A persistent session keeps the same workdir and current plan.

Want to see what the note-taker records? Browse this repo's own [`.claw`](https://github.com/chanyuenpang/claw-kit/tree/main/.claw) folder — claw-kit is built with claw-kit. The notes are written for agents, not humans (mostly in Chinese here), and maintained automatically, so you never have to read or update them.

### Code-quality skills

These skills shape the change before and around the code:

- **planning** turns a request into requirements, scope, completion criteria, and tasks you can check off.
- **feature-architecture** writes a short design for a high-risk or cross-system change: owners, invariants, one failure path, and the smallest slice. It reads the source. With an active task, the design report is the one file it adds.
- **researcher** answers a bounded question about the code, the behavior, or existing Truth and ADR notes, with evidence, and does not edit the repo.

The standard skill set and the DSH, Codex, and OpenCode adapters include all three. Cindy's public plugin includes planning and researcher.

### Team collaboration

`.claw/project.json` is the workflow the team shares: planning on or off, the default plan template, and recall settings. `.claw/project-override.json` holds one person's local preferences. Repeated work can live as templates under `.claw/templates`. Truth and ADR files are written into the project for the next person to read. Committing them stays in your normal git flow.

The harness joins a repository after that repository is initialized for `.claw`.

## Platforms

| Where the agent runs | What you use | Status |
| --- | --- | --- |
| Any platform that can run a shell | `claw` CLI plus the standard skills. [Universal install](#universal-install). `claw init` writes an `AGENTS.md` bootstrap, so no hook is required. | Universal path, [feedback welcome](https://github.com/chanyuenpang/claw-kit/issues/new?template=platform-adapter.yml) |
| Claude Code | `claw` CLI plus the standard skills. No dedicated adapter. Install, `claw init`, then talk. Bootstrap is the instruction file Claude Code actually reads: `CLAUDE.md`, or `AGENTS.md` when the project has no `CLAUDE.md`. | Universal path, [feedback welcome](https://github.com/chanyuenpang/claw-kit/issues/new?template=platform-adapter.yml) |
| DeepSeek Harness (DSH) | Dedicated adapter. One `claw_run` tool, progress and native goal sync, knowledge closeout dispatched by the adapter. npm: `@veewo/dsh-claw-kit`. | Stable |
| Codex | Dedicated adapter. Marketplace plugin with skills, hooks, and the same workflow. | Stable |
| Cindy | Dedicated adapter. Install `claw-kit-cindy` from the Cindy marketplace. | Stable |
| OpenCode | Dedicated adapter. Plugin, shim, agents, and skills. | Adapter available, testing |

DeepSeek Harness, Codex and Cindy are stable — a team already uses them to write code every day. OpenCode has an adapter that is still being tested. Other platforms: please try it and [open an issue](https://github.com/chanyuenpang/claw-kit/issues/new?template=platform-adapter.yml) or PR if anything breaks.

DSH and Codex are the adapters to install first. Each bundles nine skills, including knowledge capture and a host update skill, and both apply the shared progress and goal actions in the host. Cindy and OpenCode are dedicated adapters with a smaller skill set. OpenClaw ships the documentation skill only; see the [package map](#package-map).

## Quick start

Install, initialize the project once, then talk to your agent as usual. You do not run workflow commands, set a session id, or paste a startup prompt.

### 1. Install

`@veewo/claw` needs Node.js 22.13 or newer.

```bash
npm install -g @veewo/claw
```

On DeepSeek Harness, Codex, Cindy, or OpenCode, also install that adapter. It brings the `using-claw-kit` skill with it.

- **DeepSeek Harness:** `dsh plugin --profile web add @veewo/dsh-claw-kit@latest`, then restart the host. [Install the DSH adapter](#install-the-dsh-adapter).
- **Codex:** add the marketplace and install **Claw Kit**. [Install the Codex plugin](#install-the-codex-plugin).
- **Cindy** and **OpenCode** have their own install sections below.

Claude Code has no dedicated adapter. Cursor and any other shell or cloud agent use the same [universal install](#universal-install): the CLI, the copied standard skills, and `claw init`.

### 2. Initialize the project

```bash
cd your-project
claw init
```

`claw init` creates `.claw/` and writes a bootstrap block into `AGENTS.md`, between `<!-- claw-kit:bootstrap:start -->` and `<!-- claw-kit:bootstrap:end -->`. That block tells the agent to load and follow `using-claw-kit` when it starts project work or restores context. The skill picks the host entry, resumes an existing workflow, and decides whether a plan is needed. A casual question does not become a plan. Claude Code loads `CLAUDE.md` and skips `AGENTS.md` when a `CLAUDE.md` is already on the project path, so that same block also has to be in `CLAUDE.md` for those projects.

### 3. Talk

Ask in ordinary language, for example: "Plan a fix for the login bug."

### How it starts

That is the whole setup. Where the host has a startup hook, that hook runs by itself and points the agent at `using-claw-kit`. Everywhere else, including Claude Code, the instruction-file bootstrap does that job.

| Host | What starts the flow |
| --- | --- |
| Codex | The plugin's `SessionStart` hook runs context recovery and tells the agent to load `using-claw-kit`. |
| DeepSeek Harness (DSH) | The `agent/session-start` hook runs context recovery and injects the same instruction. The agent then calls `claw_run`. |
| OpenCode | The plugin handles `session.created` and `session.compacted` (OpenCode has no `hooks.json`). It recovers context and sets the session id for later claw commands. |
| Cindy | Ghost session and turn hooks refresh session state and can continue an active plan. They do not inject a first-turn prompt. The agent follows the installed `using-claw-kit` skill, which the `AGENTS.md` bootstrap also names. |
| Claude Code | No hook and no dedicated adapter. Install the CLI and skills, run `claw init`, then talk. Claude Code loads `CLAUDE.md` at launch. It loads `AGENTS.md` only when the project path has no `CLAUDE.md`, `.claude/CLAUDE.md`, or `CLAUDE.local.md`. |
| Any other agent | No hook. The `AGENTS.md` bootstrap is the startup path. Install with [universal install](#universal-install). |

<h2 id="universal-install">Universal install (shell and cloud agents)</h2>

Cursor, Claude Code, and any other host without a native adapter use this path: the CLI, the copied skills, and `claw init`. Do not pass `--host` or set `CLAW_HOST`.

### 1. Install the CLI

Requires Node.js 22.13 or newer. `@veewo/claw` is the CLI only.

```bash
npm install -g @veewo/claw
claw --version
```

If that fails with `EACCES` (often `mkdir '/usr/lib/node_modules'`), the first `node` on `PATH` is a system binary and npm is targeting a root prefix. Put your user-owned Node first — for nvm, its `bin` directory, such as `export PATH="$HOME/.nvm/versions/node/<version>/bin:$PATH"` — until `npm prefix -g` is a directory you can write, then run the install again. Or install into a writable prefix: `npm install -g --prefix "$HOME/.local" @veewo/claw` and `export PATH="$HOME/.local/bin:$PATH"`.

### 2. Copy the standard skills

From a clone of this repository, copy only the directories named in [packages/standard-adapter/skill-inputs.json](packages/standard-adapter/skill-inputs.json) — `planning`, `config`, `create-claw-skill`, `feature-architecture`, `researcher`, `using-claw-kit`, and `claw-kit-doc` — from `.agents/skills/` into the target project. Those directories are the canonical sources.

Cursor loads `<project>/.agents/skills/<skill>/SKILL.md`. For Cursor, and for any host with that layout, the destination is the target project's `.agents/skills/`:

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

Another host uses the directory it scans for skills. `npm run export:standard-skills` is optional. It reprints the same folders under `dist/standard-skills/skills/` and needs `npm install` at the repository root first. On a fresh clone it fails with `Cannot find package 'typescript'` until those dependencies are installed.

### 3. Initialize, then let the agent follow the skill

```bash
cd /path/to/your-project
claw init
```

`claw init` writes a short `using-claw-kit` bootstrap into `AGENTS.md` and `CLAUDE.md`. The agent loads that skill, sets one stable `CLAW_SESSION_ID` for the conversation, and runs `claw context` before it decides whether to create a plan. You do not set the session id or paste a startup prompt.

## What the agent does under the hood

This is not part of setup. After install and `claw init`, the agent follows `using-claw-kit` and runs these itself:

- **`claw context`** recovers an active workflow, or reports that none is bound. Codex, DSH, and OpenCode also run this from the startup hook or plugin event above.
- **Session id.** Codex's `SessionStart` hook and OpenCode's plugin copy the host session id into `CLAW_SESSION_ID`. DSH and Cindy forge session identity inside the adapter. On a host with no adapter, the skill sets a stable `CLAW_SESSION_ID` for the conversation.
- **`claw search index --refresh`** runs only when project recall needs a vector index. **`claw search`** then reads Truth notes and ADRs.
- **`claw plan create`** runs only when the skill decides the work should become a plan.

`claw-kit` is a project-level workflow and knowledge layer for agentic work.

It gives agents a durable way to plan before they execute, retain reusable project knowledge, and close work out cleanly inside initialized `.claw` projects instead of leaving progress trapped in transient chat state.

## Product page

The GitHub Pages product deck lives in [docs/index.html](docs/index.html) and is designed as a bilingual, scroll-driven introduction to `claw-kit`.

## What it gives a project

- Project-scoped planning and task lifecycle around `.claw`, with automatic local project initialization when a plan is first created
- Truth and ADR deposition so useful knowledge survives across sessions
- Recall-oriented search over project docs before broader investigation
- Closeout workflows that keep tasks, notes, and decisions aligned
- Planning surfaces that can stay enabled, be turned off, or be routed through a custom planning skill
- Adapter surfaces that let the same workflow shape land in different agent hosts
- A persistent, host-neutral session daemon and typed Node client that retain
  workdir and current-plan focus across operations

## Why teams use it

- Project-level instead of always-on: `claw-kit` becomes part of the workflow only after a repository has been initialized for `.claw`, so it can feel seamless inside opted-in projects without trying to take over every repo by default.
- Plan before execute: the `.claw` plan structure gives agents a durable workflow to return to, which helps complex or longer-running tasks move forward more steadily than loose chat state alone.
- Flexible by design: teams can disable planning, plug in their own planning behavior, or embed `claw-kit` into another harness instead of being locked to a single host or investigation tool.
- Truth and ADR stay reusable: the workflow maintains truth and ADR as durable project knowledge, then makes that context available again through project recall.
- Team-friendly config: `.claw/project.json` holds the shared canonical workflow, while `.claw/project-override.json` leaves room for personal runtime preferences.
- GitNexus can complement that workflow when a task needs deeper code investigation or relationship tracing, but it is optional rather than required.

## How it fits with other tools

- `claw-kit` owns the project workflow layer inside initialized projects: plan, recall, truth/ADR, and closeout.
- GitNexus is an optional companion for deeper code investigation and relationship tracing.
- Host adapters bring the same workflow into DeepSeek Harness (DSH), Codex, Cindy, and OpenCode. Any other agent that can run a shell uses the CLI plus the standard skills. The workflow can also sit inside another harness.

## Workflow shape

In a typical round, `claw-kit` helps an agent move through a repeatable loop:

`plan` -> `search and recall` -> `execute` -> `close out` -> `finalize reusable knowledge`

That loop is the core product idea: a reusable project workflow instead of a one-off chat session.

## Where to start

- Want to use the CLI in a project? Start with the install and setup section below, then read the CLI package guide in [packages/cli/README.md](packages/cli/README.md).
- Want to understand the integration surfaces? Jump to the package map.
- Need backup config details? Use the adapter reference notes in [packages/codex-adapter/references/project-config-reference.md](packages/codex-adapter/references/project-config-reference.md) or [packages/opencode-adapter/references/project-config-reference.md](packages/opencode-adapter/references/project-config-reference.md) when needed.

## Install the CLI

Shell and cloud agents, including Cursor, also copy skills and run `claw init`. Use [Universal install (shell and cloud agents)](#universal-install), including the `EACCES` note when a system `node` is ahead of your user-owned Node.

Install the published CLI with Node.js 22.13 or newer:

```powershell
npm install -g @veewo/claw
```

Or use the one-shot install script:

```powershell
.\scripts\install-cli.ps1
```

In each project, run `claw init` once. That is the user command. The snippets below are what the agent runs through `using-claw-kit`; see [What the agent does under the hood](#what-the-agent-does-under-the-hood). Do not run `claw context`, `claw search index --refresh`, or set `CLAW_SESSION_ID` yourself.

Reference commands the agent uses:

```powershell
claw init --max-tasks-to-keep 20 --planning true --external-planning-skill team-planning-skill --external-writer-skill external-knowledge-writer
claw plan create --title "My task" --goal "Define the first task"
claw plan create "My templated task" --template default --goal "Use the default template"
claw plan create "Auxiliary workflow" --no-knowledge-capture --goal "Run the full workflow without project deposition"
```

For a persistent terminal session, open the immutable project workdir together
with the host agent session id:

```powershell
claw session open G:\Projects\my-project agent-session-id
```

Commands entered after that point reuse the session workdir and current plan.
`plan create`, `plan resume [planId]`, and `plan leave` change current-plan
focus; ordinary `plan` and `task` commands do not need a repeated task name or
plan file. Use `search --dir <other-dir> <query>` for one cross-directory
lookup without changing the session workdir. Closing the terminal disconnects
the live client but retains session metadata for seven days.

`claw plan create` now routes through seed-plan templates. Explicit `--template` wins first; otherwise claw uses `defaultPlanTemplate` from `.claw/project.json` or `.claw/project-override.json`, then falls back to the built-in `default` template. Planning-enabled projects start in `process.discussing` with a planning task plus an activation bridge task; planning-disabled projects start directly in `process.active`. The planning task analyzes the request and uses the configured planning skill to fill executable tasks. `claw search --query "<topic>"` remains an optional command hint, not a mandatory planning step.

`claw context` emits only the minimum public recovery surface: project identity and paths, an active workflow when one exists, recovery or version diagnostics only when action is needed, and optional search guidance derived from enabled embedding and GitNexus capabilities. Named-host adapters own startup recovery on their hosts and supply the current host identity; the standard hostless flow instead invokes `claw context` directly with no host, driven by the entry contract. The internal SessionStart path retains the full resolved context needed for recovery and protocol handling. Claw-generated guidance, return metadata, and host prompt text use English; user-supplied plan content and repository document language are preserved.

New project tasks are grouped under `.claw/tasks/YYYY-MM-DD/`. `claw context` performs a lock-protected lazy daily maintenance pass: it clears `.claw/runtime/tmp/` (and removes the legacy `.claw/tmp/`), moves date-scoped task folders from before yesterday into the archive (regardless of whether old plans have `completedAt`), archives legacy flat tasks by `plan.updatedAt` (falling back to the plan file timestamp), applies `maxTasksToKeep` to the archive, removes bindings to plans no longer under active tasks, and sweeps expired session workflows. It runs on the first context call of each local calendar day; it does not install a background scheduler.

New plans use the current or ancestor project and automatically create missing local claw structure and default configuration. `--knowledge-capture false` (or `--no-knowledge-capture`) disables knowledge accumulation only; it does not select another store, discard existing configuration, attach a session TTL, or waive normal completion requirements. `--scope` is no longer accepted. Existing session-stored workflows remain recoverable in place; session identity still binds focus and authorizes work.

Projects can define reusable templates directly under `.claw/templates` using `.json`, `.js`, `.mjs`, or `.cjs` files. Use `.claw/project.json` for a shared team `defaultPlanTemplate`, or `.claw/project-override.json` for a personal runtime override.

## Use the standard hostless flow (any platform)

Platforms without a native adapter — or any agent environment that can run
shell commands — follow [Universal install (shell and cloud agents)](#universal-install).
No `--host` flag, no `CLAW_HOST` registration, and no lifecycle hooks. `claw init`
writes the `AGENTS.md` bootstrap that tells the agent to load `using-claw-kit`.

The agent then keeps the full loop. It runs `claw context` to recover a
session-bound plan, `claw plan create` when a plan is warranted, and at
`plan done` capture-enabled work follows the standard closeout owner: by default,
same-agent `knowledge prepare/complete --source agent-memory`. An explicitly
configured background route uses its supplied capture/dispatch steps and a
non-capturing auxiliary writer plan. `knowledgeCapture: false` prevents recursive
knowledge accumulation; no public storage-scope choice is needed. See
[packages/standard-adapter/README.md](packages/standard-adapter/README.md)
for details.

## Install the Codex plugin

The Codex plugin is a separate distribution surface from the CLI. On another machine, add the official repository marketplace first:

```powershell
codex plugin marketplace add chanyuenpang/claw-kit --ref vcodex-0.2.42.1
```

Restart the ChatGPT desktop app, open the plugin directory, choose the **Claw Kit** marketplace, and install **Claw Kit**. Start a new task after installation so Codex discovers the bundled skills. For a newer release, select its published `vcodex-*` ref in the marketplace registration first; a pinned old ref does not advance by itself. Refresh the selected Git-backed marketplace with:

```powershell
codex plugin marketplace upgrade claw-kit
codex plugin add claw-kit@claw-kit
```

An upgrade is complete only when `claw-kit@claw-kit` is the enabled identity and its installed manifest matches the target version. A newer directory under the Codex plugin cache is not sufficient: if an older same-name identity such as `claw-kit@claw-kit-local` remains enabled, Codex can continue loading that older marketplace source.

The published `vcodex-*` artifact tag contains `.agents/plugins/marketplace.json` pointing to the fully materialized `packages/codex-adapter` tree; source `main` is not an installable marketplace after canonical skill migration. Codex can therefore copy every shared skill and resource into its plugin cache without running repository or npm lifecycle scripts.

The committed Git marketplace snapshot is the Codex plugin release artifact. GitHub Release ZIP attachments are not required. Use a full repository checkout; a sparse checkout containing only `.agents/plugins` omits the referenced `packages/codex-adapter` payload.

Maintainers working inside this repository have two Codex commands:

```powershell
npm run export:codex-plugin
npm run install:codex-plugin
```

What they do:

1. `npm run export:codex-plugin` copies the installable plugin payload into `dist/codex-plugin/claw-kit/<plugin-version>/`.
2. `npm run install:codex-plugin` fetches the published immutable `vcodex-<plugin-version>` marketplace tag, installs that payload into `%USERPROFILE%\.codex\plugins\cache\claw-kit\claw-kit\<plugin-version>\`, enables `claw-kit@claw-kit`, and disables `claw-kit@claw-kit-local`.

Release the new version before running `install:codex-plugin`; it deliberately refuses to install unpublished workspace content. Local marketplace installation is not a supported verification or update path.

Validate a template without creating a plan with `claw template validate --template <id>`. This command resolves templates through the same registry used by `claw plan create` and `claw subplan create`, and reports route-aware tasks that require a choice id.

## Install the OpenCode plugin

The OpenCode plugin is a separate distribution surface from the CLI. The source of truth lives in `packages/opencode-adapter`, and this repo exposes two supported commands:

```powershell
npm run export:opencode-plugin
npm run install:opencode-plugin
```

What they do:

1. `npm run export:opencode-plugin` copies the installable plugin payload into `dist/opencode-plugin/claw-kit/<plugin-version>/`.
2. `npm run install:opencode-plugin` copies that same payload into the local OpenCode config at `~/.config/opencode/plugins/claw-kit/`, then:
   - creates a plugin shim at `~/.config/opencode/plugins/claw-kit.ts` so OpenCode can discover the plugin at startup,
   - copies each skill folder into `~/.config/opencode/skills/` so the adapter skills become available (OpenCode discovers skills only from convention directories, not via a config option),
   - copies the bundled agent definitions into `~/.config/opencode/agent/`.

Restart OpenCode after installing so the new plugin, skills, and agents are picked up.

Use `install:opencode-plugin` when you want this machine to start using the adapter immediately. Use `export:opencode-plugin` when you want a clean versioned bundle that can be attached to a release, copied to another machine, or used by another installer.

## Install the Cindy plugin

The Cindy adapter is distributed from its own Git marketplace repository. In
Cindy, add `https://github.com/chanyuenpang/claw-kit-cindy-adapter.git` as a
marketplace, install the `claw-kit-cindy` entry, review permissions, and enable
it. The `claw` CLI remains a separate installation. For the full install and
update sequence, see
[packages/cindy-adapter/README.md](packages/cindy-adapter/README.md).

## Install the DSH adapter

The DSH adapter is an npm package installed into a DSH profile. From a
published registry:

```powershell
dsh plugin --profile web add @veewo/dsh-claw-kit@latest
```

Restart the Host (`dsh --profile web`) to mount the `claw-kit` row; then
confirm the `claw_run` tool and the bundled skills appear. The installed `claw`
CLI must support `--host dsh`.

The Electron-managed `desktop` profile is the exception: the global `dsh` on
`PATH` refuses it with `profile "desktop" is managed exclusively by the Electron
application`, so install through the profile's own plugin manager —
`plugin_manager(action: "install_bundle", target: "@veewo/dsh-claw-kit@<version>")`
or the exported tarball path — and never by writing profile files directly. See
[the desktop profile write boundary](packages/dsh-adapter/skills/update/references/desktop-profile-write-boundary.md).

Maintainers working inside this repository have two commands:

```powershell
npm run export:dsh-plugin     # build + pack the installable tarball into dist/dsh-plugin/
npm run install:dsh-plugin    # dsh plugin --profile web add <tarball> (--profile to override)
```

`install:dsh-plugin` runs the global `dsh` on `PATH`, so it works for
non-Electron profiles only; use the `plugin_manager` path above for `desktop`.

The adapter consumes CLI hostActions automatically (progress projection +
native goal sync) and auto-dispatches knowledge finalization through a native
DSH subagent; the model only drives the single `claw_run` tool. See
[packages/dsh-adapter/README.md](packages/dsh-adapter/README.md) for details.

## Package map

- `@veewo/claw`
  - CLI entrypoint for running the `.claw` workflow in a project
- `@veewo/claw-client`
  - lightweight typed Node API for the same persistent session daemon used by
    `claw session open`
- `@veewo/claw-core`
  - shared workflow primitives for project config, planning, search, truth ingestion, and retention
- `@claw-kit/standard-adapter`
  - host-neutral adapter assets (entry contract + skills) for running the
    workflow from any platform that can execute shell commands, without host
    registration or hooks
- `@claw-kit/codex-adapter`
  - Codex-facing adapter assets, hooks, skills, and references for landing the workflow in Codex
- `@veewo/dsh-claw-kit`
  - DSH-facing Cordis plugin exposing the `claw_run` tool, automatic hostActions
    consumption (progress + native goal sync), auto-dispatched knowledge
    finalization, and seven bundled skills
- `@claw-kit/openclaw-adapter`
  - OpenClaw-facing adapter layer built on the same core workflow model
- `@claw-kit/opencode-adapter`
  - OpenCode-facing adapter that lands the workflow in OpenCode through a TypeScript plugin, a plugin shim, agent definitions, and skills

## `project.json` at a glance

`.claw/project.json` is the canonical team-owned workflow config for a project, and `.claw/project-override.json` is the local runtime-only overlay for personal preferences.

When changing claw configuration through the plugin, use the `config` skill first. It asks whether the change is shared team config or personal local config, then routes to `.claw/project.json` or `.claw/project-override.json` with the current flat field shape.

When you need backup detail, start with the adapter reference notes above and use [docs/project-json-reference.md](docs/project-json-reference.md) only for deeper canonical detail:

- shared vs local config boundaries
- project template defaults and `.claw/templates` usage
- memory, workflow, GitNexus, and writer override fields
- copyable examples when you need to tune a real project

## Contributing

Platform problems and small fixes are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the issue form, local setup, and how to send a PR. Issues labeled `good first issue` are a good place to start.

## Maintainer docs

For release and distribution steps, use the canonical maintainer workflow in [DISTRIBUTION.md](DISTRIBUTION.md) and the repository-local `release-claw-kit` skill.
