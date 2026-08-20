import {
  test,
  after,
  assert,
  fs,
  os,
  path,
  spawn,
  spawnSync,
  fileURLToPath,
  shouldRunKnowledgeHook,
  opencodeKnowledgeFinalizerEnvironment,
  parseOpencodeRunOutput,
  resolveInvocationHost,
  withoutInvocationHost,
  CODEX_SDK_VERSION,
  resolveSessionWorkflowContext,
  tryEndKnowledgePlan,
  type JsonRecord,
  thisDir,
  cliPackageVersion,
  temporaryDirectories,
  createTemporaryDirectory,
  createFixture,
  localDateDirectory,
  taskDirectory,
  taskFile,
  taskFinalizerJobsDirectory,
  createPlanLikeTemplate,
  ISOLATED_ENV_KEYS,
  buildSpawnEnv,
  runClaw,
  runClawExpectFailure,
  runClawRaw,
  runGit,
  runClawHook,
  waitForCompletionRefreshStatus,
  waitForCondition,
  getLatestCompletionRefreshStatusFile,
  getCompletionRefreshStatusFiles,
  waitForLatestCompletionRefreshStatus,
  createGitnexusShim,
  createNpmShim,
  createClawUpdateNpmShim,
} from "./cli-test-support.js";


test("cli leaves completed-task deposition to automatic turn reporting", () => {
  const root = createFixture("cli-truth-contract-before-done");
  runClaw(
    [
      "init",
      "--name",
      "CLI Truth Contract",
      "--planning",
      "false",
      "--external-writer-skill",
      "external-knowledge-writer",
    ],
    root,
  );
  const projectJsonPath = path.join(root, ".claw", "project.json");
  const projectConfig = JSON.parse(fs.readFileSync(projectJsonPath, "utf-8")) as JsonRecord;
  projectConfig.truthDispatch = "per_task";
  fs.writeFileSync(projectJsonPath, `${JSON.stringify(projectConfig, null, 2)}\n`, "utf-8");

  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Verify task completion contract"], root);
  runClaw(["task", "edit", "--task-name", "demo-task", "--id", "1", "--title", "First task"], root);
  runClaw(["task", "add", "--task-name", "demo-task", "--title", "Second task"], root);
  runClaw(["plan", "edit", "--task-name", "demo-task", "--status", "process.active"], root);

  const taskDone = runClaw(
    ["task", "done", "--task-name", "demo-task", "--id", "1"],
    root,
  );

  assert.equal("stage" in taskDone, false);
  assert.equal("summary" in taskDone, false);
  assert.deepEqual(taskDone.nextsteps, [
    "1. Sync thread progress with `update_plan`.",
    "2. Continue with task #2.",
  ]);
  assert.equal(
    taskDone.notes,
    "In `process.active`, keep moving unless there is a real blocker or explicit user interruption. Before each successful `task done`, state a concise evidence-backed task conclusion in the immediately preceding assistant message; `task done` has no conclusion option. Use `plan done --retrospective` and repeatable `--key-decision` values for full-plan closeout.",
  );
  assert.deepEqual(taskDone.nextTask, {
    id: 2,
    title: "Second task",
    status: "pending",
  });
  assert.equal(taskDone.command, "task.done");
  assert.equal("taskDone" in taskDone, false);
});

test("cli plan done on a subplan resumes the parent plan instead of archiving the whole task", () => {
  const root = createFixture("cli-subplan-done-resume-parent");
  const env = { CODEX_THREAD_ID: "thread-subplan-done" };
  runClaw(["init", "--name", "Subplan Done Resume Parent", "--max-tasks-to-keep", "99", "--planning", "false"], root, env);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Parent goal"], root, env);

  runClaw([
    "task", "edit", "--id", "1",
    "--title", "Implement child work", "--detail", "Split the risky work into a subplan",
  ], root, env);
  runClaw(["task", "add", "--title", "Resume parent work"], root, env);
  runClaw(["task", "add", "--title", "Third parent task"], root, env);
  runClaw(["plan", "edit", "--status", "process.active"], root, env);
  runClaw(["subplan", "create", "--parent", "demo-task", "--task-id", "1"], root, env);

  runClaw([
    "plan", "start",
    "--requirements", "Child scope ready",
    "--add-task", "Finish child",
  ], root, env);
  runClaw(["task", "done", "--id", "2"], root, env);

  const doneResult = runClaw(
    ["plan", "done", "--retrospective", "Child complete."],
    root,
    env,
  );

  const registry = JSON.parse(
    fs.readFileSync(path.join(root, ".claw", "runtime", "session-bindings.json"), "utf-8"),
  ) as { bindings: Record<string, string> };
  const parentPlan = JSON.parse(fs.readFileSync(taskFile(root, "demo-task", "plan.json"), "utf-8")) as JsonRecord;
  const childPlan = JSON.parse(
    fs.readFileSync(taskFile(root, "demo-task", "Implement-child-work.json"), "utf-8"),
  ) as JsonRecord;

  assert.equal(doneResult.planStatus, "process.active");
  assert.equal("achievement" in doneResult, false);
  assert.match(String(doneResult.planPath), /tasks[\\/]\d{4}-\d{2}-\d{2}[\\/]demo-task[\\/]plan\.json$/);
  assert.deepEqual(doneResult.nextsteps, [
    "Continue with parent task #2: Resume parent work.",
    "Sync thread progress with `update_plan`.",
    "Start with task #2.",
  ]);
  assert.equal(doneResult.transition, "subplan_returned");
  assert.deepEqual(doneResult.nextTask, {
    id: 2,
    title: "Resume parent work",
    status: "pending",
  });
  assert.equal("goalMode" in doneResult, false);
  assert.equal("goalTool" in doneResult, false);
  assert.equal("archivedPlanPath" in doneResult, false);
  assert.equal(registry.bindings["thread-subplan-done"], path.relative(path.join(root, ".claw"), String(doneResult.planPath)).replace(/\\/g, "/"));
  assert.equal(((parentPlan.tasks as JsonRecord[])[0] as JsonRecord).status, "done");
  assert.equal(((parentPlan.tasks as JsonRecord[])[1] as JsonRecord).status, "pending");
  assert.equal(childPlan.status, "end.completed");
  assert.equal(fs.existsSync(path.join(root, ".claw", "archive", "tasks", "demo-task")), false);
});

test("cli plan done records completedAt and retains the current task path", async () => {
  const root = createFixture("plan-done-archive");
  const env = { CLAW_EMBEDDING_MOCK: "1", CODEX_THREAD_ID: "thread-root-done" };
  runClaw(["init", "--name", "Archive On Complete", "--max-tasks-to-keep", "99", "--planning", "false"], root, env);
  runClaw(["plan", "create", "--title", "archive-task", "--goal", "Archive after completion"], root, env);

  const doneResult = runClaw(
    ["plan", "done", "--retrospective", "Complete this task without immediate archival."],
    root,
    env,
  );

  assert.equal("completionRefresh" in doneResult, false);
  assert.match(String(doneResult.planPath), /\.claw[\\/]tasks[\\/]\d{4}-\d{2}-\d{2}[\\/]archive-task[\\/].*plan\.json$/);
  assert.equal("archivedPlanPath" in doneResult, false);
  assert.equal("hostActions" in doneResult, false);
  assert.equal((doneResult.nextsteps as string[]).some((step) => step.includes("update_goal")), true);
  const completedPlan = JSON.parse(fs.readFileSync(String(doneResult.planPath), "utf-8")) as JsonRecord;
  assert.match(String(completedPlan.completedAt), /^\d{4}-\d{2}-\d{2}T/);
  const refreshStatus = await waitForLatestCompletionRefreshStatus(root);
  const memory = refreshStatus.memory as JsonRecord;
  assert.equal(memory.task, undefined);
  assert.equal(fs.existsSync(path.join(taskDirectory(root, "archive-task"), "memory.sqlite")), false);
  assert.equal(fs.existsSync(taskDirectory(root, "archive-task")), true);
  assert.equal(fs.existsSync(path.join(root, ".claw", "archive", "tasks", "archive-task")), false);
  assert.equal(fs.existsSync(path.join(root, ".claw", "runtime", "session-bindings.json")), false);
  assert.equal("activeWorkflow" in runClaw(["context"], root, env), false);
});

test("cli plan done emits host-specific subagent dispatch for Codex and Cindy and rejects unsupported hosts", () => {
  const root = createFixture("plan-done-subagent-dispatch");
  const codexEnv = {
    CLAW_HOST: "codex",
    CODEX_THREAD_ID: "thread-subagent-dispatch",
  };
  runClaw(["init", "--name", "Subagent Dispatch", "--planning", "false"], root, codexEnv);
  const projectPath = path.join(root, ".claw", "project.json");
  const projectConfig = JSON.parse(fs.readFileSync(projectPath, "utf-8")) as JsonRecord;
  (projectConfig.knowledgeWriter as JsonRecord).executionPolicy = "subagent";
  fs.writeFileSync(projectPath, `${JSON.stringify(projectConfig, null, 2)}\n`, "utf-8");
  runClaw(["plan", "create", "--title", "dispatch-task", "--goal", "Dispatch writer"], root, codexEnv);

  const done = runClaw(["plan", "done", "--retrospective", "Ready for knowledge finalization."], root, codexEnv);
  const dispatch = done.knowledgeDispatch as JsonRecord;
  assert.equal(dispatch.policy, "subagent");
  assert.deepEqual(Object.keys(dispatch).sort(), [
    "finalizeId",
    "policy",
    "preferReuse",
    "prompt",
    "reasoningEffort",
    "schemaVersion",
  ]);
  assert.match(String(dispatch.finalizeId), /^[a-f0-9]{64}$/);
  assert.equal(dispatch.reasoningEffort, "medium");
  assert.match(String(dispatch.prompt), /claw knowledge-finalization job/i);
  assert.match(String(dispatch.prompt), /resources[\\/]delegate-writer[\\/]TEMPLATE\.json/);
  assert.doesNotMatch(String(dispatch.prompt), /Project root:|Task:|working directory/i);

  const cindyRoot = createFixture("plan-done-subagent-cindy");
  const cindyEnv = {
    CLAW_HOST: "cindy",
    CLAW_SESSION_ID: "cindy-session-subagent-dispatch",
  };
  runClaw(["init", "--name", "Cindy Subagent Dispatch", "--planning", "false"], cindyRoot, cindyEnv);
  runClaw(["plan", "create", "--title", "cindy-dispatch-task", "--goal", "Dispatch Orca writer"], cindyRoot, cindyEnv);

  const cindyDone = runClaw(
    ["plan", "done", "--retrospective", "Ready for Orca knowledge finalization."],
    cindyRoot,
    cindyEnv,
  );
  const cindyDispatch = cindyDone.knowledgeDispatch as JsonRecord;
  assert.equal(cindyDispatch.policy, "subagent");
  assert.match(String(cindyDispatch.prompt), /claw-kit Cindy Ghost tools/);
  assert.match(String(cindyDispatch.prompt), /resources[\\/]cindy-delegate-writer[\\/]TEMPLATE\.json/);
  assert.match(String(cindyDispatch.prompt), /session plan/i);
  assert.match(String(cindyDispatch.prompt), /assignment subplan/i);
  assert.doesNotMatch(String(cindyDispatch.prompt), /did-turn-end|Stop hook|knowledge wait/i);

  const unsupportedRoot = createFixture("plan-done-subagent-unsupported");
  const opencodeEnv = {
    CLAW_HOST: "opencode",
    CODEX_THREAD_ID: "thread-subagent-unsupported",
  };
  runClaw(["init", "--name", "Subagent Unsupported", "--planning", "false"], unsupportedRoot, opencodeEnv);
  const unsupportedProjectPath = path.join(unsupportedRoot, ".claw", "project.json");
  const unsupportedConfig = JSON.parse(fs.readFileSync(unsupportedProjectPath, "utf-8")) as JsonRecord;
  (unsupportedConfig.knowledgeWriter as JsonRecord).executionPolicy = "subagent";
  fs.writeFileSync(unsupportedProjectPath, `${JSON.stringify(unsupportedConfig, null, 2)}\n`, "utf-8");
  runClaw(["plan", "create", "--title", "unsupported-task", "--goal", "Reject writer"], unsupportedRoot, opencodeEnv);

  const failure = runClawExpectFailure(
    ["plan", "done", "--retrospective", "Must not complete."],
    unsupportedRoot,
    opencodeEnv,
  );
  assert.match(String((failure.error as JsonRecord).message), /supported only by the Codex or Cindy host/);
  const current = runClaw(["plan", "show"], unsupportedRoot, opencodeEnv);
  assert.equal(current.planStatus, "process.active");
  const editFailure = runClawExpectFailure(
    ["plan", "edit", "--retrospective", "Must not complete.", "--status", "end.completed"],
    unsupportedRoot,
    opencodeEnv,
  );
  assert.match(String((editFailure.error as JsonRecord).message), /supported only by the Codex or Cindy host/);
});

