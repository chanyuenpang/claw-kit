# Codex Current State And `claw-kit` Technical Design

## Purpose

Summarize the current Codex integration surface we can rely on today, then turn that into a concrete design for how `claw-kit` should land in Codex first.

This document is intentionally practical.

It is also secondary to the OpenClaw source-derived notes in:

- `docs/2026-06-06-openclaw-source-derived-harness-flow.md`

If this document conflicts with the extracted OpenClaw harness behavior, the
OpenClaw-derived note should win.

It answers:

- what Codex appears to support today
- what is confirmed versus inferred
- what the smallest reliable `claw-kit` integration should be

## Executive Summary

The best near-term design is:

- `claw-kit` rebuilds the existing OpenClaw harness flow as a host-neutral core
- that core is still centered on `.claw/`, task plans, memory, and truth docs
- Codex gets a thin plugin adapter, not a new harness model
- every command should resolve `.claw/` from `cwd` first
- task scope is established by `plan create`
- `switch-task` remains available, but as advanced revisit behavior

This means we should not invent a Codex-native workflow and only then try to map OpenClaw onto it.

We should instead keep the OpenClaw harness semantics and let Codex do what it already does well:

- operate from `cwd`
- run local commands
- use skills for repeatable workflow
- optionally use plugin-packaged apps or MCP servers

## What We Verified

### Official Codex signals

From OpenAI Academy:

- plugins help Codex connect to tools and external information
- skills teach Codex a reusable process
- the recommended mental model is:
  - use a plugin when Codex needs external tools or data
  - use a skill when Codex needs to follow a process
  - use both when Codex needs process plus connected tools

From current Codex use cases on developers.openai.com:

- OpenAI explicitly promotes both:
  - `Save workflows as skills`
  - `Create a CLI Codex can use`

From current Help Center docs:

- plugins are governed by workspace app controls in Business and Enterprise
- Codex features and plugin availability are shared across Codex-related surfaces

### Local Codex observations in this environment

The current local Codex environment confirms:

- plugin manifests live at `.codex-plugin/plugin.json`
- installed plugins in this environment use patterns like:
  - `skills` only
  - `skills + apps`
- the local plugin scaffold also supports:
  - `skills`
  - `mcpServers`
  - `apps`
- the current scaffold reference still mentions `hooks`, but the local validator guidance says unsupported fields such as `hooks` are rejected

Concrete examples from local installed plugins:

- one installed workflow-oriented plugin is effectively a `skills` plugin
- `github` is a `skills + apps` plugin
- `google-drive` and `notion` are also `skills + apps` plugins
- `browser` is a `skills` plugin with a very explicit usage-oriented manifest description
- I did not find currently installed Codex plugins in this environment that actually use `mcpServers`, even though the local manifest spec supports it

### Observed plugin patterns worth copying

Looking at local installed plugins, a few patterns stand out:

#### Pattern A: `skills` only

Example:

- a workflow-oriented reference plugin

Use when:

- the plugin's main value is workflow guidance
- most execution still happens through normal Codex tools and shell access

This is the closest current pattern to a first-pass `claw-kit` Codex plugin.

#### Pattern B: `skills + apps`

Examples:

- `github`
- `google-drive`
- `notion`

Use when:

- the plugin wraps external connected systems
- Codex needs connector-backed data or actions

This pattern is probably not necessary for the first `claw-kit` delivery, because `.claw/` itself is local project state, not an external SaaS connector.

#### Pattern C: manifest-level usage guidance

Example:

- `browser`

Observation:

- the plugin description itself contains concrete invocation guidance and boundary conditions
- the manifest is doing some UX steering before the skill body is even loaded

This is useful for `claw-kit`, because we can use the manifest to tell Codex when the plugin applies, such as:

- when a project contains `.claw/`
- when the user wants to continue task-scoped planning, memory, or truth work
- when the user wants to operate on an existing harnessed project rather than a plain repo

### Codex execution model signals

From local skill references and the current Codex app context, Codex already has strong support for:

- local filesystem work
- shell execution
- workspace-aware operation from the current working directory
- native skills
- plugins as distribution units
- optional multi-agent support

