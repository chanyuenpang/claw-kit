<!-- state: current -->

# ADR: Standard hostless flow as a first-class invocation shape

- Status: current
- Date: 2026-09-12

## Context

claw-kit's CLI guarded every workflow command (`context`, `plan`, `task`,
`subplan`, `switch-task`, `session open`) behind a host-scoped invocation
check: without `--host` or `CLAW_HOST` the command failed with
`PROJECT_CONFIG_INVALID`. This forced every platform to integrate through a
named adapter (Codex, OpenCode, Cindy, DSH) even when the platform had no
hooks, no typed tools, and no way to inject host identity — the only
integration path was building a new adapter package per host.

At the same time, the mechanisms a hostless flow needs already existed in the
CLI, host-neutral by construction:

- session identity is resolved from `CLAW_SESSION_ID` / `CODEX_THREAD_ID` /
  hook payload, never from the host profile;
- `internal-knowledge-capture` accepts an inline final-message payload on
  stdin and creates the durable background job without a host;
- `internal-knowledge-dispatch` returns the canonical background writer
  dispatch without a host;
- the knowledge-writer delegate plan is session-scoped and guidance-driven,
  so any agent can execute it by following `workflowGuidance`.

## Decision

1. The **hostless invocation shape** (no `--host`, no `CLAW_HOST`) is a
   first-class way to run the workflow. The former missing-host gate is
   removed for workflow commands; output projection follows the `standard`
   integration profile.
2. `standard` joins the closed host contract (`INTEGRATION_HOSTS`) with all
   capability flags off: no hostActions consumption, no native subagent
   finalization, no claim-time report capture, no active-workflow recovery
   sync. Named hosts are unaffected.
3. **The hostless default policy is `main-agent`; `background` is an explicit
   opt-in.** The host capability matrix (2026-09-13,
   `adr/host-aware-knowledge-execution-policy.md`) resolves an omitted or
   unsupported policy to the standard host's default `main-agent`: no
   transcript capture, no finalization job — the invoking agent runs
   `claw knowledge prepare/complete --source agent-memory` from its own
   memory, and the plan terminal `workflowGuidance` carries that chain. A
   project may still configure `background` explicitly for the durable
   capture→dispatch→writer-plan chain. The `subagent` policy's claim collects
   its report through a host-registered claim-time collector; without one the
   claim fails, so the standard flow rejects that policy at configuration
   time with an actionable error.
4. The hostless closeout chain is executed by the invoking agent itself:
   `plan done` → inline capture (`internal-knowledge-capture`, which now
   returns a `nextStep` pointing at the job) → `internal-knowledge-dispatch`
   → the agent runs the writer delegate plan (session-scoped) to its terminal
   transition, which records `knowledge done`.
5. `packages/standard-adapter` ships the host-neutral assets: the entry
   contract (paste into any platform's persistent prompt surface) and the
   skill set generated from shared sources.

## Explicit non-goals / clarifications

- **Session scope is not the standard flow.** Session scope keeps its
  existing meaning: a temporary task that deliberately skips Truth/ADR
  deposition and project retention. Standard-flow root plans are
  project-scoped. Only the knowledge-writer delegate plan is session-scoped,
  as a recursion guard (a writer completing must not deposit knowledge about
  itself).
- The named adapters are not deprecated. They remain the enhanced paths on
  their hosts (native plan/Goal projection, subagent dispatch, hooks,
  claim-time collectors). The standard flow is the floor every platform gets
  for free and the fallback when a native integration is unavailable.
- `internal-knowledge-finalize` (the legacy detached Codex-SDK runner) is not
  the standard flow's writer engine; the agent itself executes the writer
  plan.

## Decision evolution

<!-- state: history -->

<!-- dated: 2026-09-13 -->
### Background 从唯一默认路径降为显式选项

2026-09-13 之前，本 ADR 的 Decision 3 是 "Background is the only
knowledge-writer policy on this shape"，且 hostless closeout 唯一链路是
capture → dispatch → self-executed writer plan。host-aware policy matrix 引入
`main-agent` 后，省略的 policy 解析为 standard 默认 `main-agent`（prepare/
complete 自沉淀，零捕获、零 job），`background` 三步链保留为显式配置项。
旧事实对理解 0.2.38 的 hostless 行为与未迁移项目的默认仍有用。

## Consequences

- Any agent platform that can run shell commands can adopt the workflow by
  installing the CLI, pasting the entry contract, exporting
  `CLAW_SESSION_ID`, and vendoring the skills — no adapter package required.
- Unfinished closeouts stay durable and resumable: a later conversation
  continues from the dispatch step (or capture, if the report was never
  written).
- Function-form plan templates (`.mjs` exporting `(options) => document`)
  receive the effective `knowledgeWriter` config, so team writer templates
  can adapt execution content from configuration.
- The gate tests changed meaning: hostless workflow commands must succeed
  (`cli-host-actions.test.ts`), and the subagent-policy rejection message
  now explains the collector requirement (`cli-closeout.test.ts`).

## Evidence

- `packages/cli/test/cli-host-actions.test.ts` — hostless workflow commands
  execute under the standard flow.
- `packages/cli/test/cli-closeout.test.ts` — subagent policy rejected
  hostless; background chain verified end to end (capture creates job +
  nextStep, dispatch returns writer prompt).
- `scripts/probe-hostless-e2e.mjs` — 12-step hostless E2E probe against a
  real CLI build: init → context → plan → task → done → no inline dispatch →
  capture → dispatch → writer-plan binding → knowledge list → sweep.
- Re-verified 2026-09-13 on the published global CLI `0.2.38`: the same
  12/12 probe passes end to end (no `--host`, no `CLAW_HOST`). Known Windows
  pitfall: probe teardown `rmSync` can hit a transient EPERM because the
  session daemon briefly locks the probe workdir; the directory is deletable
  moments later and mechanism verification is unaffected (documented
  in-script at the teardown site).
