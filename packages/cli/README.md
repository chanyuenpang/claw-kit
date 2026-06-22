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
claw plan write --title "My task" --goal "Define the first task"
```

## Workflow shape

In a typical round, the CLI helps land this loop in a project:

`plan` -> `search and recall` -> `execute` -> `deposit truth / ADR` -> `close out`

That project-level plan structure helps agents carry longer-running work more cleanly than leaving the task in loose chat state alone.

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
