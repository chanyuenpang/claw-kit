# claw-kit

`claw-kit` is a project-level workflow and knowledge layer for agentic work.

It gives agents a durable way to plan before they execute, retain reusable project knowledge, and close work out cleanly inside initialized `.claw` projects instead of leaving progress trapped in transient chat state.

## Product page

The GitHub Pages product deck lives in [docs/index.html](docs/index.html) and is designed as a bilingual, scroll-driven introduction to `claw-kit`.

## What it gives a project

- Project-scoped planning and task lifecycle around `.claw`, with workflow entry turning on automatically only after a project has been initialized
- Truth and ADR deposition so useful knowledge survives across sessions
- Recall-oriented search over project docs before broader investigation
- Closeout workflows that keep tasks, notes, and decisions aligned
- Planning surfaces that can stay enabled, be turned off, or be routed through a custom planning skill
- Adapter surfaces that let the same workflow shape land in different agent hosts

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
- Host adapters bring the same workflow model into environments like Codex and OpenCode, and the workflow can also be embedded into another harness when teams need a custom host shape.

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
claw init --max-tasks-to-keep 20 --planning true --external-planning-skill team-planning-skill --external-writer-skill external-knowledge-writer
claw plan create --title "My task" --goal "Define the first task"
claw plan create "My templated task" --template default --goal "Use the default template"
claw plan create "Ephemeral harness" --scope session --goal "Run the full workflow without project deposition"
```

`claw plan create` now routes through seed-plan templates. Explicit `--template` wins first; otherwise claw uses `defaultPlanTemplate` from `.claw/project.json` or `.claw/project-override.json`, then falls back to the built-in `default` template. Planning-enabled projects start in `process.discussing` with a planning task plus an activation bridge task; planning-disabled projects start directly in `process.active`. The planning task analyzes the request and uses the configured planning skill to fill executable tasks. `claw search --query "<topic>"` remains an optional command hint, not a mandatory planning step.

`claw context` emits only the minimum public recovery surface: project identity and paths, an active workflow when one exists, recovery or version diagnostics only when action is needed, and optional search guidance derived from enabled embedding and GitNexus capabilities. The internal SessionStart path retains the full resolved context needed for recovery and protocol handling. Claw-generated guidance, return metadata, and host prompt text use English; user-supplied plan content and repository document language are preserved.

New project tasks are grouped under `.claw/tasks/YYYY-MM-DD/`. `claw context` performs a lock-protected lazy daily maintenance pass: it clears `.claw/runtime/tmp/` (and removes the legacy `.claw/tmp/`), moves date-scoped task folders from before yesterday into the archive (regardless of whether old plans have `completedAt`), archives legacy flat tasks by `plan.updatedAt` (falling back to the plan file timestamp), applies `maxTasksToKeep` to the archive, removes bindings to plans no longer under active tasks, and sweeps expired session workflows. It runs on the first context call of each local calendar day; it does not install a background scheduler.

Use `claw plan create "<title>" --scope session` when the work needs the full plan, task, subplan, SessionStart recovery, and host Goal workflow but must not create or depend on a project `.claw` directory. Session scope is keyed by the platform session id, follows the session across cwd changes, and deliberately skips Truth/ADR capture, memory refresh, GitNexus, and project task retention. Completed state is retained for seven days by default; `claw session clean` removes the current session immediately and `claw session clean --expired` performs an explicit TTL sweep. Session state does not persist invocation host metadata.

Projects can define reusable templates directly under `.claw/templates` using `.json`, `.js`, `.mjs`, or `.cjs` files. Use `.claw/project.json` for a shared team `defaultPlanTemplate`, or `.claw/project-override.json` for a personal runtime override.

## Install the Codex plugin

The Codex plugin is a separate distribution surface from the CLI. On another machine, add the official repository marketplace first:

```powershell
codex plugin marketplace add chanyuenpang/claw-kit --ref main
```

Restart the ChatGPT desktop app, open the plugin directory, choose the **Claw Kit** marketplace, and install **Claw Kit**. Start a new task after installation so Codex discovers the bundled skills. Refresh the Git-backed marketplace later with:

```powershell
codex plugin marketplace upgrade claw-kit
codex plugin add claw-kit@claw-kit
```

An upgrade is complete only when `claw-kit@claw-kit` is the enabled identity and its installed manifest matches the target version. A newer directory under the Codex plugin cache is not sufficient: if an older same-name identity such as `claw-kit@claw-kit-local` remains enabled, Codex can continue loading that older marketplace source.

The repository marketplace at `.agents/plugins/marketplace.json` points to the fully materialized `packages/codex-adapter` tree. Codex can therefore copy every shared skill and resource into its plugin cache without running repository or npm lifecycle scripts.

The committed Git marketplace snapshot is the Codex plugin release artifact. GitHub Release ZIP attachments are not required. Use a full repository checkout; a sparse checkout containing only `.agents/plugins` omits the referenced `packages/codex-adapter` payload.

Maintainers working inside this repository have two Codex commands:

```powershell
npm run export:codex-plugin
npm run install:codex-plugin
```

What they do:

1. `npm run export:codex-plugin` copies the installable plugin payload into `dist/codex-plugin/claw-kit/<plugin-version>/`.
2. `npm run install:codex-plugin` clones the published GitHub `main` marketplace, installs that payload into `%USERPROFILE%\.codex\plugins\cache\claw-kit\claw-kit\<plugin-version>\`, enables `claw-kit@claw-kit`, and disables `claw-kit@claw-kit-local`.

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

When changing claw configuration through the plugin, use the `config` skill first. It asks whether the change is shared team config or personal local config, then routes to `.claw/project.json` or `.claw/project-override.json` with the current flat field shape.

When you need backup detail, start with the adapter reference notes above and use [docs/project-json-reference.md](docs/project-json-reference.md) only for deeper canonical detail:

- shared vs local config boundaries
- project template defaults and `.claw/templates` usage
- memory, workflow, GitNexus, and writer override fields
- copyable examples when you need to tune a real project

## Maintainer docs

For release and distribution steps, use the dedicated maintainer docs in [DISTRIBUTION.md](DISTRIBUTION.md) and [docs/2026-06-08-closeout-workflow.md](docs/2026-06-08-closeout-workflow.md).
