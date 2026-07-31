# @veewo/claw

`@veewo/claw` is the CLI entrypoint for running the `.claw` workflow in a project.

It gives agents and developers a concrete way to plan work, recall project knowledge, deposit truth and ADR notes, and close rounds out cleanly instead of leaving project state scattered across transient chats.

## What the CLI is for

- initialize and normalize the `.claw` project surface
- run project-scoped planning and task lifecycle commands
- index and query project documentation recall
- support truth ingestion and closeout flows

## Install

```bash
npm install -g @veewo/claw
```

After installing the CLI, project search still needs one-time setup inside each `.claw` project:

1. Run `claw context` so `.claw/project.json` is normalized and the default local embedding config is present.
2. Run `claw search index --refresh` once so the local embedding model can be downloaded or reused and the first vector index can be built.

Then run:

```bash
claw init
claw search index --refresh
claw search "existing truth or ADR topic"
claw plan create --title "My task" --goal "Define the first task"
claw plan create "My templated task" --template default --goal "Route through the default template"
claw plan create "Ephemeral harness" --scope session --goal "Use plan and Goal workflows without project deposition"
```

`claw plan create` uses explicit `--template` first, otherwise the project's configured `defaultPlanTemplate`, and finally falls back to the built-in `default` template. You can select a template explicitly with `claw plan create "<title>" --template <name>` or `claw plan create --template <name> --title "<title>"`.

New project tasks are grouped under `.claw/tasks/YYYY-MM-DD/`. On the first `claw context` call of each local calendar day, claw performs a lock-protected maintenance pass: it removes expired entries from `.claw/runtime/tmp/`, removes workflow task directories that exceed the task TTL even when incomplete, moves eligible date-scoped task folders into the archive, applies `maxTasksToKeep` and archive TTL, removes expired or invalid bindings, and sweeps expired session workflows. This is lazy maintenance, not a background scheduler.

`--scope session` stores the workflow in a user-level directory keyed by the platform session id, so it works without a project `.claw` directory and recovers across cwd changes. It preserves plan/task/subplan/Goal behavior while disabling project knowledge capture, memory/GitNexus refresh, and project retention. Use `claw session clean` for the current session or `claw session clean --expired` for the seven-day TTL sweep.

Projects can add reusable templates directly under `.claw/templates` with `.json`, `.js`, `.mjs`, or `.cjs` files. Put `defaultPlanTemplate` in `.claw/project.json` for a shared team default, or in `.claw/project-override.json` for a local personal override.

When `.claw/project.json` has `planning: true`, the default `default` template seeds one planning task in `process.discussing`. It loads the effective `externalPlanningSkill`, falling back to `claw-kit:planning`, and stays open while the requirements and proposed solution are discussed and confirmed with the user. Use `plan start` when execution tasks remain; when planning itself resolves the request, complete task 1 and close the plan.

When `planning: false`, `claw plan create` seeds the smallest executable plan directly in `process.active`.

## Workflow shape

In a typical round, the CLI helps land this loop in a project:

`plan` -> `search and recall` -> `execute` -> `deposit truth / ADR` -> `close out`

That project-level plan structure helps agents carry longer-running work more cleanly than leaving the task in loose chat state alone.

## Persistent sessions

Open a persistent terminal with:

```bash
claw session open <dir> <agent-session-id>
```

The workdir is immutable for the lifetime of that session. Opening another
directory closes the prior live connection and opens the composite identity
`(canonical workdir, agent session id)`; two directories with the same agent id
remain isolated.

Inside the terminal, these commands implicitly target `currentPlan`:

```text
plan show [--simple]
plan edit ...
plan wait
plan done --retrospective "..."
task add ...
task edit --id ...
task done --id ...
```

Use `plan resume` to resume the retained current plan, `plan resume <planId>` to
make a specified resumable plan current, and `plan leave` to enter
`end.leave` and clear focus. Every `end.*` triggers end-state finalization;
`end.leave` remains resumable and does not set `completedAt`.

`search --dir <dir> <query>` changes only that search operation. It never
changes the session workdir or current plan.

On an interrupted connection, mutations are never replayed automatically.
Reopen with the exact command returned by the error, then inspect
`plan show --simple`. Retained v2 state expires seven days after its last
update. Legacy session caches are not migrated and canonical plans are never
deleted by v2 cleanup.

Host adapters remain compatible with the stateless CLI. They can adopt
`@veewo/claw-client` incrementally once they consume the same structured
post-commit effects; opening a persistent session does not change existing
adapter behavior.

Codex startup workflow should rely on the session hook or startup recovery path instead of treating any extra manual recovery step as required after plan creation.

## Search and recall

`claw search` is the project recall command for `.claw` memory, truth, ADR, and declared markdown docs. Use it for retained project context rather than code search.

When a task needs deeper code investigation or relationship tracing, GitNexus can complement this workflow, but it is optional rather than required for using `claw` itself.

Typical setup:

```bash
claw context
claw search index --refresh
```

If you need deeper backup detail on config or recall behavior, use the adapter reference notes in [packages/codex-adapter/references/project-config-reference.md](../codex-adapter/references/project-config-reference.md) or [packages/opencode-adapter/references/project-config-reference.md](../opencode-adapter/references/project-config-reference.md).

## Configuration

If you need backup `.claw/project.json` detail, start with the adapter reference notes above and use [docs/project-json-reference.md](../../docs/project-json-reference.md) only for deeper canonical detail.

`claw-kit` also stays usable alongside other harnesses or external skills, so the CLI does not assume a single host or investigation surface.

The config model is team-friendly as well: `.claw/project.json` carries the shared canonical workflow, while `.claw/project-override.json` leaves room for personal runtime preferences.

## Repository

- [claw-kit](https://github.com/chanyuenpang/claw-kit)