test("Codex subagent claim captures the Stop-style task report without waiting for Stop", () => {
  const root = createFixture("subagent-claim-report-capture");
  const codexHome = createTemporaryDirectory("subagent-claim-codex-home");
  const sessionId = "019fbbe1-subagent-claim-report";
  const env = {
    CLAW_HOST: "codex",
    CODEX_THREAD_ID: sessionId,
    CODEX_HOME: codexHome,
    CLAW_KNOWLEDGE_FINALIZER_DISABLE_LAUNCH: "1",
  };
  runClaw(["init", "--name", "Subagent Claim Report", "--planning", "false"], root, env);
  const projectPath = path.join(root, ".claw", "project.json");
  const projectConfig = JSON.parse(fs.readFileSync(projectPath, "utf-8")) as JsonRecord;
  (projectConfig.knowledgeWriter as JsonRecord).executionPolicy = "subagent";
  fs.writeFileSync(projectPath, `${JSON.stringify(projectConfig, null, 2)}\n`, "utf-8");
  runClaw(["plan", "create", "--title", "claim-report-task", "--goal", "Capture report at claim"], root, env);

  const done = runClaw(
    ["plan", "done", "--retrospective", "The completed plan is ready for claim."],
    root,
    env,
  );
  const dispatch = done.knowledgeDispatch as JsonRecord;
  const finalizeId = String(dispatch.finalizeId);
  const jobPath = path.join(taskFinalizerJobsDirectory(root, "claim-report-task"), `${finalizeId}.json`);
  const reportPath = taskFile(root, "claim-report-task", "plan.report");
  assert.equal(fs.existsSync(jobPath), true);
  assert.equal(fs.existsSync(reportPath), false);
  assert.equal((JSON.parse(fs.readFileSync(jobPath, "utf-8")) as JsonRecord).status, "queued");

  const missingTranscript = runClawExpectFailure([
    "knowledge", "claim",
    "--project-root", root,
    "--finalize-id", finalizeId,
  ], root, env);
  assert.match(String((missingTranscript.error as JsonRecord).message), /transcript is unavailable/i);
  const stillQueued = JSON.parse(fs.readFileSync(jobPath, "utf-8")) as JsonRecord;
  assert.equal(stillQueued.status, "queued");
  assert.equal(stillQueued.attempts, 0);
  assert.equal((stillQueued.reportCapture as JsonRecord).status, "pending");

  const transcriptDir = path.join(codexHome, "sessions", "2026", "08", "01");
  const transcriptPath = path.join(transcriptDir, `rollout-test-${sessionId}.jsonl`);
  fs.mkdirSync(transcriptDir, { recursive: true });
  const responseItem = (payload: JsonRecord) => JSON.stringify({
    timestamp: "2099-08-01T00:00:00.000Z",
    type: "response_item",
    payload,
  });
  fs.writeFileSync(transcriptPath, [
    responseItem({
      type: "message",
      role: "assistant",
      phase: "commentary",
      content: [{ type: "output_text", text: "Implemented the ready-job lifecycle and verified its invariant." }],
      internal_chat_message_metadata_passthrough: { turn_id: "turn-work" },
    }),
    responseItem({
      type: "custom_tool_call_output",
      output: [{ type: "input_text", text: `Script completed\n${JSON.stringify({ ok: true, command: "task.done" })}` }],
      internal_chat_message_metadata_passthrough: { turn_id: "turn-work" },
    }),
    responseItem({
      type: "custom_tool_call_output",
      output: [{ type: "input_text", text: `Script completed\n${JSON.stringify({ ok: true, command: "plan.create", planPath: path.join(root, "next-plan.json") })}` }],
      internal_chat_message_metadata_passthrough: { turn_id: "turn-next" },
    }),
    responseItem({
      type: "message",
      role: "assistant",
      phase: "commentary",
      content: [{ type: "output_text", text: "This next plan must not enter the prior report." }],
      internal_chat_message_metadata_passthrough: { turn_id: "turn-next" },
    }),
    responseItem({
      type: "custom_tool_call_output",
      output: [{ type: "input_text", text: `Script completed\n${JSON.stringify({ ok: true, command: "task.done" })}` }],
      internal_chat_message_metadata_passthrough: { turn_id: "turn-next" },
    }),
  ].join("\n"), "utf-8");

  const stop = runClawHook("auto-doc", root, {
    session_id: sessionId,
    turn_id: "turn-work",
    transcript_path: transcriptPath,
    cwd: root,
    hook_event_name: "Stop",
  }, env);
  assert.equal(stop.status, 0);
  assert.equal(fs.existsSync(reportPath), false);

  const claimed = runClaw([
    "knowledge", "claim",
    "--project-root", root,
    "--finalize-id", finalizeId,
  ], root, env);
  assert.equal(claimed.claimed, true);
  assert.equal(claimed.jobPath, jobPath);
  const entries = fs.readFileSync(reportPath, "utf-8").trim().split(/\r?\n/)
    .map((line) => JSON.parse(line) as JsonRecord);
  assert.deepEqual(entries.map((entry) => entry.entryType), ["task_conclusion"]);
  assert.equal(entries[0]?.message, "Implemented the ready-job lifecycle and verified its invariant.");
  const running = JSON.parse(fs.readFileSync(jobPath, "utf-8")) as JsonRecord;
  assert.equal(running.status, "running");
  assert.equal((running.reportCapture as JsonRecord).status, "captured");
  assert.equal((running.reportCapture as JsonRecord).messageCount, 1);

  fs.appendFileSync(transcriptPath, `\n${responseItem({
    type: "message",
    role: "assistant",
    phase: "final_answer",
    content: [{ type: "output_text", text: "A later final answer must not amend the claimed report." }],
    internal_chat_message_metadata_passthrough: { turn_id: "turn-work" },
  })}`, "utf-8");
  const laterStop = runClawHook("auto-doc", root, {
    session_id: sessionId,
    turn_id: "turn-work",
    transcript_path: transcriptPath,
    cwd: root,
    hook_event_name: "Stop",
  }, env);
  assert.equal(laterStop.status, 0);
  const finalReport = fs.readFileSync(reportPath, "utf-8");
  assert.equal(finalReport.trim().split(/\r?\n/).length, 1);
  assert.doesNotMatch(finalReport, /later final answer/i);
  assert.deepEqual(fs.readdirSync(path.dirname(jobPath)).filter((entry) => (
    entry.endsWith(".json") && !entry.endsWith(".assignments.json")
  )), [path.basename(jobPath)]);
});

test("Cindy subagent claim requires adapter input and atomically persists reports, including empty reports", () => {
  const root = createFixture("cindy-subagent-claim-report");
  const sessionId = "cindy-originating-session";
  const env = {
    CLAW_HOST: "cindy",
    CLAW_SESSION_ID: sessionId,
    CLAW_KNOWLEDGE_FINALIZER_DISABLE_LAUNCH: "1",
  };
  runClaw(["init", "--name", "Cindy Claim Report", "--planning", "false"], root, env);
  const projectPath = path.join(root, ".claw", "project.json");
  const projectConfig = JSON.parse(fs.readFileSync(projectPath, "utf-8")) as JsonRecord;
  (projectConfig.knowledgeWriter as JsonRecord).executionPolicy = "subagent";
  fs.writeFileSync(projectPath, `${JSON.stringify(projectConfig, null, 2)}\n`, "utf-8");
  runClaw(["plan", "create", "--title", "cindy-claim-task", "--goal", "Capture Cindy report at claim"], root, env);
  const done = runClaw(["plan", "done", "--retrospective", "Ready."], root, env);
  const finalizeId = String((done.knowledgeDispatch as JsonRecord).finalizeId);
  const jobPath = path.join(taskFinalizerJobsDirectory(root, "cindy-claim-task"), `${finalizeId}.json`);
  const reportPath = taskFile(root, "cindy-claim-task", "plan.report");

  const missingCapture = runClawExpectFailure([
    "knowledge", "claim", "--project-root", root, "--finalize-id", finalizeId,
  ], root, env);
  assert.match(String((missingCapture.error as JsonRecord).message), /Cindy report capture is unavailable/i);
  const queued = JSON.parse(fs.readFileSync(jobPath, "utf-8")) as JsonRecord;
  assert.equal(queued.status, "queued");
  assert.equal(queued.attempts, 0);

  const claimed = runClaw([
    "knowledge", "claim", "--project-root", root, "--finalize-id", finalizeId,
    "--cindy-report-stdin",
  ], root, env, JSON.stringify({
    session_id: sessionId,
    turn_id: "cindy-turn-1",
    task_conclusions: [{ turnId: "cindy-turn-1", message: "Implemented and verified Cindy no-Stop closeout." }],
  }));
  assert.equal(claimed.claimed, true);
  assert.equal(claimed.jobPath, jobPath);
  const entries = fs.readFileSync(reportPath, "utf-8").trim().split(/\r?\n/)
    .map((line) => JSON.parse(line) as JsonRecord);
  assert.deepEqual(entries.map((entry) => entry.message), ["Implemented and verified Cindy no-Stop closeout."]);
  const running = JSON.parse(fs.readFileSync(jobPath, "utf-8")) as JsonRecord;
  assert.equal(running.status, "running");
  assert.equal((running.reportCapture as JsonRecord).status, "captured");
  assert.equal((running.reportCapture as JsonRecord).messageCount, 1);

  runClaw(["plan", "create", "--title", "cindy-empty-report-task", "--goal", "Materialize an empty Cindy report"], root, env);
  const emptyDone = runClaw(["plan", "done", "--retrospective", "Ready without conclusions."], root, env);
  const emptyFinalizeId = String((emptyDone.knowledgeDispatch as JsonRecord).finalizeId);
  const emptyJobPath = path.join(taskFinalizerJobsDirectory(root, "cindy-empty-report-task"), `${emptyFinalizeId}.json`);
  const emptyReportPath = taskFile(root, "cindy-empty-report-task", "plan.report");
  const emptyClaimed = runClaw([
    "knowledge", "claim", "--project-root", root, "--finalize-id", emptyFinalizeId,
    "--cindy-report-stdin",
  ], root, env, JSON.stringify({
    session_id: sessionId,
    turn_id: "cindy-turn-2",
    task_conclusions: [],
  }));
  assert.equal(emptyClaimed.claimed, true);
  assert.equal(emptyClaimed.jobPath, emptyJobPath);
  assert.equal(fs.existsSync(emptyReportPath), true);
  assert.equal(fs.readFileSync(emptyReportPath, "utf-8"), "");
  const emptyRunning = JSON.parse(fs.readFileSync(emptyJobPath, "utf-8")) as JsonRecord;
  assert.equal(emptyRunning.status, "running");
  assert.equal((emptyRunning.reportCapture as JsonRecord).status, "captured");
  assert.equal((emptyRunning.reportCapture as JsonRecord).messageCount, 0);
});

