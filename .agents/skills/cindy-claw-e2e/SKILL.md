---
name: cindy-claw-e2e
description: Orchestrate evidence-grade Cindy claw-kit E2Es from a controller thread across separate Codex and non-Codex normal project sessions, using minimal using-claw-kit prompts and verifying report, job, and knowledge outputs. Use after refreshing the Cindy adapter or CLI, or when reproducing knowledge-finalization failures.
---

# Cindy claw E2E repository controller

Use this skill in the controller or implementation thread. Each test thread
receives the bounded prompt below and follows its installed `using-claw-kit`
skill, which owns lifecycle commands, host routing, and knowledge-writer
dispatch.

Run two independent lanes:

1. a Codex main session for the Shell + bridge path;
2. a non-Codex main session, such as DeepSeek, for the Ghost path.

Dispatch both lanes in the same controller run. Do not end the controller turn
after creating only the first lane. Give each lane a unique title, marker, and
finalize id; use those identifiers and per-lane baselines to keep report, job,
and Truth/ADR evidence separate.

## Prepare a lane

1. Record the installed Cindy plugin version, CLI version, and critical hashes.
2. Restart Cindy only when the plugin, CLI, Client, or Core was refreshed and
   the user has not already confirmed a restart. Never repeat a confirmed
   restart.
3. Generate a lane-specific timestamped title and distinctive task-conclusion
   marker. Never reuse the other lane's session, plan, marker, or finalize id.
4. Use the real project root. Do not create a worktree unless the user
   explicitly approves that separate operation.

## Create the Codex lane

From a Codex controller, use the Cindy helper handoff surface to call
`send_to_session` in create mode:

- omit `target_session_id`;
- set `title` to the unique Codex test title;
- set `working_dir` to the absolute project root;
- set `use_worktree` to `false`;
- set `message` from the target prompt below.

Require `ok: true`, `wake_kind: created`, a new `target_session_id`, and
`agent_kind: codex`.

## Create the non-Codex lane

The helper create mode inherits the current session's agent and model; it
cannot select another agent. Therefore, do not call it from a Codex controller
to fabricate the non-Codex lane.

Use a two-session launcher flow:

1. In Cindy, use global **New**, select the Claude agent and the intended
   DeepSeek or other non-GPT model, and send a bounded launcher request. Global
   New may create `workspaceKind: dialogue`; this session is only the launcher,
   never the E2E target.
2. The launcher discovers the Cindy helper handoff surface and calls
   `send_to_session` in create mode. It must omit `target_session_id`, pass the
   absolute project root as `working_dir`, set `use_worktree: false`, pass the
   unique lane title, and send the target prompt below byte-for-byte.
3. Require `ok: true`, `wake_kind: created`, a new `target_session_id`, and a
   non-Codex agent/model. The launcher then stops without waiting for the target.
4. From the controller, read the new session metadata with
   `cindy_helper.list_sessions`. Accept it only when `workingDir` exactly equals
   the project root and `workspaceKind` is not `dialogue`. A visible bubble,
   successful click, or dialogue-local working directory is not dispatch proof.

If Cindy exposes a direct project-row new-session action that already preserves
the selected non-Codex model, it may replace the launcher. Apply the same
metadata checks. If neither route is available, report this lane as blocked
instead of substituting an Orca Worker, errand, native subagent, existing
session, or Codex session.

### UI automation safeguards

- Identify the Cindy window by its visible project/session content, not only by
  the process or window title; another desktop agent window may be open.
- When the controller turn is actively rendering tool calls, perform New,
  agent/model selection, paste, and Send in one UI transaction. Separate shell
  calls may restore focus to the controller between clicks.
- Derive click positions from the current window bounds or a fresh screenshot.
  Do not reuse coordinates across maximized and restored windows or across DPI
  scales.
- A send succeeds only when the prompt leaves the composer and a new session id
  is persisted. Verify with `list_sessions`; never report success from the input
  text, enabled Send button, or automation command exit code.
- If an accidental dialogue session was created, record its id as invalid and
  do not reuse its plan/report evidence. It may serve only as the launcher
  described above.

Both lanes must be normal, UI-visible Cindy project sessions. Obtain concrete
creation receipts for both lanes before ending the controller turn. Do not poll
either target or send a second wake-up message after both dispatches are
accepted; queued targets continue after the controller releases the Agent.

## Target prompt

Replace `{{lane}}`, `{{title}}`, and `{{marker}}`, then send only this
bounded request:

```text
在当前项目中，使用已安装的 using-claw-kit 完成一次完整的 claw-kit 项目工作流测试。

- 测试通道：{{lane}}
- 唯一计划标题：{{title}}
- 唯一任务结论标记：{{marker}}
- 创建并完成一个项目级计划，不使用 session scope。
- 计划只包含一项不修改产品源码的验证任务；成功完成任务时，在任务结论中原样写入唯一标记。
- 完成计划时记录简短 retrospective 和 key decision。
- 全程遵循 using-claw-kit 返回的路由、guidance 和 knowledgeDispatch；不要自行发明 claw 参数或知识收尾步骤。
- 不创建 worktree，不手工触发 report、hook、claim 或 done，不使用 errand 或 native subagent。
- 前台计划完成并按 using-claw-kit 接受异步知识派发后，返回可用的 plan path、finalizeId 和派发回执，然后停止。
```

Keep the target prompt minimal. Report schemas, scope syntax, Orca tool
sequences, and finalizer internals belong to `using-claw-kit` and the runtime
guidance.

## Verify from the controller

After both lanes finish, or when the user references them:

1. Read its session metadata and complete user, assistant, tool-use, and
   tool-result history with `cindy_helper.get_chat_history`.
2. Confirm the Codex lane used the Codex route and the non-Codex lane used the
   Ghost route. A different route invalidates that lane.
3. Take `planPath` and `finalizeId` from real lifecycle results. Never derive
   or reconstruct them.
4. Inspect that exact task directory:
   - `plan.json` reached `end.completed`;
   - `plan.report` contains the lane's distinctive marker;
   - exactly one matching knowledge-finalization job exists and reaches
     `succeeded`;
   - the report contains a `knowledge_finalization` receipt for the same id.
5. Record the exact Truth/ADR changes or the writer's evidence-backed no-op.
6. Check for duplicate jobs, assignment plans in the project task directory,
   and recursive finalization.
7. Compare timestamps and history to show the ready job came from the terminal
   plan mutation and report capture came from the writer claim, without relying
   on a Stop hook.

The controller owns this inspection. Do not ask the target thread to wait for
the writer or perform post-dispatch filesystem forensics. Report each lane and
each failed boundary separately; one passing lane never proves the other.
