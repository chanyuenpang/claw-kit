# claw-kit

`claw-kit` is a project-level workflow and knowledge layer for agentic work.

It gives agents a durable way to plan before they execute, retain reusable project knowledge, and close work out cleanly instead of leaving progress trapped in transient chat state.

## What it gives a project

- Project-scoped planning and task lifecycle around `.claw`
- Truth and ADR deposition so useful knowledge survives across sessions
- Recall-oriented search over project docs before broader investigation
- Closeout workflows that keep tasks, notes, and decisions aligned
- Adapter surfaces that let the same workflow shape land in different agent hosts

## Why teams use it

- Plan before execute: the `.claw` plan structure gives agents a durable workflow to return to, which helps complex or longer-running tasks move forward more steadily than loose chat state alone.
- Flexible by design: `claw-kit` can work alongside other harnesses or external skills instead of assuming a single host or investigation tool.
- Truth and ADR stay reusable: the workflow maintains truth and ADR as durable project knowledge, then makes that context available again through project recall.
- Team-friendly config: `.claw/project.json` holds the shared canonical workflow, while `.claw/project-override.json` leaves room for personal runtime preferences.
- GitNexus can complement that workflow when a task needs deeper code investigation or relationship tracing, but it is optional rather than required.

## How it fits with other tools

- `claw-kit` owns the project workflow layer: plan, recall, truth/ADR, and closeout.
- GitNexus is an optional companion for deeper code investigation and relationship tracing.
- Host adapters bring the same workflow model into environments like Codex and OpenCode.

## Workflow shape

In a typical round, `claw-kit` helps an agent move through a repeatable loop:

`plan` -> `search and recall` -> `execute` -> `deposit truth / ADR` -> `close out`

That loop is the core product idea: a reusable project workflow instead of a one-off chat session.

## Where to start

- Want to use the CLI in a project? Start with the install and setup section below, then read the CLI package guide in [packages/cli/README.md](packages/cli/README.md).
- Want to understand the integration surfaces? Jump to the package map.
- Need backup config details? Use the adapter reference notes in [packages/codex-adapter/references/project-config-reference.md](packages/codex-adapter/references/project-config-reference.md) or [packages/opencode-adapter/references/project-config-reference.md](packages/opencode-adapter/references/project-config-reference.md) when needed.

## Install the CLI

Install the published CLI with:

```powershell
npm install -g @veewo/claw
```

Or use the one-shot install script:

```powershell
.\scripts\install-cli.ps1
```

After the CLI is installed, project search still needs one-time setup inside each target project:

1. Run `claw context` so `.claw/project.json` is normalized and the default local embedding config is present.
2. Run `claw search index --refresh` once so the sqlite recall store, embedding setup, and first vector index are created.

Then use it from any project directory:

```powershell
claw init --max-tasks-to-keep 20 --planning true --external-planning-skill team-planning-skill --external-truth-skill external-truth-writer --external-adr-skill external-adr-writer
claw plan create --title "My task" --goal "Define the first task"
claw plan create "My templated task" --template default --goal "Use the default template"
```

`claw plan create` now routes through seed-plan templates. The default root template is `default`. Planning-enabled projects start in `process.discussing` with a planning task plus an activation bridge task; planning-disabled projects start directly in `process.active`.

## Install the Codex plugin

The Codex plugin is a separate distribution surface from the CLI. The source of truth lives in `packages/codex-adapter`, and this repo now exposes two supported commands:

```powershell
npm run export:codex-plugin
npm run install:codex-plugin
```

What they do:

1. `npm run export:codex-plugin` copies the installable plugin payload into `dist/codex-plugin/claw-kit/<plugin-version>/`.
2. `npm run install:codex-plugin` copies that same payload shape into the local Codex cache at `%USERPROFILE%\.codex\plugins\cache\claw-kit-local\claw-kit\<plugin-version>\`.

Use `install:codex-plugin` when you want this machine to start using the adapter immediately. Use `export:codex-plugin` when you want a clean versioned bundle that can be attached to a release, copied to another machine, or used by another installer.

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
   - injects `plugins/claw-kit/skills` into the `skills.paths` array of `~/.config/opencode/opencode.json` so the adapter skills become available,
   - copies the bundled agent definitions into `~/.config/opencode/agent/`.

Restart OpenCode after installing so the new plugin, skills, and agents are picked up.

Use `install:opencode-plugin` when you want this machine to start using the adapter immediately. Use `export:opencode-plugin` when you want a clean versioned bundle that can be attached to a release, copied to another machine, or used by another installer.

## Package map

- `@veewo/claw`
  - CLI entrypoint for running the `.claw` workflow in a project
- `@veewo/claw-core`
  - shared workflow primitives for project config, planning, search, truth ingestion, and retention
- `@claw-kit/codex-adapter`
  - Codex-facing adapter assets, hooks, skills, and references for landing the workflow in Codex
- `@claw-kit/openclaw-adapter`
  - OpenClaw-facing adapter layer built on the same core workflow model
- `@claw-kit/opencode-adapter`
  - OpenCode-facing adapter that lands the workflow in OpenCode through a TypeScript plugin, a plugin shim, agent definitions, and skills

## `project.json` at a glance

`.claw/project.json` is the canonical team-owned workflow config for a project, and `.claw/project-override.json` is the local runtime-only overlay for personal preferences.

When you need backup detail, start with the adapter reference notes above and use [docs/project-json-reference.md](docs/project-json-reference.md) only for deeper canonical detail:

- shared vs local config boundaries
- memory, workflow, GitNexus, and writer override fields
- copyable examples when you need to tune a real project

## Maintainer docs

For release and distribution steps, use the dedicated maintainer docs in [DISTRIBUTION.md](DISTRIBUTION.md) and [docs/2026-06-08-closeout-workflow.md](docs/2026-06-08-closeout-workflow.md).