test("cli plan edit completion dispatches the same completion refresh as plan done", async () => {
  const root = createFixture("plan-edit-completion-refresh");
  const env = { CLAW_HOST: "codex", CLAW_EMBEDDING_MOCK: "1", CODEX_THREAD_ID: "thread-root-edit" };
  runClaw(["init", "--name", "Edit Completion Refresh", "--max-tasks-to-keep", "99", "--planning", "false"], root, env);
  const projectPath = path.join(root, ".claw", "project.json");
  const projectConfig = JSON.parse(fs.readFileSync(projectPath, "utf-8")) as JsonRecord;
  (projectConfig.knowledgeWriter as JsonRecord).executionPolicy = "subagent";
  fs.writeFileSync(projectPath, `${JSON.stringify(projectConfig, null, 2)}\n`, "utf-8");
  runClaw(["plan", "create", "--title", "edit-task", "--goal", "Complete through plan edit"], root, env);

  const result = runClaw(
    ["plan", "edit", "--retrospective", "Complete through the status edit path.", "--status", "end.completed"],
    root,
    env,
  );

  assert.equal(result.planStatus, "end.completed");
  const achievement = result.achievement as JsonRecord;
  assert.equal(achievement.status, "end.completed");
  assert.equal(achievement.retrospectiveSaved, true);
  assert.equal((result.knowledgeDispatch as JsonRecord).policy, "subagent");
  const refreshStatus = await waitForLatestCompletionRefreshStatus(root);
  const memory = refreshStatus.memory as JsonRecord;
  assert.equal(memory.task, undefined);
  const completedPlan = JSON.parse(fs.readFileSync(String(result.planPath), "utf-8")) as JsonRecord;
  assert.match(String(completedPlan.completedAt), /^\d{4}-\d{2}-\d{2}T/);
});

test("cli plan edit end.closed dispatches completion finalization", async () => {
  const root = createFixture("plan-edit-end-closed-refresh");
  const env = { CLAW_EMBEDDING_MOCK: "1", CODEX_THREAD_ID: "thread-end-closed" };
  runClaw(["init", "--name", "Edit end.closed", "--max-tasks-to-keep", "99", "--planning", "false"], root, env);
  runClaw(["plan", "create", "--title", "end-task", "--goal", "End through plan edit"], root, env);

  const result = runClaw(["plan", "edit", "--status", "end.closed"], root, env);

  assert.equal(result.planStatus, "end.closed");
  const refreshStatus = await waitForLatestCompletionRefreshStatus(root);
  const memory = refreshStatus.memory as JsonRecord;
  assert.equal(memory.task, undefined);
});

test("cli plan edit end.leave dispatches end-state finalization", async () => {
  const root = createFixture("plan-edit-end-leave-refresh");
  const env = {
    CLAW_EMBEDDING_MOCK: "1",
    CLAW_HOST: "codex",
    CODEX_THREAD_ID: "thread-end-leave",
  };
  runClaw(["init", "--name", "Edit end.leave", "--max-tasks-to-keep", "99", "--planning", "false"], root, env);
  runClaw(["plan", "create", "--title", "leave-task", "--goal", "Leave without completion"], root, env);

  const result = runClaw(["plan", "edit", "--status", "end.leave"], root, env);

  assert.equal(result.planStatus, "end.leave");
  assert.equal(result.stage, "left");
  const refreshStatus = await waitForLatestCompletionRefreshStatus(root);
  const memory = refreshStatus.memory as JsonRecord;
  assert.equal(memory.task, undefined);
  const plan = JSON.parse(fs.readFileSync(taskFile(root, "leave-task", "plan.json"), "utf-8")) as JsonRecord;
  assert.equal(plan.completedAt, undefined);
  assert.equal(plan.leaveReason, "manual_leave");
});

test("cli plan done sweeps another task only when completedAt is older than one hour", () => {
  const root = createFixture("plan-done-delayed-archive-sweep");
  const env = { CLAW_EMBEDDING_MOCK: "1" };
  runClaw(["init", "--name", "Delayed Archive Sweep", "--max-tasks-to-keep", "99", "--planning", "false"], root, env);
  runClaw(["plan", "create", "--title", "older-task", "--goal", "Older task"], root, env);
  runClaw(["plan", "done", "--task-name", "older-task", "--retrospective", "Older complete."], root, env);

  const olderPlanPath = taskFile(root, "older-task", "plan.json");
  const olderPlan = JSON.parse(fs.readFileSync(olderPlanPath, "utf-8")) as JsonRecord;
  olderPlan.completedAt = "2020-01-01T00:00:00.000Z";
  fs.writeFileSync(olderPlanPath, `${JSON.stringify(olderPlan, null, 2)}\n`, "utf-8");

  runClaw(["plan", "create", "--title", "fresh-task", "--goal", "Fresh task"], root, env);
  runClaw(["plan", "done", "--task-name", "fresh-task", "--retrospective", "Fresh complete."], root, env);

  assert.equal(fs.existsSync(path.join(root, ".claw", "tasks", "older-task")), false);
  assert.equal(fs.existsSync(path.join(root, ".claw", "archive", "tasks", path.basename(path.dirname(taskDirectory(root, "fresh-task"))), "older-task")), true);
  assert.equal(fs.existsSync(taskDirectory(root, "fresh-task")), true);
  assert.equal(fs.existsSync(path.join(root, ".claw", "archive", "tasks", path.basename(path.dirname(taskDirectory(root, "fresh-task"))), "fresh-task")), false);
});

test("cli plan done skips gitnexus refresh when project config disables it", async () => {
  const root = createFixture("gitnexus-disabled");
  const env = {
    PATH: process.env.PATH ?? "",
    CLAW_EMBEDDING_MOCK: "1",
  };

  runClaw(["init", "--name", "No Gitnexus"], root, env);
  const contentPath = path.join(root, "plan.json");
  fs.writeFileSync(
    contentPath,
    JSON.stringify(
      {
        tasks: [{ id: 1, title: "Done task", status: "done" }],
      },
      null,
      2,
    ),
    "utf-8",
  );
  runClaw(["plan", "create", "--title", "disabled-task", "--goal", "Close without gitnexus"], root, env);
  runClaw(["task", "edit", "--task-name", "disabled-task", "--id", "1", "--title", "Done task"], root, env);
  runClaw(["plan", "edit", "--task-name", "disabled-task", "--status", "process.active"], root, env);
  runClaw(["task", "done", "--task-name", "disabled-task", "--id", "1"], root, env);

  const doneResult = runClaw(
    ["plan", "done", "--task-name", "disabled-task", "--retrospective", "No gitnexus refresh needed."],
    root,
    env,
  );
  assert.equal("completionRefresh" in doneResult, false);
  const refreshStatus = await waitForLatestCompletionRefreshStatus(root);
  const gitnexus = (refreshStatus.gitnexus as JsonRecord);
  assert.equal(gitnexus.enabled, false);
  assert.match(String(gitnexus.reason), /not enabled/);
});

test("cli plan done returns terminal state before detached gitnexus analysis", async () => {
  const root = createFixture("gitnexus-after-terminal-dispatch");
  const shim = createGitnexusShim("require-completion-worker");
  const env = {
    PATH: `${shim.binDir}${path.delimiter}${process.env.PATH ?? ""}`,
    CLAW_EMBEDDING_MOCK: "1",
    CLAW_HOST: "codex",
    CODEX_THREAD_ID: "thread-gitnexus-after-dispatch",
  };

  runClaw(["init", "--name", "Gitnexus After Dispatch", "--gitnexus", "true", "--planning", "false"], root, env);
  const projectPath = path.join(root, ".claw", "project.json");
  const projectConfig = JSON.parse(fs.readFileSync(projectPath, "utf-8")) as JsonRecord;
  (projectConfig.knowledgeWriter as JsonRecord).executionPolicy = "subagent";
  fs.writeFileSync(projectPath, `${JSON.stringify(projectConfig, null, 2)}\n`, "utf-8");
  runClaw(["plan", "create", "--title", "dispatch-task", "--goal", "Return dispatch first"], root, env);

  const done = runClaw(
    ["plan", "done", "--retrospective", "Terminal state precedes indexing."],
    root,
    env,
  );

  assert.equal(done.planStatus, "end.completed");
  assert.equal((done.knowledgeDispatch as JsonRecord).policy, "subagent");
  const refreshStatus = await waitForLatestCompletionRefreshStatus(root);
  assert.equal(refreshStatus.ok, true);
  assert.equal((refreshStatus.gitnexus as JsonRecord).enabled, true);
  assert.match(fs.readFileSync(shim.logPath, "utf-8"), /analyze --embeddings --no-ai-context/);
});

test("cli plan done reports gitnexus auto-install failure through detached completion refresh", async () => {
  const root = createFixture("gitnexus-install-fails");
  const npmShim = createNpmShim("fail-install");
  const env = {
    PATH: `${npmShim.binDir}${path.delimiter}${process.env.PATH ?? ""}`,
    CLAW_EMBEDDING_MOCK: "1",
  };

  runClaw(["init", "--name", "Gitnexus Install Fail", "--gitnexus", "true"], root, env);
  const contentPath = path.join(root, "plan.json");
  fs.writeFileSync(
    contentPath,
    JSON.stringify(
      {
        tasks: [{ id: 1, title: "Done task", status: "done" }],
      },
      null,
      2,
    ),
    "utf-8",
  );
  runClaw(["plan", "create", "--title", "install-task", "--goal", "Catch install failure"], root, env);
  runClaw(["task", "edit", "--task-name", "install-task", "--id", "1", "--title", "Done task"], root, env);
  runClaw(["plan", "edit", "--task-name", "install-task", "--status", "process.active"], root, env);
  runClaw(["task", "done", "--task-name", "install-task", "--id", "1"], root, env);

  const done = runClaw(
    ["plan", "done", "--task-name", "install-task", "--retrospective", "Queue the failing refresh."],
    root,
    env,
  );

  assert.equal(done.planStatus, "end.completed");
  const refreshStatus = await waitForLatestCompletionRefreshStatus(root);
  assert.equal(refreshStatus.ok, false);
  const error = refreshStatus.error as JsonRecord;
  assert.match(String(error.message), /automatic installation failed/i);
  const npmLog = fs.readFileSync(npmShim.logPath, "utf-8");
  assert.match(npmLog, /install -g @veewo\/gitnexus/);
});