What I did not verify as a stable first-class Codex plugin primitive:

- OpenClaw-style lifecycle hooks around every plan or task mutation
- a native active-task runtime registry comparable to OpenClaw's session binding map

### Latest hook signals

The current hook picture is important enough to treat separately.

What looks confirmed from recent public Codex repository activity:

- Codex has a hooks runtime and a `hooks.json`-based model
- hook names in live discussion include:
  - `SessionStart`
  - `SessionEnd`
  - `Stop`
  - `UserPromptSubmit`
  - `PreToolUse`
  - `PostToolUse`
  - `PermissionRequest`

What looks historically true:

- plugin manifests and plugin scaffolding exposed `hooks`
- but plugin-scoped hooks were not loaded into the active runtime in April 2026

What looks newer, but not yet stable enough to treat as product law:

- by late May 2026 there are strong signs that plugin-level hooks may now execute in live sessions
- however, hook coverage is still inconsistent across tools
- and the public docs are not yet clear enough to make hooks the foundation of `claw-kit` for Codex

Most important limitation:

- recent Codex issue evidence says `PreToolUse` and `PostToolUse` only cover a subset of tools
- the reported covered handlers were:
  - `shell`
  - `unified_exec`
  - `apply_patch`
  - `mcp`

That means hook support may be real, but still partial.

## What This Means For `claw-kit`

### 1. The product is the OpenClaw harness, not the Codex adapter

Codex is a host.

`claw-kit` should remain the real owner of:

- `.claw/` protocol
- task and plan file mutation
- memory indexing and search
- truth ingestion
- the project/task workflow that OpenClaw already uses today

Codex should only adapt that core into its own workflow model.

### 2. Rebuild the OpenClaw flow first, then adapt it to Codex

The main flow we are trying to preserve is:

1. project-local `.claw/` is the canonical source of truth
2. task scope becomes real when `plan create` creates or updates task artifacts
3. plan operations continue through `activePlan`
4. memory operations resolve the right project or task index from `.claw/`
5. truth operations write back into `.claw/truth/`

That flow should survive unchanged across hosts.

What changes per host is only:

- how the user enters the flow
- whether hooks can automate parts of it
- how much workflow guidance lives in skills versus runtime hooks

### 3. Codex plugin is primarily a packaging and workflow layer

For Codex, the plugin is not the semantic core.

It is the installable shell that can bundle:

- skills
- optional MCP config
- optional app config
- user-facing metadata for discovery and installation

This is a strong fit for `claw-kit`, because our real semantics already want to live outside the host in `.claw/` and CLI behavior.

### 4. Skills are the right way to encode Codex-side workflow defaults

The most important Codex-specific behavior is not a new data model.

It is workflow guidance such as:

- if a session starts in a project with `.claw/`, resolve project context from `cwd`
- when planning, let `plan create` establish or switch task scope
- when a task is already explicit, write to that task's current `activePlan`
- when user asks to revisit a previous task, call `switch-task`

That is much closer to a skill than to a runtime hook.

### 5. CLI remains the best place for exact semantics

The official Codex use cases explicitly encourage building a CLI Codex can use.

That aligns with our extraction goal:

- CLI is portable
- CLI is testable
- CLI can later be reused by OpenCode and OpenClaw plugin adapters

So the Codex integration should call into `claw-kit` CLI rather than burying logic in the plugin itself.

### 6. Hooks should be treated as an enhancement layer, not the harness foundation

Even if plugin-local hooks are now partially working, they are still not the right place to anchor the first `claw-kit` integration.

Reason:

- historical behavior changed recently
- current coverage across tools is incomplete
- public documentation is still behind the real runtime details
- our MVP requirement is reliability on existing `.claw/` projects, not clever automation

So for `claw-kit`:

- command behavior should be correct from `cwd` alone
- hooks can later improve ergonomics around plan or truth workflow
- hooks should not be required for correctness

## Recommended Architecture

## Layer 1: `claw-kit` core CLI

This layer owns the actual semantics of the OpenClaw harness.

