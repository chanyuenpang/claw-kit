# Knowledge finalization execution design

## Status

This document records the implemented execution contract.

The current working tree implements:

- `knowledge wait` as readiness-only waiting for Stop capture;
- `knowledge claim` issues an opaque claim token;
- `knowledge done` requires only the matching claim token;
- the packaged internal delegate template establishes session scope before dynamic assignments;
- Codex `background` and `subagent` policies use the same delegate bootstrap and assignment protocol;
- neither delegate orchestration nor built-in knowledge governance is published as a user-callable skill.

Notices and system notifications remain deferred.

## Goals

- Preserve the final assistant message captured by the host `Stop` boundary.
- Let a project choose either a detached background writer or a visible Codex subagent.
- Keep knowledge-governance behavior independent of executor and host platform.
- Run every writer skill inside session-scoped claw state so writer plans cannot recursively enqueue project knowledge finalization.
- Give success and failure one observable, persistent lifecycle.

## Non-goals

- Do not infer internal agent rounds from commentary or tool calls.
- Do not inject historical completion notices into `SessionStart`.
- Do not switch automatically between `background` and `subagent`.
- Do not let a subagent invoke the detached worker as a proxy.
- Do not make system notification delivery part of knowledge success.

## Execution policy

Project configuration selects one executor:

```json
{
  "knowledgeWriter": {
    "executionPolicy": "background"
  }
}
```

Allowed values:

- `background`: the host launches an unattended detached writer.
- `subagent`: Codex dispatches a collaboration subagent before the main turn ends.

`background` remains the compatibility default. A host that cannot dispatch a subagent must reject `subagent` explicitly rather than silently changing policy.

There is no cross-policy fallback. A failed execution remains failed until an explicit retry uses the configured policy.

## Host timing

The knowledge job does not exist when `plan done` returns. `plan done` only records the ended plan and can precompute a stable finalization handle. The host creates the job after the main agent emits its final response:

```text
plan done
→ optional subagent dispatch
→ main final response
→ Stop captures the final response
→ Stop creates the knowledge job
→ selected executor continues
```

This ordering preserves the real final response as source material. A foreground `knowledge wait` in the main agent would deadlock because `Stop` cannot run until that agent yields.

Codex collaboration subagents have been observed to continue after the parent turn completes and to surface their own final response to the user. The main agent receives the subagent result when the main task is next activated. This does not imply that a subagent can wake the completed main agent.

## Canonical writer assignment

Knowledge-governance instructions must have one platform-neutral owner. The executor-specific dispatch message and the writer assignment are separate contracts.

Core produces an ordered assignment for every resolved writer skill:

```ts
type KnowledgeWriterAssignment = {
  index: number;
  skill: string;
  promptVersion: number;
  prompt: string;
};
```

External-skill assignments use a canonical unattended prompt envelope which owns:

- the exact writer skill identifier;
- the source plan and captured report;
- the finalization id;
- an explicit instruction to invoke the configured skill unattended;
- prohibitions on requesting confirmation, review, or other interaction;
- completed, pending, and blocked evidence boundaries;
- transient input and read-only input rules;
- prohibitions on delegation, reimplementation, and repeated testing.

The selected external skill owns its detailed governance process. The unattended envelope constrains execution without pretending that arbitrary custom skills share the built-in writer's governance contract.

When `externalSkills` is empty, Core emits a built-in default assignment backed by the hidden knowledge-governance contract. That assignment uses its own direct governance wording rather than the external-skill invocation envelope. This is configuration fallback only; it is not an execution fallback after another skill or policy fails.

The job snapshots the ordered assignments when it is created. Background and subagent executors consume those exact assignments; adapters must not maintain alternative prompt strings.

The existing optimized baseline is `buildKnowledgeWriterPrompt` in `packages/cli/src/cli.ts`. Before implementation, it should move to a shared Core builder. The newer adapter-local short prompt is not a second canonical version.

## Delegate writer

Both execution policies run the same internal orchestration template:

```text
@veewo/claw-core/resources/delegate-writer/TEMPLATE.json
```

The delegate is not a user skill and is not discoverable in any plugin. It owns the writer lifecycle and executes the configured governance assignments directly.

Its template is session scoped:

```json
{
  "id": "delegate-writer",
  "scope": "session",
  "status": "process.active"
}
```

Its plan has four ordered stages:

1. `wait`
2. `claim`
3. `executeSkill`
4. `done`

### Wait

Wait for the main `Stop` capture to create the job. This is a temporal readiness operation only: it locates the project job by project root and finalization id, then returns when that job exists.

`wait` does not create session workflow state, persist an executor identity, bind the job, or own duplicate-execution protection. The executor has already entered session scope through the static `delegate-writer` template.

### Claim

Claim the job exactly once and return:

- claim token;
- plan and report materials;
- ordered writer assignments;
- immutable writer configuration.

### Execute skills

Execute each assignment sequentially. Each assignment receives one session-scoped subplan so the outcome is observable and later skills see earlier knowledge changes.

```text
executeSkill
├─ assignment subplan 1
├─ assignment subplan 2
└─ assignment subplan 3
```

The delegate agent invokes every assigned skill itself. It must not invoke `internal-knowledge-finalize`, another background writer, or another writer subagent.