test("cli plan done auto-enables gitnexus embeddings and seeds the matching model cache", async () => {
  const root = createFixture("gitnexus-embeddings-preflight");
  const shim = createGitnexusShim("primary");
  const fakePackageRoot = path.join(root, "fake-global", "@veewo", "gitnexus");
  const targetCacheDir = path.join(
    fakePackageRoot,
    "node_modules",
    "@huggingface",
    "transformers",
    ".cache",
    "Snowflake",
    "snowflake-arctic-embed-xs",
  );
  const sourceCacheDir = path.join(root, ".model-cache", "Snowflake", "snowflake-arctic-embed-xs");
  fs.mkdirSync(path.join(fakePackageRoot, "node_modules", "@huggingface", "transformers"), { recursive: true });
  fs.mkdirSync(sourceCacheDir, { recursive: true });
  fs.writeFileSync(path.join(sourceCacheDir, "config.json"), "{\"model\":\"xs\"}\n", "utf-8");
  fs.writeFileSync(path.join(sourceCacheDir, "tokenizer.json"), "{\"ok\":true}\n", "utf-8");

  const env = {
    PATH: `${shim.binDir}${path.delimiter}${process.env.PATH ?? ""}`,
    CLAW_EMBEDDING_MOCK: "1",
    CLAW_TEST_GITNEXUS_PACKAGE_ROOT: fakePackageRoot,
  };

  runClaw(["init", "--name", "Gitnexus Embeddings Preflight", "--gitnexus", "true"], root, env);
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify(
      {
        version: cliPackageVersion,
        id: "gitnexus-embeddings-preflight",
        name: "Gitnexus Embeddings Preflight",
        maxTasksToKeep: 99,
        planning: false,
        goalMode: true,
        truthDispatch: "per_task",
        externalTruthSkill: null,
        externalAdrSkill: null,
        contextPaths: [],
        memory: {
          enabled: true,
          externalDocPaths: [],
          embedding: {
            provider: "local",
            model: "Snowflake/snowflake-arctic-embed-xs",
            local: {
              modelCacheDir: path.join(root, ".model-cache"),
            },
          },
        },
        gitnexus: true,
      },
      null,
      2,
    ),
    "utf-8",
  );
  const contentPath = path.join(root, "plan.json");
  fs.writeFileSync(
    contentPath,
    JSON.stringify(
      {
        tasks: [{ id: 1, title: "Done task", status: "done" }],
      },
      null,
      2,
    ),
    "utf-8",
  );

  runClaw(["plan", "create", "--title", "preflight-task", "--goal", "Enable GitNexus embeddings"], root, env);
  runClaw(["task", "edit", "--task-name", "preflight-task", "--id", "1", "--title", "Done task"], root, env);
  runClaw(["plan", "edit", "--task-name", "preflight-task", "--status", "process.active"], root, env);
  runClaw(["task", "done", "--task-name", "preflight-task", "--id", "1"], root, env);

  const doneResult = runClaw(
    ["plan", "done", "--task-name", "preflight-task", "--retrospective", "Enable embeddings inside background refresh."],
    root,
    env,
  );

  assert.equal(doneResult.planSummary, "1/1 preflight-task");
  const refreshStatus = await waitForLatestCompletionRefreshStatus(root);
  const meta = JSON.parse(fs.readFileSync(path.join(root, ".gitnexus", "meta.json"), "utf-8")) as {
    analyzeOptions?: { embeddings?: boolean };
  };
  assert.equal(meta.analyzeOptions?.embeddings, true);
  assert.equal(fs.existsSync(path.join(targetCacheDir, "config.json")), true);

  const gitnexus = refreshStatus.gitnexus as JsonRecord;
  assert.equal(gitnexus.enabled, true);

  const gitnexusLog = fs.readFileSync(shim.logPath, "utf-8");
  assert.match(gitnexusLog, /analyze --embeddings --no-ai-context/);
  assert.doesNotMatch(gitnexusLog, /^analyze --no-ai-context\r?$/m);
});

test("cli direct queues completion refresh without main-agent deposition guidance", async () => {
  const root = createFixture("direct-no-plan");
  const env = {
    CLAW_EMBEDDING_MOCK: "1",
  };

  runClaw(
    [
      "init",
      "--name",
      "Direct No Plan",
      "--external-writer-skill",
      "external-knowledge-writer",
    ],
    root,
    env,
  );
  fs.writeFileSync(path.join(root, ".claw", "memory.md"), "direct flow memory\n", "utf-8");

  const result = runClaw(["direct"], root, env);

  assert.equal(result.command, "direct");
  assert.equal("planStatus" in result, false);
  assert.equal("planSummary" in result, false);
  assert.equal("completionRefresh" in result, false);
  assert.match(String(result.summary), /lean path|without extra decomposition/i);
  assert.match(String(result.notes), /compatibility surface/i);
  assert.match(String(result.notes), /claw plan create/i);
  assert.ok(Array.isArray(result.nextsteps));
  assert.equal((result.nextsteps as string[]).some((step) => step.includes("truth-writer")), false);
  assert.equal((result.nextsteps as string[]).some((step) => step.includes("completion refresh")), true);


  const refreshStatus = await waitForLatestCompletionRefreshStatus(root);
  const memory = refreshStatus.memory as JsonRecord;
  assert.equal(refreshStatus.ok, true);
  assert.ok(Number((memory.project as JsonRecord).indexedCount) >= 1);
  assert.equal((memory.task as JsonRecord | undefined), undefined);
});

test("overlapping direct closeouts coalesce into one completion refresh", async () => {
  const root = createFixture("direct-single-flight");
  const shim = createGitnexusShim("primary", 750);
  const env = {
    CLAW_EMBEDDING_MOCK: "1",
    PATH: `${shim.binDir}${path.delimiter}${process.env.PATH ?? ""}`,
  };
  runClaw(["init", "--name", "Direct Single Flight", "--gitnexus", "true"], root, env);
  fs.writeFileSync(path.join(root, ".claw", "memory.md"), "single-flight memory\n", "utf-8");

  runClaw(["direct"], root, env);
  await waitForCondition(() => getCompletionRefreshStatusFiles(root).length >= 1, 5000);
  runClaw(["direct"], root, env);
  await waitForCondition(() => getCompletionRefreshStatusFiles(root).length >= 2, 5000);

  const statuses = await Promise.all(
    getCompletionRefreshStatusFiles(root).map((statusFile) => waitForCompletionRefreshStatus(statusFile)),
  );
  assert.equal(statuses.every((status) => status.ok === true), true);
  assert.equal(statuses.some((status) => status.coalesced === true), true);
  assert.equal(Math.max(...statuses.map((status) => Number(status.coalescedCount ?? 0))), 1);
  const analyzeCalls = fs.readFileSync(shim.logPath, "utf-8")
    .split(/\r?\n/)
    .filter((line) => line === "analyze --embeddings --no-ai-context");
  assert.equal(analyzeCalls.length, 1);
});

test("completion refresh retries one transient GitNexus lock without shell warnings", async () => {
  const root = createFixture("direct-gitnexus-lock-retry");
  const shim = createGitnexusShim("lock-once");
  const env = {
    CLAW_EMBEDDING_MOCK: "1",
    PATH: `${shim.binDir}${path.delimiter}${process.env.PATH ?? ""}`,
  };
  runClaw(["init", "--name", "GitNexus Lock Retry", "--gitnexus", "true"], root, env);
  fs.writeFileSync(path.join(root, ".claw", "memory.md"), "lock retry memory\n", "utf-8");

  const result = runClawRaw(["direct"], root, env);
  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stderr, /DEP0190/);
  const refreshStatus = await waitForLatestCompletionRefreshStatus(root);
  assert.equal(refreshStatus.ok, true);
  assert.equal((refreshStatus.gitnexus as JsonRecord).enabled, true);
  const analyzeCalls = fs.readFileSync(shim.logPath, "utf-8")
    .split(/\r?\n/)
    .filter((line) => line === "analyze --embeddings --no-ai-context");
  assert.equal(analyzeCalls.length, 2);
});

test("completion refresh rebuilds once after a Windows GitNexus access violation", { skip: process.platform !== "win32" }, async () => {
  const root = createFixture("direct-gitnexus-access-violation");
  const shim = createGitnexusShim("access-violation-once");
  const env = {
    CLAW_EMBEDDING_MOCK: "1",
    PATH: `${shim.binDir}${path.delimiter}${process.env.PATH ?? ""}`,
  };
  runClaw(["init", "--name", "GitNexus Access Violation", "--gitnexus", "true"], root, env);
  fs.writeFileSync(path.join(root, ".claw", "memory.md"), "access violation recovery\n", "utf-8");

  const result = runClawRaw(["direct"], root, env);
  assert.equal(result.status, 0);
  const refreshStatus = await waitForLatestCompletionRefreshStatus(root);
  assert.equal(refreshStatus.ok, true);
  assert.equal((refreshStatus.gitnexus as JsonRecord).enabled, true);
  const analyzeCalls = fs.readFileSync(shim.logPath, "utf-8")
    .split(/\r?\n/)
    .filter((line) => line.startsWith("analyze "));
  assert.deepEqual(analyzeCalls, [
    "analyze --embeddings --no-ai-context",
    "analyze --force --embeddings --no-ai-context",
  ]);
});

test("knowledge hook preflight depends only on a valid session knowledge target", () => {
  const root = createFixture("hook-knowledge-preflight");
  const sessionId = "thread-knowledge-preflight";
  runClaw(["init", "--name", "Hook Knowledge Preflight"], root);
  const rawInput = JSON.stringify({
    session_id: sessionId,
    turn_id: "turn-preflight",
    transcript_path: path.join(root, "missing-transcript.jsonl"),
    cwd: root,
  });

  assert.equal(shouldRunKnowledgeHook(rawInput, root, {}), false);

  const env = { CODEX_THREAD_ID: sessionId };
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Exercise hook preflight"], root, env);
  assert.equal(shouldRunKnowledgeHook(rawInput, root, {}), true);

  const nestedCwd = path.join(root, "packages", "nested");
  fs.mkdirSync(nestedCwd, { recursive: true });
  assert.equal(shouldRunKnowledgeHook(JSON.stringify({
    session_id: sessionId,
    turn_id: "turn-nested-preflight",
    cwd: nestedCwd,
  }), nestedCwd, {}), true);

  const knowledgeSessionsDir = path.join(root, ".claw", "runtime", "knowledge-sessions");
  for (const entry of fs.readdirSync(knowledgeSessionsDir)) {
    fs.unlinkSync(path.join(knowledgeSessionsDir, entry));
  }
  assert.equal(fs.existsSync(path.join(root, ".claw", "runtime", "session-bindings.json")), true);
  assert.equal(shouldRunKnowledgeHook(rawInput, root, {}), false);

  const subagentRoot = createFixture("hook-knowledge-preflight-subagent");
  const subagentSessionId = "thread-knowledge-preflight-subagent";
  runClaw(["init", "--name", "Hook Subagent Preflight"], subagentRoot);
  const subagentProjectPath = path.join(subagentRoot, ".claw", "project.json");
  const subagentConfig = JSON.parse(fs.readFileSync(subagentProjectPath, "utf-8")) as JsonRecord;
  (subagentConfig.knowledgeWriter as JsonRecord).executionPolicy = "subagent";
  fs.writeFileSync(subagentProjectPath, `${JSON.stringify(subagentConfig, null, 2)}\n`, "utf-8");
  runClaw(
    ["plan", "create", "--title", "subagent-task", "--goal", "Skip Stop preflight"],
    subagentRoot,
    { CODEX_THREAD_ID: subagentSessionId },
  );
  assert.equal(shouldRunKnowledgeHook(JSON.stringify({
    session_id: subagentSessionId,
    turn_id: "turn-subagent-preflight",
    cwd: subagentRoot,
  }), subagentRoot, {}), false);
});