Initial commands:

- `claw init`
- `claw plan create`
- `claw plan edit`
- `claw plan show`
- `claw memory edit`
- `claw memory index`
- `claw memory search`
- `claw truth ingest`
- `claw switch-task`

This layer should operate directly on project-local `.claw/`.

## Layer 2: Codex plugin

This layer should be a thin installable distribution unit containing:

- `.codex-plugin/plugin.json`
- `skills/`
- optionally `.mcp.json` later
- optionally `.app.json` later if we want UI-facing integration

The plugin should not become the main place where task semantics live.

Recommended first plugin style:

- imitate the workflow-oriented `skills`-only shape more than the `github` or `google-drive` shape
- start as `skills` only
- add `apps` only if `claw-kit` later needs an external connected system
- add `mcpServers` only if CLI-through-shell becomes too weak or too awkward

## Layer 3: Codex skills

This layer defines the default user flow in Codex.

Recommended first skills:

- `claw-project-bootstrap`
  - detect `.claw/`
  - explain the current project-level harness context
  - guide the user into `plan create` when task scope is needed
- `claw-plan-workflow`
  - use `plan create` to establish or revisit task scope
  - call `claw plan edit` after task scope is explicit
- `claw-truth-workflow`
  - call `claw truth ingest` when the user explicitly wants to consolidate findings

Potential later skills:

- `claw-revisit-task`
- `claw-memory-investigation`

## Recommended Codex MVP Behavior

The default Codex model should be:

1. user opens a project in Codex
2. Codex detects `.claw/`
3. every `claw` command resolves project context from `cwd`
4. when the user starts planning work, `plan create` establishes task scope
5. later plan, memory, and truth operations follow that explicit task scope

This makes Codex simple and predictable without forcing OpenClaw's session-reuse model onto it.

## `cwd` Context Resolution

This is the key cross-host primitive.

Its job is to:

- resolve the project root from `cwd`
- locate `.claw/`
- load or derive project identity
- optionally resolve an explicitly named task
- return structured paths and context for later commands

Suggested output shape:

```json
{
  "projectRoot": "D:/Users/chany/Documents/claw-kit",
  "clawDir": "D:/Users/chany/Documents/claw-kit/.claw",
  "projectId": "claw-kit"
}
```

Task-aware commands can extend that project context with:

- `taskName`
- `taskDir`
- `metaPath`
- `activePlan`
- `activePlanPath`

## Why `cwd` resolution matters

It gives us one stable base for the whole harness:

- `plan create` knows where to create or update task scope
- `memory search` knows which project or task-local index to open
- `truth ingest` knows where canonical truth docs live
- host adapters do not need to reinvent project detection logic

This is the part where a GitNexus-style local resolution trick is useful, but only as a small implementation reference.

The product itself is still the OpenClaw harness flow above it.

## Task Binding Recommendation

For Codex MVP:

- do not let project-resolution commands implicitly bind task scope
- let `plan create` establish task scope like OpenClaw
- keep session ownership out of the first core contract

## `switch-task` Recommendation

For Codex MVP:

- keep it
- do not center the workflow around it
- treat it as explicit revisit behavior

This matches the current direction you described:

- users mostly do not need task switching during normal Codex work
- task switching is for returning to an older task to add or complete something

## MCP Recommendation

We should not make MCP mandatory for the first Codex landing.

Reason:

- local evidence shows Codex plugins here already succeed with `skills` and `apps`
- we have not yet proven that a dedicated `claw-kit` MCP server is necessary for MVP
- a CLI-first path is simpler to validate against existing `.claw` projects

Recommended sequence:

1. ship `claw-kit` CLI
2. ship Codex plugin with skills that call the CLI
3. only add `.mcp.json` after we see a real need for structured tool invocation beyond shell-based CLI use

## Why not MCP first

MCP may become useful later for:

- strongly typed tool calls
- richer UI integration
- lower-friction command routing

But it is not required to prove that Codex can own `.claw/` workflow.

For first delivery, MCP would add integration surface before we have validated the simpler path.

## Hooks Recommendation