The assignment subplan is generic; a dynamically configured skill does not need to provide its own claw template. If the skill does create additional claw plans, the pre-established session context keeps them outside the project task directory.

Assignments are not parallelized. Writer order is part of project configuration and later skills may depend on earlier Truth or ADR changes.

### Done

After a successful claim, `done` is a finally-style operation and must run exactly once.

- If every assignment succeeds, persist `succeeded`.
- If an assignment fails, stop later assignments and persist `failed` with the completed assignment results and error.

An assignment failure completes the execution attempt; it must not leave the delegate plan blocked before the terminal job result is written.

## Normalized CLI lifecycle

The public lifecycle has three commands:

```text
knowledge wait
knowledge claim
knowledge done
```

Illustrative forms:

```text
claw knowledge wait --finalize-id <id> --project-root <root>
claw knowledge claim --finalize-id <id>
claw knowledge done --finalize-id <id> --claim-token <token> --status succeeded --result <text>
claw knowledge done --finalize-id <id> --claim-token <token> --status failed --error <text>
```

`wait` must locate the project job by explicit project/finalization identity even after the executor has entered session scope. It must not look for a project job through the current session workflow context, inspect the executor session, or mutate job ownership.

`claim` owns duplicate-execution protection. `done` accepts only the matching claim token and owns the terminal job update, success report receipt, notice, and completion refresh.

The packaged internal delegate template owns session scope. `wait`, `claim`, and `done` do not create, refresh, release, or validate session bindings. `claim` alone owns duplicate-execution protection through the opaque claim token; `done` remains valid using that token regardless of session-runtime cleanup.

## Session isolation

Session isolation is an executor responsibility, not a property of the configured writer skill.

The built-in `knowledge-writer` template already declares `scope: "session"`, but `knowledgeWriter.externalSkills` can replace it with arbitrary skills. Relying on a dynamic skill to request session scope is therefore unsafe.

Before `wait`, `claim`, or any configured skill runs:

- a collaboration subagent creates the packaged internal delegate session plan using its own Codex thread id;
- a background runner creates the same static session plan using its own host writer session identity;
- missing session identity fails closed;
- no path falls back to project scope.

Once a session manifest exists, ordinary claw plan creation in that executor resolves to the session workflow. Session plans do not register project knowledge capture, so their completion cannot recursively enqueue another finalization job.

Current Codex probes show that main and collaboration subagents receive different `CODEX_THREAD_ID` values. No stable `CODEX_AGENT_ID` or `CODEX_TASK_NAME` environment marker is currently available. The implementation therefore uses explicit executor dispatch and a session-scoped internal template, rather than attempting to infer whether the current process is a subagent.

## Executor behavior

### Background

```text
Stop creates job
→ detached host writer starts
→ internal delegate template enters session scope
→ wait returns immediately
→ claim
→ execute assignments
→ done
→ persistent notice
→ optional best-effort system notification
```

Background retry remains an internal retry of the same policy. It is not a policy fallback.

### Subagent

```text
plan done returns a structured dispatch
→ main calls spawn_agent
→ subagent enters internal delegate session scope
→ subagent waits
→ main final response triggers Stop
→ job appears
→ subagent claims and executes assignments
→ subagent calls done
→ subagent final response reports the outcome
```

The structured dispatch supplies the task name, project root, finalization id, `fork_turns`, and supported model/reasoning options. The claw CLI and code-mode driver cannot invoke collaboration tools themselves; the main Codex agent performs the direct `spawn_agent` call.

## Notice and user visibility

Every terminal result writes a durable notice. The notice is the user-facing event record, while the job remains the execution-state source.

System notifications are optional and best effort. They can alert a user but cannot wake or inform a completed agent. Notification failure must never change a knowledge job from success to failure.

`subagent` normally reports through its own final response. `background` can use a system notification and an explicit status command. Neither policy injects completion into a future `SessionStart`.

## Failure semantics

- Dispatch failure is reported while the main agent is still active.
- Wait timeout records a capture/wait failure; it does not manufacture a job.
- Claim failure does not permit skill execution.
- After claim, assignment failure must reach `done --status failed`.
- A process crash can leave a stale claim; recovery is explicit and remains within the configured execution policy.
- Unsupported model, reasoning effort, host, skill, or session identity fails explicitly.
- internal delegate orchestration is not addressable through `knowledgeWriter.externalSkills`.

## Verification

Focused automated coverage should include:

- background and subagent consume byte-identical ordered canonical assignments for the same job;
- subagent dispatch contains wait/claim/direct-skill/done orchestration and never calls the background worker;
- adapter packages contain no alternate writer prompt;
- multiple configured skills produce sequential assignment subplans;
- a dynamic skill without a session-scoped template still creates any claw plans in session runtime;
- session writer completion creates no recursive knowledge job;
- missing executor session identity fails before skill execution;
- claim tokens prevent duplicate or late terminal writes;
- `done` records both success and failure exactly once;
- background notification failure remains fail-open.

Host-level probes should separately verify Codex subagent lifecycle, unique thread identity, parent-turn survival, and result visibility.

## Deferred implementation

System notification adapters and completion notice UX remain deferred.