test("knowledge hook exits before reading stdin when cwd has no project .claw ancestor", async () => {
  const root = createFixture("hook-preflight-no-claw");
  const cliPath = path.resolve(thisDir, "..", "dist", "bin.js");
  const child = spawn(process.execPath, [cliPath, "hook", "auto-doc", "--host", "codex"], {
    cwd: root,
    env: buildSpawnEnv(),
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("knowledge hook waited for stdin without cwd/.claw"));
    }, 2_000);
    child.once("error", reject);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });

  assert.equal(exitCode, 0);
});

test("Stop hook captures the latest final assistant message into exactly one active plan report", () => {
  const root = createFixture("hook-stop-report");
  runClaw(["init", "--name", "Hook Stop Project"], root);
  const sessionId = "thread-stop-demo";
  const env = { CODEX_THREAD_ID: sessionId };
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Capture turn report"], root, env);
  const transcriptPath = path.join(root, "thread.jsonl");
  fs.writeFileSync(
    transcriptPath,
    [
      JSON.stringify({
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          phase: "commentary",
          content: [{ type: "output_text", text: "Working update" }],
        },
      }),
      JSON.stringify({
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          phase: "final_answer",
          content: [{ type: "output_text", text: "Final report message" }],
        },
      }),
    ].join("\n"),
    "utf-8",
  );
  const payload = {
    session_id: sessionId,
    turn_id: "turn-1",
    transcript_path: transcriptPath,
    cwd: root,
    hook_event_name: "Stop",
  };
  const first = runClawHook("auto-doc", root, payload, env);
  assert.equal(first.status, 0);
  assert.equal(first.stdout.trim(), "");
  const reportPath = taskFile(root, "demo-task", "plan.report");
  const firstEntries = fs.readFileSync(reportPath, "utf-8").trim().split(/\r?\n/);
  assert.equal(firstEntries.length, 1);
  assert.equal((JSON.parse(firstEntries[0]!) as { message: string }).message, "Final report message");

  const duplicate = runClawHook("auto-doc", root, payload, env);
  assert.equal(duplicate.status, 0);
  const duplicateEntries = fs.readFileSync(reportPath, "utf-8").trim().split(/\r?\n/);
  assert.equal(duplicateEntries.length, 1);
  assert.equal(fs.existsSync(path.join(root, ".claw", "runtime", "knowledge-finalization", "jobs")), false);
});

test("one Stop recovers successful task-done conclusions only from its current turn", () => {
  const root = createFixture("hook-stop-task-done-history");
  runClaw(["init", "--name", "Hook Task History"], root);
  const sessionId = "thread-task-history";
  const env = { CODEX_THREAD_ID: sessionId };
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Capture task conclusions"], root, env);
  const transcriptPath = path.join(root, "thread-history.jsonl");
  const message = (turnId: string, text: string, phase = "commentary") => JSON.stringify({
    type: "response_item",
    payload: {
      type: "message",
      role: "assistant",
      phase,
      content: [{ type: "output_text", text }],
      internal_chat_message_metadata_passthrough: { turn_id: turnId },
    },
  });
  const turnContext = (turnId: string) => JSON.stringify({
    type: "turn_context",
    payload: { turn_id: turnId },
  });
  const checkpoint = (
    turnId: string,
    outputKind: "array" | "string" = "array",
  ) => JSON.stringify({
    type: "response_item",
    payload: {
      type: outputKind === "array" ? "custom_tool_call_output" : "function_call_output",
      call_id: `call-${turnId}`,
      output: outputKind === "array" ? [{
        type: "input_text",
        text: `Script completed\n${JSON.stringify({ ok: true, command: "task.done" })}`,
      }] : `Script completed\n${JSON.stringify({ ok: true, command: "task.done" })}`,
      internal_chat_message_metadata_passthrough: { turn_id: turnId },
    },
  });
  fs.writeFileSync(
    transcriptPath,
    [
      turnContext("turn-previous"),
      message("turn-previous", "Previous turn conclusion."),
      checkpoint("turn-previous"),
      turnContext("turn-work"),
      checkpoint("turn-work"),
      message("turn-work", "Task one conclusion."),
      JSON.stringify({
        type: "response_item",
        payload: {
          type: "function_call_output",
          output: "failed: claw task done --id 1; command text alone is not a successful result",
          internal_chat_message_metadata_passthrough: { turn_id: "turn-work" },
        },
      }),
      checkpoint("turn-work"),
      checkpoint("turn-work", "string"),
      turnContext("turn-work"),
      message("turn-work", "Task two and three conclusion."),
      checkpoint("turn-work", "string"),
      message("turn-other", "Unrelated turn conclusion."),
      checkpoint("turn-other"),
      message("turn-work", "Final report message.", "final_answer"),
    ].join("\n"),
    "utf-8",
  );

  const payload = {
    session_id: sessionId,
    turn_id: "turn-work",
    transcript_path: transcriptPath,
    cwd: root,
    hook_event_name: "Stop",
  };
  assert.equal(runClawHook("auto-doc", root, payload, env).status, 0);

  const reportPath = taskFile(root, "demo-task", "plan.report");
  const entries = fs.readFileSync(reportPath, "utf-8").trim().split(/\r?\n/).map((line) => JSON.parse(line) as JsonRecord);
  assert.deepEqual(entries.map((entry) => entry.entryType ?? "turn_report"), [
    "task_conclusion",
    "task_conclusion",
    "turn_report",
  ]);
  assert.deepEqual(entries.slice(0, 2).map((entry) => ({
    turnId: entry.turnId,
    message: entry.message,
  })), [
    { turnId: "turn-work", message: "Task one conclusion." },
    { turnId: "turn-work", message: "Task two and three conclusion." },
  ]);
  assert.equal(entries[2]!.message, "Final report message.");

  assert.equal(runClawHook("auto-doc", root, payload, env).status, 0);
  assert.equal(fs.readFileSync(reportPath, "utf-8").trim().split(/\r?\n/).length, 3);
});

test("end.closed Stop queues conclusion-based knowledge finalization", () => {
  const root = createFixture("hook-stop-end-closed");
  const sessionId = "thread-end.closed";
  const env = {
    CODEX_THREAD_ID: sessionId,
    CLAW_KNOWLEDGE_FINALIZER_DISABLE_LAUNCH: "1",
  };
  runClaw(["init", "--name", "Hook end.closed", "--planning", "false"], root, env);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Capture end-state conclusions"], root, env);
  runClaw(["plan", "edit", "--status", "end.closed"], root, env);

  const transcriptPath = path.join(root, "thread-end.closed.jsonl");
  fs.writeFileSync(transcriptPath, JSON.stringify({
    type: "response_item",
    payload: {
      type: "message",
      role: "assistant",
      phase: "final_answer",
      content: [{ type: "output_text", text: "Conclusion recorded at end.closed." }],
    },
  }), "utf-8");
  const stop = runClawHook("auto-doc", root, {
    session_id: sessionId,
    turn_id: "turn-end.closed",
    transcript_path: transcriptPath,
    cwd: root,
  }, env);

  assert.equal(stop.status, 0);
  const jobsDir = taskFinalizerJobsDirectory(root, "demo-task");
  const jobFiles = fs.readdirSync(jobsDir).filter((name) => name.endsWith(".json"));
  assert.equal(jobFiles.length, 1);
  const queued = JSON.parse(fs.readFileSync(path.join(jobsDir, jobFiles[0]!), "utf-8")) as JsonRecord;
  assert.equal(queued.status, "queued");
  assert.equal(queued.planPath, taskFile(root, "demo-task", "plan.json"));
});

test("end.leave Stop queues knowledge finalization", () => {
  const root = createFixture("hook-stop-end-leave");
  const sessionId = "thread-end.leave";
  const env = {
    CODEX_THREAD_ID: sessionId,
    CLAW_KNOWLEDGE_FINALIZER_DISABLE_LAUNCH: "1",
  };
  runClaw(["init", "--name", "Hook end.leave", "--planning", "false"], root, env);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Leave without finalization"], root, env);
  runClaw(["plan", "edit", "--status", "end.leave"], root, env);

  const transcriptPath = path.join(root, "thread-end.leave.jsonl");
  fs.writeFileSync(transcriptPath, JSON.stringify({
    type: "response_item",
    payload: {
      type: "message",
      role: "assistant",
      phase: "final_answer",
      content: [{ type: "output_text", text: "This is not a completion conclusion." }],
    },
  }), "utf-8");
  const stop = runClawHook("auto-doc", root, {
    session_id: sessionId,
    turn_id: "turn-end.leave",
    transcript_path: transcriptPath,
    cwd: root,
  }, env);

  assert.equal(stop.status, 0);
  const jobsDir = taskFinalizerJobsDirectory(root, "demo-task");
  const jobFiles = fs.readdirSync(jobsDir).filter((name) => name.endsWith(".json"));
  assert.equal(jobFiles.length, 1);
  const queued = JSON.parse(fs.readFileSync(path.join(jobsDir, jobFiles[0]!), "utf-8")) as JsonRecord;
  assert.equal(queued.status, "queued");
  assert.equal(queued.planPath, taskFile(root, "demo-task", "plan.json"));
});

