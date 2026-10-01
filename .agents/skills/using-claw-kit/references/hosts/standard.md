# Standard hostless execution route

Use only when no native claw-kit adapter is active. A workspace .agents copy
does not override a mounted adapter. No host flag, hooks, or host registration
is required.

## Host identity

The standard hostless flow needs no `--host` flag and no `CLAW_HOST`
environment variable. Session identity comes from the environment: export
`CLAW_SESSION_ID=<stable per-conversation id>` before running claw commands
(the CLI also accepts `CODEX_THREAD_ID` or `CODEX_SESSION_ID` for the same
purpose). Use the same id for every command in one conversation; a new
conversation uses a new id.

## Recovery and entry

Run `claw context` before new plan creation and consume `activeWorkflow` when
present. After recovery and the common entry gates, use the owning skill's
template or `claw plan create "<title>"` for a new generic plan. Follow returned
workflowGuidance. Do not add `--host` or set `CLAW_HOST`.

## Knowledge closeout

The standard hostless flow resolves `knowledgeWriter.executionPolicy` to
`main-agent` by default (no host-registered claim-time report collector
exists). When terminal guidance requires capture, closeout is non-skippable.

**Default `main-agent` closeout (two steps):**

1. **Prepare the assignment projection.** After the root plan's canonical completion, run:

   ```
   claw knowledge prepare --source agent-memory --project-root <project root>
   ```

   It returns `configFingerprint` and the ordered `assignments`.

2. **Execute and complete.** Execute each assignment yourself using only
   conclusion-bearing content already in your conversation memory: read or
   create no report, transcript, plan, subplan, job, or subagent. Then run:

   ```
   claw knowledge complete --source agent-memory --project-root <project root> --config-fingerprint <hash> [--changed-truth <absolute path> ...]
   ```

   with every canonical Truth/ADR document you changed. If the configuration
   changed after prepare, run prepare again before completing.

**Explicit `background` closeout (three steps):** with
`knowledgeWriter.executionPolicy: "background"` configured explicitly:

1. Run `claw internal-knowledge-capture` with stdin JSON:
   ```json
   {"cwd": "<project root>", "session_id": "<CLAW_SESSION_ID>", "turn_id": "<turn id>", "message": "<final answer summary>", "task_conclusions": []}
   ```
2. Run `claw internal-knowledge-dispatch --job <jobPath>` using the returned
   job path.
3. Execute the returned `dispatch.prompt` verbatim (its
   `claw plan create --template-file ...` command), then follow the writer
   plan's `workflowGuidance` to completion.

Do not skip closeout because the work appears to contain no knowledge — the
assignment contract itself decides whether a knowledge update is warranted.

The background writer plan claims and completes its durable job; do not wait
for an external worker, invoke a subagent, or launch another finalizer. If
interrupted, resume capture only if no report exists; otherwise resume from
dispatch using the returned job path. Do not fabricate a job path.

Do not choose subagent policy here: no host-registered claim-time collector
exists. Omit executionPolicy (main-agent) or explicitly use background.