We should not make hooks mandatory for the first Codex landing.

Recommended posture:

- assume hooks may be available
- use them only for optional ergonomics
- never require them for core correctness

Good future hook candidates:

- `SessionStart`
  - remind that the current project has `.claw/`
- `Stop`
  - remind about truth or plan closure if the task looks unfinished
- `PostToolUse`
  - only for targeted follow-up around tools we know are covered

Hooks to avoid depending on in MVP:

- broad `PreToolUse` or `PostToolUse` assumptions across all tools
- automatic task creation that only works if a session-start hook fires
- any workflow that breaks when plugin hooks are absent or partially loaded

## Why not hooks first

Because the current evidence says hooks are in an in-between state:

- clearly present in the runtime model
- historically not fully wired for plugins
- possibly improving
- still not uniform enough to be our base contract

That makes them a great optimization surface, but a poor first dependency.

## Proposed Plugin Shape

```text
plugins/claw-kit/
|- .codex-plugin/
|  `- plugin.json
|- skills/
|  |- claw-project-bootstrap/
|  |  `- SKILL.md
|  |- claw-plan-workflow/
|  |  `- SKILL.md
|  `- claw-truth-workflow/
|     `- SKILL.md
`- assets/
```

Potential later additions:

- `.mcp.json`
- `.app.json`

## Manifest Writing Recommendations

Based on the local Codex plugin ecosystem, the first `claw-kit` manifest should follow these rules:

- keep the initial plugin category under something like `Developer Tools`
- describe the plugin in workflow language, not internal architecture language
- keep `skills` as the only required capability in the first version
- treat `apps` and `mcpServers` as later expansions, not day-one requirements
- use the manifest description and `defaultPrompt` to teach the expected entry behavior

Good `defaultPrompt` directions would likely be:

- continue work inside a project that uses `.claw/`
- use `plan create` when a new task scope needs to be established
- update truth docs from the work completed in this task

## First Technical Milestone

The first real milestone should be:

- Codex can enter an existing `.claw/` project
- resolve project context from `cwd`
- use `plan create` to establish task scope
- write or edit the task plan
- search task or project memory
- ingest truth updates manually

If those work, then Codex is already meaningfully attached to the harness.

## Deferred Topics

These should not block the Codex MVP:

- archive semantics
- advanced takeover history
- automatic truth hooks
- hook-driven auto-attach
- plan guard equivalents
- OpenCode-specific adapter design
- OpenClaw plugin re-integration details

## Current Recommendation

Build in this order:

1. finalize `cwd -> .claw context` contract
2. finalize minimal CLI contracts for plan, memory, and truth operations
3. scaffold a Codex plugin with `skills` only
4. validate the flow against an existing `.claw/` project
5. only then decide whether Codex needs MCP integration

The current low-level attach helper contract is specified in:

- `docs/2026-06-06-claw-attach-command-contract.md`

## References

Official sources used for this document:

- [OpenAI Academy: Plugins and skills](https://openai.com/academy/codex-plugins-and-skills/)
- [OpenAI Developer docs: Codex use cases](https://developers.openai.com/codex/use-cases)
- [OpenAI Help Center: Using Codex with your ChatGPT plan](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan.pdf)

Local sources used for this document:

- `C:\Users\chany\.codex\skills\.system\plugin-creator\SKILL.md`
- `C:\Users\chany\.codex\skills\.system\plugin-creator\references\plugin-json-spec.md`
- `C:\Users\chany\.codex\plugins\cache\openai-curated\<workflow-plugin>\e2d08a2e\.codex-plugin\plugin.json`
- `C:\Users\chany\.codex\plugins\cache\openai-curated\github\e2d08a2e\.codex-plugin\plugin.json`
- `C:\Users\chany\.codex\plugins\cache\openai-curated\<workflow-plugin>\e2d08a2e\skills\<workflow-skill>\references\codex-tools.md`

Recent public Codex hook references used for this document:

- `openai/codex` issue `#17331`
- `openai/codex` issue `#24211`
- `openai/codex` issue `#20204`
- `openai/plugins` repository README