test("completed-plan Stop owns the final turn and queues a retryable SDK job", () => {
  const root = createFixture("hook-stop-closeout");
  const sessionId = "thread-stop-closeout";
  const env = {
    CODEX_THREAD_ID: sessionId,
    CLAW_KNOWLEDGE_FINALIZER_DISABLE_LAUNCH: "1",
  };
  runClaw(["init", "--name", "Hook Closeout", "--planning", "false"], root, env);
  const projectJsonPath = path.join(root, ".claw", "project.json");
  const projectConfig = JSON.parse(fs.readFileSync(projectJsonPath, "utf-8")) as JsonRecord;
  projectConfig.knowledgeWriter = {
    externalSkills: ["truth-writer", "adr-writer"],
    model: "gpt-test-writer",
    reasoningEffort: "high",
  };
  fs.writeFileSync(projectJsonPath, `${JSON.stringify(projectConfig, null, 2)}\n`, "utf-8");
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Close out automatically"], root, env);
  runClaw(["task", "done", "--id", "1"], root, env);
  runClaw(["plan", "done", "--retrospective", "Completed."], root, env);

  const transcriptPath = path.join(root, "thread-closeout.jsonl");
  fs.writeFileSync(transcriptPath, JSON.stringify({
    type: "response_item",
    payload: {
      type: "message",
      role: "assistant",
      phase: "final_answer",
      content: [{ type: "output_text", text: "Root plan is complete." }],
    },
  }), "utf-8");
  const stop = runClawHook("auto-doc", root, {
    session_id: sessionId,
    turn_id: "turn-closeout",
    transcript_path: transcriptPath,
    cwd: root,
  }, env);
  assert.equal(stop.status, 0);
  const reportPath = taskFile(root, "demo-task", "plan.report");
  assert.equal((JSON.parse(fs.readFileSync(reportPath, "utf-8")) as { turnId: string }).turnId, "turn-closeout");
  const jobsDir = taskFinalizerJobsDirectory(root, "demo-task");
  const jobFiles = fs.readdirSync(jobsDir).filter((name) => name.endsWith(".json"));
  assert.equal(jobFiles.length, 1);
  const jobPath = path.join(jobsDir, jobFiles[0]!);
  const queued = JSON.parse(fs.readFileSync(jobPath, "utf-8")) as JsonRecord;
  assert.equal(queued.status, "queued");
  assert.equal(queued.attempts, 0);
  assert.deepEqual(queued.writer, {
    executionPolicy: "background",
    externalSkills: ["truth-writer", "adr-writer"],
    model: "gpt-test-writer",
    reasoningEffort: "high",
    datedSectionsToKeep: 6,
  });
  assert.equal(queued.planPath, taskFile(root, "demo-task", "plan.json"));
  assert.equal(queued.reportPath, reportPath);

  delete queued.writer;
  fs.writeFileSync(jobPath, `${JSON.stringify(queued, null, 2)}\n`, "utf-8");

  const failed = runClawRaw(["internal-knowledge-finalize", "--job", jobPath], root, {
    ...env,
    CLAW_KNOWLEDGE_FINALIZER_DISABLE_RETRY: "1",
    CLAW_CODEX_PATH_OVERRIDE: path.join(root, "missing-codex.exe"),
  });
  assert.equal(failed.status, 0);
  const failedJob = JSON.parse(fs.readFileSync(jobPath, "utf-8")) as JsonRecord;
  assert.equal(failedJob.status, "failed");
  assert.equal(failedJob.attempts, 1);
  assert.match(String((failedJob.error as JsonRecord).message), /missing-codex|ENOENT|spawn/i);
});

test("Stop hook skips knowledge finalizer child threads to prevent recursion", () => {
  const root = createFixture("hook-stop-recursion");
  runClaw(["init", "--name", "Hook Stop Project"], root);
  const sessionId = "thread-stop-finalizer";
  const env = { CODEX_THREAD_ID: sessionId, CLAW_KNOWLEDGE_FINALIZER: "1" };
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Skip recursive hook"], root, env);
  const transcriptPath = path.join(root, "thread.jsonl");
  fs.writeFileSync(transcriptPath, JSON.stringify({
    type: "response_item",
    payload: {
      type: "message",
      role: "assistant",
      phase: "final_answer",
      content: [{ type: "output_text", text: "Do not capture" }],
    },
  }), "utf-8");
  const result = runClawHook("auto-doc", root, {
    session_id: sessionId,
    turn_id: "turn-finalizer",
    transcript_path: transcriptPath,
    cwd: root,
  }, env);
  assert.equal(result.status, 0);
  assert.equal(fs.existsSync(taskFile(root, "demo-task", "plan.report")), false);

});

test("opencode finalizer environment drops the parent platform session identity", () => {
  const env = opencodeKnowledgeFinalizerEnvironment({
    CODEX_THREAD_ID: "parent-codex-thread",
    CODEX_SESSION_ID: "parent-opencode-session",
    CLAW_SESSION_ID: "parent-claw-session",
    PATH: "preserved",
  });
  assert.equal(env.CODEX_THREAD_ID, undefined);
  assert.equal(env.CODEX_SESSION_ID, undefined);
  assert.equal(env.CLAW_KNOWLEDGE_FINALIZER, "1");
  assert.equal(env.CLAW_SESSION_ID, undefined);
  assert.equal(env.PATH, "preserved");
});

test("knowledge wait remains a compatibility path while the internal delegate template owns session scope", () => {
  const root = createFixture("knowledge-session-lifecycle");
  const runtimeDir = createFixture("knowledge-session-lifecycle-runtime");
  runClaw(["init", "--name", "Knowledge Session Lifecycle"], root);
  const taskDir = path.join(root, ".claw", "tasks", "source-task");
  fs.mkdirSync(taskDir, { recursive: true });
  const finalizeId = "a".repeat(64);
  const jobPath = path.join(taskDir, ".runtime", "knowledge-finalization", `${finalizeId}.json`);
  fs.mkdirSync(path.dirname(jobPath), { recursive: true });
  fs.writeFileSync(jobPath, JSON.stringify({
    schemaVersion: 1,
    finalizeId,
    sessionId: "owner-thread",
    projectRoot: root,
    taskName: "source-task",
    planPath: path.join(taskDir, "plan.json"),
    reportPath: path.join(taskDir, "plan.report"),
    status: "queued",
    attempts: 0,
    queuedAt: new Date().toISOString(),
  }), "utf-8");
  const env = {
    CLAW_SESSION_ID: "knowledge-executor",
    CLAW_SESSION_RUNTIME_DIR: runtimeDir,
  };

  const waited = runClaw([
    "knowledge", "wait",
    "--project-root", root,
    "--finalize-id", finalizeId,
    "--timeout-ms", "0",
  ], root, env);
  assert.equal(waited.status, "queued");
  assert.equal(waited.jobPath, jobPath);
  assert.equal("executorSessionId" in waited, false);

  const internalTemplate = path.resolve(thisDir, "..", "..", "core", "dist", "src", "resources", "delegate-writer", "TEMPLATE.json");
  runClaw([
    "plan", "create",
    "--title", "dynamic-writer-plan",
    "--template-file", internalTemplate,
  ], root, env);
  const dynamicContext = runClaw(["context"], root, env);
  assert.equal((dynamicContext.project as JsonRecord).scope, "session");
  assert.equal(fs.existsSync(path.join(root, ".claw", "tasks", "dynamic-writer-plan")), false);
  const sessionFinalizeId = "b".repeat(64);
  const sessionTaskDir = path.dirname(
    String((dynamicContext.activeWorkflow as JsonRecord).planPath),
  );
  const sessionJobPath = path.join(
    sessionTaskDir,
    ".runtime",
    "knowledge-finalization",
    `${sessionFinalizeId}.json`,
  );
  fs.mkdirSync(path.dirname(sessionJobPath), { recursive: true });
  fs.writeFileSync(sessionJobPath, JSON.stringify({
    schemaVersion: 1,
    finalizeId: sessionFinalizeId,
    sessionId: "knowledge-executor",
    projectRoot: root,
    taskName: "dynamic-writer-plan",
    planPath: path.join(sessionTaskDir, "plan.json"),
    reportPath: path.join(sessionTaskDir, "plan.report"),
    host: "cindy",
    status: "running",
    attempts: 1,
    claimToken: "persisted-claim",
    queuedAt: new Date().toISOString(),
  }), "utf-8");
  const recovered = runClaw([
    "knowledge", "wait",
    "--project-root", root,
    "--session-key", "knowledge-executor",
    "--finalize-id", sessionFinalizeId,
    "--timeout-ms", "0",
  ], root, env);
  assert.equal(recovered.jobPath, sessionJobPath);
  assert.equal(recovered.status, "running");
  const recoveredDone = runClaw([
    "internal-knowledge-complete",
    "--job", sessionJobPath,
    "--result", "Recovered after worker restart.",
  ], root, env);
  assert.equal(recoveredDone.completed, true);
  assert.equal((JSON.parse(fs.readFileSync(sessionJobPath, "utf-8")) as JsonRecord).status, "succeeded");
  runClaw(["task", "done", "--id", "1"], root, env);

  const claimed = runClaw(["knowledge", "claim", "--job", jobPath], root, env);
  assert.equal(claimed.claimed, true);
  assert.ok(typeof claimed.claimToken === "string");
  assert.equal(Array.isArray(claimed.assignments), true);
  assert.ok(typeof claimed.templatePath === "string");
  runClaw([
    "subplan", "create",
    "--parent", "dynamic-writer-plan",
    "--task-id", "2",
    "--template-file", String(claimed.templatePath),
  ], root, env);
  for (const taskId of ["1", "2", "3", "4", "5", "6"]) {
    runClaw(["task", "done", "--id", taskId], root, env);
  }
  runClaw(["plan", "done", "--retrospective", "Assignments executed."], root, env);
  const done = runClaw([
    "knowledge", "done",
    "--job", jobPath,
    "--claim-token", String(claimed.claimToken),
    "--status", "failed",
    "--error", "intentional test failure",
  ], root, env);
  assert.equal(done.failed, true);
  runClaw(["task", "done", "--id", "3"], root, env);
  runClaw(["plan", "done", "--retrospective", "Delegate lifecycle completed."], root, env);
  assert.equal((JSON.parse(fs.readFileSync(jobPath, "utf-8")) as JsonRecord).status, "failed");
  assert.equal(fs.existsSync(String(claimed.templatePath)), false);
});

test("Cindy turn capture keeps session workflows outside knowledge finalization", () => {
  const root = createFixture("cindy-session-capture");
  const runtimeDir = createFixture("cindy-session-capture-runtime");
  const sessionId = `cindy-capture-${path.basename(runtimeDir)}`;
  const env = { CLAW_SESSION_ID: sessionId, CLAW_SESSION_RUNTIME_DIR: runtimeDir };
  runClaw(["init", "--name", "Cindy Session Capture", "--planning", "false"], root);
  const created = runClaw([
    "plan", "create",
    "--scope", "session",
    "--title", "session-capture-plan",
    "--goal", "Capture the terminal turn",
    "--host", "cindy",
  ], root, env);
  runClaw(["task", "done", "--id", "1", "--host", "cindy"], root, env);
  runClaw([
    "plan", "done",
    "--retrospective", "Session work completed.",
    "--host", "cindy",
  ], root, env);
  const previousRuntimeDir = process.env.CLAW_SESSION_RUNTIME_DIR;
  process.env.CLAW_SESSION_RUNTIME_DIR = runtimeDir;
  try {
    const sessionProject = resolveSessionWorkflowContext(sessionId);
    assert.ok(sessionProject);
    assert.equal(tryEndKnowledgePlan({
      project: sessionProject,
      sessionId,
      endedPlanPath: String(created.planPath),
      endedAt: new Date().toISOString(),
    }).ok, true);
  } finally {
    if (previousRuntimeDir === undefined) delete process.env.CLAW_SESSION_RUNTIME_DIR;
    else process.env.CLAW_SESSION_RUNTIME_DIR = previousRuntimeDir;
  }
  const captured = runClaw(
    ["internal-knowledge-capture", "--host", "cindy"],
    root,
    env,
    JSON.stringify({
      cwd: root,
      session_id: sessionId,
      turn_id: "assistant-final",
      message: "Implemented and verified the session workflow.",
      task_conclusions: [],
    }),
  );
  assert.equal(captured.captured, false, JSON.stringify(captured));
  assert.equal("jobPath" in captured, false);
  assert.equal("finalizeId" in captured, false);
});

