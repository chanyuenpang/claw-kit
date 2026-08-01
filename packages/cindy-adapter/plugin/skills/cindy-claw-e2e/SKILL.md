---
name: cindy-claw-e2e
description: Run evidence-grade Cindy project-thread E2E tests for claw-kit report capture and subagent knowledge finalization. Use when validating a locally refreshed Cindy adapter or CLI, reproducing missing plan.report or finalization jobs, or proving the no-Stop Orca knowledge-writer lifecycle in a clean Cindy session.
---

# Cindy claw E2E

Run the test as a product workflow, not as a direct CLI probe.

## Establish a valid sample

1. Record the installed plugin and CLI build or critical file hashes.
2. Restart Cindy after refreshing either the plugin, CLI, client, or Core. A hot-reloaded plugin page does not prove that an already-running session daemon loaded the new packages.
3. Create a **normal Cindy main session from the target project row**. Confirm the Host-derived working directory equals the project root before sending the test prompt.
4. Use a fresh session and a unique project-scope plan title. Do not reuse a completed plan, an old `finalizeId`, the implementation thread, an Orca Worker, an errand session, or a dialogue workspace.
5. Confirm that creating a persistent, UI-visible `knowledge-finalizer` Worker is authorized, or reuse an existing matching Worker. Do not silently substitute a native subagent.

Treat the sample as invalid and restart from step 3 if any of these boundaries fail.

## Capture the baseline

Before the terminal mutation, record:

- Cindy session id, model, and exact project working directory;
- task directory and `plan.json` status;
- whether `plan.report` already exists, plus its length, hash, and modification time;
- existing files under `<task-dir>/.runtime/knowledge-finalization/`;
- relevant Truth/ADR file hashes or modification times.

Do not delete or rewrite pre-existing evidence merely to obtain a clean diff.

## Execute the lifecycle

Use the Ghost tools in the order required by `using-claw-kit`:

1. Discover `claw-kit`, call `list_tools`, then use `call_tool` for atomic operations.
2. Create a project-scope plan with one bounded E2E task. The actual `plan.create` call must contain the literal argument `"scope": "project"`; do not reinterpret the request as a session-scope health check.
3. Inspect the `plan.create` result before continuing. Its `planPath` must be under `<project-root>/.claw/tasks/`, never under a user-level `.claw/runtime/sessions/` directory. Stop and mark the sample invalid if either the argument or returned path violates this boundary.
4. Start the plan with explicit acceptance criteria.
5. Complete the task with a distinctive conclusion that must appear in the report.
6. Call `plan.done` with a retrospective and key decision.
7. Require a structured `knowledgeDispatch` with `policy: subagent`, an exact 64-hex `finalizeId`, and a non-empty prompt. Its terminal mutation must already have created the durable ready job. If this object is absent or malformed, stop and mark the test failed; never derive a finalize id, reconstruct a Writer prompt, or claim that dispatch occurred from `completionHooks` alone.
8. As the normal Cindy Lead, call `cindy_orca.get_workspace_info`; reuse the stable `knowledge-finalizer` Worker or create it only under the authorization established in preflight. Dispatch `knowledgeDispatch.prompt` byte-for-byte unchanged.
   The Worker agent must be `codex` even when the Lead uses DeepSeek or another Claude-compatible model; never inherit the Lead agent kind or substitute `claude-code`.
9. Treat `resumed`, `already-active`, `queued`, or a concrete `session-dispatch` receipt as accepted. End the Lead response immediately and do not wait for the Worker.

Do not manually call `did-turn-end`, `capture-report`, `knowledge.wait`, a background errand, or a raw CLI claim/done command. A naturally emitted Host turn-end event may exist, but the subagent result must not depend on it.

## Verify each boundary separately

Derive the exact task, report, and job paths from the plan/job instead of assuming a project-global job directory.

1. **Ready job:** exactly one `<task-dir>/.runtime/knowledge-finalization/<finalizeId>.json` exists immediately after `plan.done`. It has the originating Cindy session, `host: cindy`, effective `writer.executionPolicy: subagent` even when project configuration says `background`, `status: queued|running|succeeded`, and `reportCapture.mode: claim`.
2. **Lead timing:** the Lead terminal response occurs after accepted Orca dispatch and before Worker terminal success.
3. **Claim-time report:** `plan.report` changes after Worker claim and contains the distinctive pre-`plan.done` task conclusion. The main final answer is not required report input.
4. **Completion:** the same job reaches `succeeded`, records a claim token lifecycle, and the report contains a `knowledge_finalization` receipt for the same `finalizeId`.
5. **Truth/ADR:** identify the exact created or changed Truth/ADR files, or record the Writer's evidence-backed no-op result. Do not equate job success with a required document change.
6. **No duplication:** no second job exists for the same plan closeout, no assignment plan is written into the project task directory, and Worker completion does not create a recursive knowledge job.
7. **No Stop dependency:** job creation time is the `plan.done` terminal mutation; report capture time is Worker claim. Do not accept a sample where a Stop hook created the job.

## Report the result

Return the session id, plan path, finalize id, job path/status, report path/hash change, receipt evidence, Truth/ADR changes, and duplicate/recursion count. Label every failed boundary independently. Never report the E2E as passed merely because `plan.done` returned, a Worker was queued, or a report file already existed.