test("background finalizer never claims a subagent-policy job", () => {
  const root = createFixture("knowledge-subagent-policy-isolation");
  runClaw(["init", "--name", "Subagent Policy Isolation"], root);
  const taskDir = path.join(root, ".claw", "tasks", "source-task");
  const jobPath = path.join(taskDir, ".runtime", "knowledge-finalization", "subagent.json");
  fs.mkdirSync(path.dirname(jobPath), { recursive: true });
  fs.writeFileSync(jobPath, JSON.stringify({
    schemaVersion: 1,
    finalizeId: "subagent-policy",
    sessionId: "owner-thread",
    projectRoot: root,
    taskName: "source-task",
    host: "codex",
    planPath: path.join(taskDir, "plan.json"),
    reportPath: path.join(taskDir, "plan.report"),
    writer: { executionPolicy: "subagent", externalSkills: [] },
    status: "queued",
    attempts: 0,
    queuedAt: new Date().toISOString(),
  }), "utf-8");

  const finalized = runClawRaw(["internal-knowledge-finalize", "--job", jobPath], root, {
    CLAW_CODEX_PATH_OVERRIDE: path.join(root, "must-not-launch.exe"),
  });
  assert.equal(finalized.status, 0);
  const job = JSON.parse(fs.readFileSync(jobPath, "utf-8")) as JsonRecord;
  assert.equal(job.status, "queued");
  assert.equal(job.attempts, 0);
  assert.equal(job.claimToken, undefined);
});

test("background knowledge finalization uses one internal delegate bootstrap and requires terminal acknowledgement", async () => {
  const root = createFixture("knowledge-writer-no-op");
  const home = path.join(root, "home");
  const taskDir = path.join(root, ".claw", "tasks", "no-op-task");
  runClaw(["init", "--name", "Knowledge Writer No-op"], root, { HOME: home, USERPROFILE: home });
  fs.mkdirSync(taskDir, { recursive: true });
  const planPath = path.join(taskDir, "plan.json");
  const reportPath = path.join(taskDir, "plan.report");
  fs.writeFileSync(planPath, JSON.stringify({ title: "No-op", status: "end.completed" }), "utf-8");
  fs.writeFileSync(reportPath, "{}\n", "utf-8");

  const sdkRoot = path.join(
    home, ".claw-kit", "codex-runtime", CODEX_SDK_VERSION,
    "node_modules", "@openai", "codex-sdk",
  );
  fs.mkdirSync(path.join(sdkRoot, "dist"), { recursive: true });
  fs.writeFileSync(path.join(sdkRoot, "package.json"), JSON.stringify({ type: "module" }), "utf-8");
  const promptLog = path.join(root, "writer-prompts.log");
  const optionsLog = path.join(root, "writer-options.json");
  const sessionRuntimeDir = path.join(root, "session-runtime");
  const knowledgePath = path.join(root, ".claw", "truth", "features", "custom-writer.md");
  const customKnowledge = [
    "# Custom writer", "",
    "<!-- state: history -->", "## Evolution", "",
    "<!-- dated: 2026-07-20 -->", "### First", "", "First state.", "",
    "<!-- dated: 2026-07-20 -->", "### Second", "", "Second state.", "",
    "<!-- dated: 2026-07-20 -->", "### Third", "", "Third state.", "",
    "<!-- dated: 2026-07-20 -->", "### Fourth", "", "Fourth state.", "",
  ].join("\n");
  fs.writeFileSync(
    path.join(sdkRoot, "dist", "index.js"),
    `import fs from "node:fs";\nimport path from "node:path";\nexport class Codex { startThread(options) { fs.writeFileSync(${JSON.stringify(optionsLog)}, JSON.stringify(options)); return { id: "thread-knowledge", run: async (prompt) => { fs.appendFileSync(${JSON.stringify(promptLog)}, prompt + "\\n---PASS---\\n"); fs.mkdirSync(path.dirname(${JSON.stringify(knowledgePath)}), { recursive: true }); fs.writeFileSync(${JSON.stringify(knowledgePath)}, ${JSON.stringify(customKnowledge)}, "utf-8"); return { finalResponse: "Custom knowledge updated." }; } }; } }\n`,
    "utf-8",
  );

  const jobsDir = path.join(taskDir, ".runtime", "knowledge-finalization");
  fs.mkdirSync(jobsDir, { recursive: true });
  const jobPath = path.join(jobsDir, "no-op.json");
  fs.writeFileSync(jobPath, JSON.stringify({
    schemaVersion: 1,
    finalizeId: "no-op",
    sessionId: "thread-no-op",
    projectRoot: root,
    taskName: "no-op-task",
    host: "codex",
    planPath,
    reportPath,
    writer: {
      externalSkills: ["team:truth-writer", "team:adr-writer"],
      model: null,
      reasoningEffort: "medium",
      datedSectionsToKeep: 2,
    },
    status: "queued",
    attempts: 0,
    queuedAt: new Date().toISOString(),
  }), "utf-8");

  runGit(["init"], root);
  runGit(["config", "user.name", "Claw Test"], root);
  runGit(["config", "user.email", "claw@example.test"], root);
  runGit(["add", "."], root);
  runGit(["commit", "-m", "baseline"], root);

  const finalized = runClawRaw(["internal-knowledge-finalize", "--job", jobPath], root, {
    HOME: home,
    USERPROFILE: home,
    CLAW_SESSION_RUNTIME_DIR: path.join(root, "session-runtime"),
    CLAW_KNOWLEDGE_FINALIZER_DISABLE_RETRY: "1",
    CLAW_EMBEDDING_PERSISTENT_WORKER: "0",
  });
  assert.equal(finalized.status, 0);
  const job = JSON.parse(fs.readFileSync(jobPath, "utf-8")) as JsonRecord;
  assert.equal(job.status, "failed");
  assert.equal(job.sdkThreadId, undefined);
  assert.equal(job.sdkThreadIds, undefined);
  assert.equal(job.truthThreadId, undefined);
  assert.equal(job.adrThreadId, undefined);
  assert.equal(job.finalResponse, undefined);
  assert.equal(job.knowledgeGovernance, undefined);
  assert.equal(runGit(["log", "-1", "--pretty=%B"], root).trim(), "baseline");
  assert.match(runGit(["status", "--short", "--", knowledgePath], root), /\?\?/u);
  const knowledge = fs.readFileSync(knowledgePath, "utf-8");
  assert.match(knowledge, /First state/u);
  assert.match(knowledge, /Second state/u);
  assert.match(knowledge, /Third state/u);
  assert.match(knowledge, /Fourth state/u);
  const prompts = fs.readFileSync(promptLog, "utf-8").split("---PASS---").filter((item) => item.trim());
  assert.equal(prompts.length, 1);
  for (const prompt of prompts) {
    assert.match(prompt, /claw plan create --template-file/i);
    assert.match(prompt, /internal session plan/i);
    assert.doesNotMatch(prompt, /claw-kit:delegate-writer/i);
    assert.doesNotMatch(prompt, /team:truth-writer|team:adr-writer/i);
  }
  const writerOptions = JSON.parse(fs.readFileSync(optionsLog, "utf-8")) as JsonRecord;
  assert.equal(writerOptions.sandboxMode, process.platform === "win32" ? "danger-full-access" : "workspace-write");
  assert.equal(fs.existsSync(reportPath), true);
  const reportEntries = fs.readFileSync(reportPath, "utf-8").trim().split(/\r?\n/).map((line) => JSON.parse(line) as JsonRecord);
  assert.equal(reportEntries.length, 1);
  const repeated = runClawRaw(["internal-knowledge-finalize", "--job", jobPath], root, {
    HOME: home,
    USERPROFILE: home,
    CLAW_SESSION_RUNTIME_DIR: sessionRuntimeDir,
    CLAW_KNOWLEDGE_FINALIZER_DISABLE_RETRY: "1",
    CLAW_EMBEDDING_PERSISTENT_WORKER: "0",
  });
  assert.equal(repeated.status, 0);
  assert.equal(fs.readFileSync(reportPath, "utf-8").trim().split(/\r?\n/).length, 1);

  const uncommittedTaskDir = path.join(root, ".claw", "tasks", "uncommitted-task");
  const uncommittedPlanPath = path.join(uncommittedTaskDir, "plan.json");
  const uncommittedReportPath = path.join(uncommittedTaskDir, "plan.report");
  const uncommittedKnowledgePath = path.join(root, ".claw", "truth", "features", "uncommitted-writer.md");
  fs.mkdirSync(uncommittedTaskDir, { recursive: true });
  fs.writeFileSync(uncommittedPlanPath, JSON.stringify({ title: "Uncommitted", status: "end.completed" }), "utf-8");
  fs.writeFileSync(uncommittedReportPath, "{}\n", "utf-8");
  fs.writeFileSync(
    path.join(sdkRoot, "dist", "index.js"),
    `import fs from "node:fs";\nimport path from "node:path";\nimport { createHash } from "node:crypto";\nexport class Codex { startThread() { return { id: "thread-uncommitted", run: async () => { fs.mkdirSync(path.dirname(${JSON.stringify(uncommittedKnowledgePath)}), { recursive: true }); fs.writeFileSync(${JSON.stringify(uncommittedKnowledgePath)}, "# Uncommitted knowledge\\n", "utf-8"); const digest = createHash("sha256").update("thread-uncommitted").digest("hex"); const workflowDir = path.join(process.env.CLAW_SESSION_RUNTIME_DIR, digest); const taskDir = path.join(workflowDir, "tasks", "custom-writer-run"); fs.mkdirSync(taskDir, { recursive: true }); fs.writeFileSync(path.join(workflowDir, "session.json"), JSON.stringify({ version: 1, scope: "session", originCwd: ${JSON.stringify(root)}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })); fs.writeFileSync(path.join(taskDir, "plan.json"), JSON.stringify({ title: "custom writer", status: "end.completed", tasks: [{ id: 1, status: "done" }] })); return { finalResponse: "Uncommitted knowledge updated." }; } }; } }\n`,
    "utf-8",
  );
  const uncommittedJobsDir = path.join(uncommittedTaskDir, ".runtime", "knowledge-finalization");
  fs.mkdirSync(uncommittedJobsDir, { recursive: true });
  const uncommittedJobPath = path.join(uncommittedJobsDir, "uncommitted.json");
  fs.writeFileSync(uncommittedJobPath, JSON.stringify({
    schemaVersion: 1,
    finalizeId: "uncommitted",
    sessionId: "thread-uncommitted-owner",
    projectRoot: root,
    taskName: "uncommitted-task",
    host: "codex",
    planPath: uncommittedPlanPath,
    reportPath: uncommittedReportPath,
    writer: {
      externalSkills: ["team:custom-knowledge-writer"],
      model: null,
      reasoningEffort: "medium",
      datedSectionsToKeep: 2,
    },
    status: "queued",
    attempts: 0,
    queuedAt: new Date().toISOString(),
  }), "utf-8");
  const headBeforeDisabledFinalization = runGit(["rev-parse", "HEAD"], root).trim();

  const uncommittedFinalized = runClawRaw(["internal-knowledge-finalize", "--job", uncommittedJobPath], root, {
    HOME: home,
    USERPROFILE: home,
    CLAW_SESSION_RUNTIME_DIR: sessionRuntimeDir,
    CLAW_KNOWLEDGE_FINALIZER_DISABLE_RETRY: "1",
    CLAW_EMBEDDING_PERSISTENT_WORKER: "0",
  });
  assert.equal(uncommittedFinalized.status, 0);
  const uncommittedJob = JSON.parse(fs.readFileSync(uncommittedJobPath, "utf-8")) as JsonRecord;
  assert.equal(uncommittedJob.status, "failed");
  assert.equal(uncommittedJob.finalResponse, undefined);
  assert.equal(runGit(["rev-parse", "HEAD"], root).trim(), headBeforeDisabledFinalization);
  assert.equal(fs.readFileSync(uncommittedKnowledgePath, "utf-8"), "# Uncommitted knowledge\n");
  assert.match(runGit(["status", "--short", "--", uncommittedKnowledgePath], root), /\?\?/u);
  const uncommittedReportEntries = fs.readFileSync(uncommittedReportPath, "utf-8").trim().split(/\r?\n/);
  assert.equal(uncommittedReportEntries.length, 1);
});

test("background delegate failure does not post-process unacknowledged writer output", async () => {
  const root = createFixture("knowledge-writer-retention");
  const home = path.join(root, "home");
  const taskDir = path.join(root, ".claw", "tasks", "retention-task");
  runClaw(["init", "--name", "Knowledge Writer Retention"], root, { HOME: home, USERPROFILE: home });
  fs.mkdirSync(taskDir, { recursive: true });
  const planPath = path.join(taskDir, "plan.json");
  const reportPath = path.join(taskDir, "plan.report");
  fs.writeFileSync(planPath, JSON.stringify({ title: "Retention", status: "end.completed" }), "utf-8");
  fs.writeFileSync(reportPath, "{}\n", "utf-8");

  const sdkRoot = path.join(
    home, ".claw-kit", "codex-runtime", CODEX_SDK_VERSION,
    "node_modules", "@openai", "codex-sdk",
  );
  fs.mkdirSync(path.join(sdkRoot, "dist"), { recursive: true });
  fs.writeFileSync(path.join(sdkRoot, "package.json"), JSON.stringify({ type: "module" }), "utf-8");
  const knowledgePath = path.join(root, ".claw", "truth", "features", "evolving.md");
  const writtenKnowledge = [
    "# Evolving", "",
    "<!-- state: current -->", "## Current", "", "Current behavior remains intact.", "",
    "<!-- state: history -->", "## Evolution", "",
    "<!-- dated: 2026-07-20 -->", "### First", "", "First historical state.", "",
    "<!-- dated: 2026-07-20 -->", "### Second", "", "Second historical state.", "",
    "<!-- dated: 2026-07-20 -->", "### Third", "", "Third historical state.", "",
    "<!-- dated: 2026-07-20 -->", "### Fourth", "", "Fourth historical state.", "",
  ].join("\n");
  fs.writeFileSync(
    path.join(sdkRoot, "dist", "index.js"),
    `import fs from "node:fs";\nimport path from "node:path";\nimport { createHash } from "node:crypto";\nexport class Codex { constructor(options) { this.env = options.env; } startThread() { const env = this.env; return { id: "thread-retention", run: async () => { fs.mkdirSync(path.dirname(${JSON.stringify(knowledgePath)}), { recursive: true }); fs.writeFileSync(${JSON.stringify(knowledgePath)}, ${JSON.stringify(writtenKnowledge)}, "utf-8"); const digest = createHash("sha256").update(env.CLAW_SESSION_ID).digest("hex"); const workflowDir = path.join(env.CLAW_SESSION_RUNTIME_DIR, digest); const workflowTaskDir = path.join(workflowDir, "tasks", "knowledge-writer"); fs.mkdirSync(workflowTaskDir, { recursive: true }); fs.writeFileSync(path.join(workflowDir, "session.json"), JSON.stringify({ version: 1, scope: "session", originCwd: ${JSON.stringify(root)}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })); fs.writeFileSync(path.join(workflowTaskDir, "plan.json"), JSON.stringify({ title: "knowledge-writer", templateId: "knowledge-writer", status: "end.completed", tasks: [{ id: 1, status: "done" }] })); return { finalResponse: "Knowledge updated." }; } }; } }\n`,
    "utf-8",
  );

  const jobsDir = path.join(taskDir, ".runtime", "knowledge-finalization");
  fs.mkdirSync(jobsDir, { recursive: true });
  const jobPath = path.join(jobsDir, "retention.json");
  fs.writeFileSync(jobPath, JSON.stringify({
    schemaVersion: 1,
    finalizeId: "retention",
    sessionId: "thread-retention-owner",
    projectRoot: root,
    taskName: "retention-task",
    host: "codex",
    planPath,
    reportPath,
    writer: { datedSectionsToKeep: 2 },
    status: "queued",
    attempts: 0,
    queuedAt: new Date().toISOString(),
  }), "utf-8");

  const finalized = runClawRaw(["internal-knowledge-finalize", "--job", jobPath], root, {
    HOME: home,
    USERPROFILE: home,
    CLAW_SESSION_RUNTIME_DIR: path.join(root, "session-runtime"),
    CLAW_KNOWLEDGE_FINALIZER_DISABLE_RETRY: "1",
    CLAW_EMBEDDING_PERSISTENT_WORKER: "0",
  });
  assert.equal(finalized.status, 0);
  const content = fs.readFileSync(knowledgePath, "utf-8");
  assert.match(content, /Current behavior remains intact/u);
  assert.match(content, /First historical state/u);
  assert.match(content, /Second historical state/u);
  assert.match(content, /Third historical state/u);
  assert.match(content, /Fourth historical state/u);

  const job = JSON.parse(fs.readFileSync(jobPath, "utf-8")) as JsonRecord;
  assert.equal(job.status, "failed");
  assert.equal(job.knowledgeGovernance, undefined);
});

test("knowledge finalization fails and retains its report when the SDK writer does not complete a session workflow", () => {
  const root = createFixture("knowledge-writer-incomplete-session");
  const home = path.join(root, "home");
  const taskDir = path.join(root, ".claw", "tasks", "incomplete-session-task");
  runClaw(["init", "--name", "Knowledge Writer Incomplete Session"], root, { HOME: home, USERPROFILE: home });
  fs.mkdirSync(taskDir, { recursive: true });
  const planPath = path.join(taskDir, "plan.json");
  const reportPath = path.join(taskDir, "plan.report");
  fs.writeFileSync(planPath, JSON.stringify({ title: "Incomplete session", status: "end.completed" }), "utf-8");
  fs.writeFileSync(reportPath, "{}\n", "utf-8");

  const sdkRoot = path.join(
    home, ".claw-kit", "codex-runtime", CODEX_SDK_VERSION,
    "node_modules", "@openai", "codex-sdk",
  );
  fs.mkdirSync(path.join(sdkRoot, "dist"), { recursive: true });
  fs.writeFileSync(path.join(sdkRoot, "package.json"), JSON.stringify({ type: "module" }), "utf-8");
  const promptLog = path.join(root, "built-in-writer-prompt.log");
  fs.writeFileSync(
    path.join(sdkRoot, "dist", "index.js"),
    `import fs from "node:fs";\nexport class Codex { startThread() { return { id: "thread-incomplete", run: async (prompt) => { fs.writeFileSync(${JSON.stringify(promptLog)}, prompt, "utf-8"); return { finalResponse: "Could not read the inputs." }; } }; } }\n`,
    "utf-8",
  );

  const jobsDir = path.join(taskDir, ".runtime", "knowledge-finalization");
  fs.mkdirSync(jobsDir, { recursive: true });
  const jobPath = path.join(jobsDir, "incomplete-session.json");
  fs.writeFileSync(jobPath, JSON.stringify({
    schemaVersion: 1,
    finalizeId: "incomplete-session",
    sessionId: "thread-incomplete-owner",
    projectRoot: root,
    taskName: "incomplete-session-task",
    host: "codex",
    planPath,
    reportPath,
    status: "queued",
    attempts: 0,
    queuedAt: new Date().toISOString(),
  }), "utf-8");

  const finalized = runClawRaw(["internal-knowledge-finalize", "--job", jobPath], root, {
    HOME: home,
    USERPROFILE: home,
    CLAW_SESSION_RUNTIME_DIR: path.join(root, "session-runtime"),
    CLAW_KNOWLEDGE_FINALIZER_DISABLE_RETRY: "1",
  });
  assert.equal(finalized.status, 0);
  const job = JSON.parse(fs.readFileSync(jobPath, "utf-8")) as JsonRecord;
  assert.equal(job.status, "failed");
  assert.match(String((job.error as JsonRecord).message), /without acknowledging a terminal result/i);
  const builtInPrompt = fs.readFileSync(promptLog, "utf-8");
  assert.match(builtInPrompt, /claw plan create --template-file/i);
  assert.match(builtInPrompt, /internal session plan/i);
  assert.doesNotMatch(builtInPrompt, /claw-kit:knowledge-writer|claw-kit:delegate-writer/i);
  assert.equal(fs.existsSync(reportPath), true);
});

test("opencode Stop hook captures inline message payload and writes host to job", () => {
  const root = createFixture("hook-stop-opencode-message");
  const sessionId = "thread-opencode-message";
  const env = { CLAW_HOST: "opencode", CODEX_THREAD_ID: sessionId, CLAW_KNOWLEDGE_FINALIZER_DISABLE_LAUNCH: "1" };
  runClaw(["init", "--name", "OpenCode Message", "--planning", "false"], root, env);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Capture inline message"], root, env);
  const registriesDir = path.join(root, ".claw", "runtime", "knowledge-sessions");
  const registryFiles = fs.readdirSync(registriesDir).filter((name) => name.endsWith(".json"));
  assert.equal(registryFiles.length, 1);
  const registry = JSON.parse(fs.readFileSync(path.join(registriesDir, registryFiles[0]!), "utf-8")) as JsonRecord;
  assert.equal("host" in registry, false);
  runClaw(["task", "done", "--id", "1"], root, env);
  runClaw(["plan", "done", "--retrospective", "Done."], root, env);

  const stop = runClawHook("auto-doc", root, {
    session_id: sessionId,
    turn_id: "turn-opencode-message",
    message: "Inline opencode turn report message.",
    cwd: root,
  }, env);
  assert.equal(stop.status, 0);
  assert.equal(stop.stdout.trim(), "");
  const reportPath = taskFile(root, "demo-task", "plan.report");
  const entry = JSON.parse(fs.readFileSync(reportPath, "utf-8").trim()) as { message: string; turnId: string };
  assert.equal(entry.message, "Inline opencode turn report message.");
  assert.equal(entry.turnId, "turn-opencode-message");

  const jobsDir = taskFinalizerJobsDirectory(root, "demo-task");
  const jobFiles = fs.readdirSync(jobsDir).filter((name) => name.endsWith(".json"));
  assert.equal(jobFiles.length, 1);
  const job = JSON.parse(fs.readFileSync(path.join(jobsDir, jobFiles[0]!), "utf-8")) as JsonRecord;
  assert.equal(job.host, "opencode");
  assert.equal(job.status, "queued");
});
