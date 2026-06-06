import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildMemoryIndex,
  ensureProjectProtocol,
  editPlan,
  enforceTaskRetention,
  getMemory,
  ingestTruth,
  initProject,
  resolveContext,
  searchMemory,
  showPlan,
  switchTask,
  writePlan,
} from "../src/index.js";

function createFixture(name: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `claw-kit-${name}-`));
  fs.mkdirSync(path.join(root, ".claw", "truth"), { recursive: true });
  return root;
}

function createEmptyFixture(name: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `claw-kit-${name}-`));
}

test("context resolves nested cwd to project .claw", () => {
  const root = createFixture("context");
  fs.mkdirSync(path.join(root, "src", "nested"), { recursive: true });
  fs.writeFileSync(path.join(root, ".claw", "project.json"), JSON.stringify({ id: "demo-project" }, null, 2));

  const result = resolveContext(path.join(root, "src", "nested"));

  assert.equal(result.project.projectRoot, root);
  assert.equal(result.project.projectId, "demo-project");
});

test("initProject creates a minimal .claw project scaffold", () => {
  const root = createEmptyFixture("init");

  const result = initProject({
    cwd: root,
    projectName: "Demo Project",
    autoAchieveTask: false,
    maxTasksToKeep: 20,
    contextPaths: ["docs/project-guide.md"],
    externalDocPaths: ["docs/", "README.md"],
    gitnexusEnabled: true,
  });
  const projectConfig = JSON.parse(
    fs.readFileSync(path.join(root, ".claw", "project.json"), "utf-8"),
  ) as {
    id: string;
    name: string;
    autoAchieveTask: boolean;
    maxTasksToKeep: number;
    contextPaths: string[];
    memory: { externalDocPaths: string[] };
    gitnexus: { enabled: boolean };
  };

  assert.equal(result.projectId, "demo-project");
  assert.ok(fs.existsSync(path.join(root, ".claw", "project.json")));
  assert.ok(fs.existsSync(path.join(root, ".claw", "memory.md")));
  assert.ok(fs.existsSync(path.join(root, ".claw", "truth", "SUMMARY.md")));
  assert.ok(fs.existsSync(path.join(root, ".claw", "tasks")));
  assert.deepEqual(projectConfig, {
    id: "demo-project",
    name: "Demo Project",
    autoAchieveTask: false,
    maxTasksToKeep: 20,
    contextPaths: ["docs/project-guide.md"],
    memory: {
      externalDocPaths: ["docs/", "README.md"],
    },
    gitnexus: {
      enabled: true,
    },
  });
});

test("plan write creates task-bound plan and updates activePlan", async () => {
  const root = createFixture("plan-write");

  const result = await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Ship the first plan",
  });

  const meta = JSON.parse(fs.readFileSync(result.metaPath, "utf-8")) as { activePlan: string };
  assert.equal(result.planFile, "plan.json");
  assert.equal(meta.activePlan, "plan.json");
  assert.ok(fs.existsSync(result.planPath));
  assert.equal(result.workflowGuidance.stage, "requirements");
  assert.equal(result.workflowGuidance.delegateSubagents, undefined);
  assert.equal(result.planView.collapsedSummary, "0/0 Demo task");
  assert.equal(result.planView.goal.defaultCollapsed, true);
  assert.equal(result.planView.renderHints.defaultCollapsed, true);
  assert.equal(result.planView.expanded.sections[0]?.id, "goal");
  assert.equal(result.planView.expanded.sections[0]?.defaultExpanded, false);
  assert.equal(result.planView.expanded.sections[1]?.id, "tasks");
});

test("plan write updates existing task and supports subplan under plans without switching task scope", async () => {
  const root = createFixture("subplan-write");
  await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Ship the parent plan",
    content: {
      title: "Demo task",
      status: "process.active",
      goal: { text: "Ship the parent plan" },
      tasks: [
        {
          id: 1,
          title: "Implement child work",
          status: "pending",
        },
      ],
    },
  });

  const result = await writePlan({
    cwd: root,
    taskName: "demo-task",
    filePath: "child-plan.json",
    parentTaskId: 1,
    title: "Child plan",
    goalText: "Handle a subplan",
    content: {
      title: "Child plan",
      status: "prepare.requirements",
      goal: { text: "Handle a subplan" },
      tasks: [],
    },
  });

  const meta = JSON.parse(
    fs.readFileSync(path.join(root, ".claw", "tasks", "demo-task", "meta.json"), "utf-8"),
  ) as { activePlan: string };
  const parentPlan = JSON.parse(
    fs.readFileSync(path.join(root, ".claw", "tasks", "demo-task", "plan.json"), "utf-8"),
  ) as { tasks: Array<{ execution?: { type?: string; subplan?: string } }> };

  assert.equal(result.planFile, "plans/child-plan.json");
  assert.equal(meta.activePlan, "plans/child-plan.json");
  assert.equal(parentPlan.tasks[0]?.execution?.type, "subplan");
  assert.equal(parentPlan.tasks[0]?.execution?.subplan, "plans/child-plan.json");
});

test("plan write no longer runs a separate review gate before execution", async () => {
  const root = createFixture("plan-write-review");

  const result = await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Ship work directly",
    planStatus: "process.active",
  });

  assert.equal(result.planStatus, "process.active");
  assert.equal(result.planReview, undefined);
});

test("plan edit enforces two-part transition rules", async () => {
  const root = createFixture("plan-edit-transition");
  await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Ship the first plan",
    content: {
      title: "Demo task",
      status: "process.active",
      goal: { text: "Ship the first plan" },
      tasks: [],
    },
  });

  await assert.rejects(
    () =>
      editPlan({
        cwd: root,
        taskName: "demo-task",
        planStatus: "prepare.requirements",
      }),
    /Cannot move from process\.\* back to prepare\.\*/,
  );
});

test("plan edit requires retrospective summary before end.completed", async () => {
  const root = createFixture("plan-edit-retrospective");
  await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Ship the first plan",
  });

  await assert.rejects(
    () =>
      editPlan({
        cwd: root,
        taskName: "demo-task",
        planStatus: "end.completed",
      }),
    /retrospective\.summary/,
  );
});

test("plan edit can move from requirements to process.active without a separate review gate", async () => {
  const root = createFixture("plan-edit-review");
  await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Ship the first plan",
    content: {
      title: "Demo task",
      status: "prepare.requirements",
      goal: { text: "Ship the first plan" },
      tasks: [],
    },
  });

  const result = await editPlan({
    cwd: root,
    taskName: "demo-task",
    planStatus: "process.active",
  });

  assert.equal(result.planStatus, "process.active");
  assert.equal(result.planReview, undefined);
  assert.equal(result.workflowGuidance.stage, "execution");
  assert.equal(result.workflowGuidance.delegateSubagents, undefined);
});

test("plan edit leaving legacy prepare.review goes directly into process.active", async () => {
  const root = createFixture("plan-edit-review-addressed");
  await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Ship the first plan",
    content: {
      title: "Demo task",
      status: "prepare.review",
      goal: { text: "Ship the first plan" },
      tasks: [],
    },
  });

  const result = await editPlan({
    cwd: root,
    taskName: "demo-task",
    planStatus: "process.active",
  });

  assert.equal(result.planStatus, "process.active");
  assert.equal(result.workflowGuidance.stage, "execution");
  assert.equal(result.workflowGuidance.askUser?.useCodexOptions, true);
  assert.equal(result.workflowGuidance.goalMode?.recommendedObjective, "Ship the first plan");
  assert.deepEqual(result.workflowGuidance.goalMode?.supportedSurfaces, ["/goal", "create_goal"]);
  assert.ok(result.workflowGuidance.notes?.some((note) => note.includes("thread progress")));
  assert.equal(result.planView.counts.completed, 0);
  assert.equal(result.planView.status, "process.active");
});

test("plan completion hooks fire only on first transition to end.completed", async () => {
  const root = createFixture("plan-completion-hooks");
  await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Ship the first plan",
    content: {
      title: "Demo task",
      status: "process.active",
      goal: { text: "Ship the first plan" },
      tasks: [],
      keyDecisions: ["Use task-bound plans as the durable source of truth."],
      references: [{ why: "source", path: "src/plan.ts" }],
      retrospective: { summary: "Worked well." },
    },
  });

  const first = await editPlan({
    cwd: root,
    taskName: "demo-task",
    planStatus: "end.completed",
  });
  const second = await editPlan({
    cwd: root,
    taskName: "demo-task",
    patch: { summary: "Post-completion note" },
  });

  assert.ok(first.completionHooks);
  assert.equal(first.completionHooks?.adrCandidate.shouldWriteAdr, true);
  assert.equal(first.completionHooks?.truthCandidate.suggestedTruthPaths[0], "SUMMARY.md");
  assert.equal(second.completionHooks, undefined);
  assert.equal(first.workflowGuidance.stage, "deposition");
  assert.equal(first.workflowGuidance.delegateSubagents?.[0]?.name, "adr-writer");
  assert.equal(first.workflowGuidance.delegateSubagents?.[0]?.waitForCompletion, false);
  assert.equal(first.workflowGuidance.delegateSubagents?.[0]?.preferReuseSameTypeInThread, true);
  assert.equal(first.workflowGuidance.delegateSubagents?.[0]?.closePolicy, "keep_open_for_reuse");
  assert.ok(first.workflowGuidance.notes?.some((note) => note.includes("plan.json")));
});

test("process plans with all tasks done guide the agent to claw plan done and deposition subagents", async () => {
  const root = createFixture("plan-done-guidance");
  await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Finish implementation",
    content: {
      title: "Demo task",
      status: "process.active",
      goal: { text: "Finish implementation" },
      tasks: [
        {
          id: 1,
          title: "Implement work",
          status: "in_progress",
        },
      ],
    },
  });

  const result = await editPlan({
    cwd: root,
    taskName: "demo-task",
    taskId: 1,
    taskStatus: "done",
  });

  assert.equal(result.planStatus, "process.active");
  assert.equal(result.workflowGuidance.stage, "done");
  assert.ok(result.workflowGuidance.recommendedCommands?.some((command) => command.includes("claw plan done")));
  assert.equal(result.workflowGuidance.delegateSubagents?.[0]?.name, "truth-writer");
  assert.equal(result.workflowGuidance.delegateSubagents?.[0]?.waitForCompletion, false);
  assert.equal(result.workflowGuidance.delegateSubagents?.[0]?.preferReuseSameTypeInThread, true);
  assert.equal(result.workflowGuidance.delegateSubagents?.[0]?.closePolicy, "keep_open_for_reuse");
  assert.ok(result.workflowGuidance.nextStep.includes("truth-writer"));
  assert.ok(result.workflowGuidance.nextStep.includes("retrospective"));
  assert.ok(result.workflowGuidance.notes?.some((note) => note.includes("thread progress")));
  assert.equal(result.planView.counts.completed, 1);
  assert.deepEqual(
    result.planView.tasks.items.map((task) => ({ id: task.id, status: task.status })),
    [{ id: 1, status: "done" }],
  );
});

test("plan view orders unfinished tasks before done tasks while preserving stable order", async () => {
  const root = createFixture("plan-view-order");
  await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Ordered task",
    goalText: "Check plan view ordering",
    content: {
      title: "Ordered task",
      status: "process.active",
      goal: { text: "Check plan view ordering" },
      tasks: [
        { id: 1, title: "Done first", status: "done" },
        { id: 2, title: "Pending second", status: "pending" },
        { id: 3, title: "Blocked third", status: "blocked" },
        { id: 4, title: "Done fourth", status: "done" },
      ],
    },
  });

  const result = await editPlan({
    cwd: root,
    taskName: "demo-task",
    patch: { summary: "No-op patch to inspect plan view" },
  });

  assert.equal(result.planView.collapsedSummary, "2/4 Ordered task");
  assert.deepEqual(
    result.planView.tasks.items.map((task) => task.id),
    [2, 3, 1, 4],
  );
});

test("plan show returns canonical plan plus collapsed and expanded plan view data", async () => {
  const root = createFixture("plan-show");
  await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Shown task",
    goalText: "Render the current plan",
    content: {
      title: "Shown task",
      status: "process.active",
      goal: { text: "Render the current plan" },
      tasks: [
        { id: 1, title: "First task", status: "done" },
        { id: 2, title: "Second task", status: "in_progress" },
      ],
    },
  });

  const result = showPlan({
    cwd: root,
    taskName: "demo-task",
  });

  assert.equal(result.plan.title, "Shown task");
  assert.equal(result.planView.collapsedSummary, "1/2 Shown task");
  assert.equal(result.planView.goal.text, "Render the current plan");
  assert.equal(result.planView.renderHints.defaultCollapsed, true);
  assert.deepEqual(
    result.planView.expanded.sections.map((section) => section.id),
    ["goal", "tasks"],
  );
  assert.equal(result.planView.expanded.sections[0]?.type, "disclosure");
  assert.equal(result.planView.expanded.sections[1]?.type, "list");
  assert.deepEqual(
    result.planView.tasks.items.map((task) => task.id),
    [2, 1],
  );
  assert.deepEqual(
    result.planView.expanded.sections[1]?.items.map((task) => task.id),
    [2, 1],
  );
});

test("switch-task writes lineage metadata without session runtime", async () => {
  const root = createFixture("switch-task");
  await writePlan({ cwd: root, taskName: "source-task", title: "Source", goalText: "Source goal" });
  await writePlan({ cwd: root, taskName: "target-task", title: "Target", goalText: "Target goal" });

  const result = switchTask({
    cwd: root,
    fromTask: "source-task",
    toTask: "target-task",
  });

  const sourceMeta = JSON.parse(fs.readFileSync(result.sourceMetaPath, "utf-8")) as { leaveState: { toTask: string } };
  const targetMeta = JSON.parse(fs.readFileSync(result.targetMetaPath, "utf-8")) as {
    previousTask: { task: string };
    inheritedFrom: { task: string };
  };
  assert.equal(sourceMeta.leaveState.toTask, "target-task");
  assert.equal(targetMeta.previousTask.task, "source-task");
  assert.equal(targetMeta.inheritedFrom.task, "source-task");
});

test("memory search defaults to project scope and task scope prioritizes active plan structured memory", async () => {
  const root = createFixture("memory-search");
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify(
      {
        id: "memory-search",
        memory: {
          externalDocPaths: ["docs/"],
        },
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, ".claw", "memory.md"), "project alpha memory\n", "utf-8");
  fs.writeFileSync(path.join(root, ".claw", "truth", "SUMMARY.md"), "shared beta truth\n", "utf-8");
  fs.writeFileSync(path.join(root, "docs", "guide.md"), "zeta external doc\n", "utf-8");
  await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Task title",
    goalText: "Task goal",
    content: {
      title: "Task title",
      status: "process.active",
      goal: { text: "Task goal" },
      tasks: [],
      rules: ["gamma rule"],
      references: [{ why: "delta proof", path: "src/index.ts" }],
    },
  });
  fs.writeFileSync(path.join(root, ".claw", "tasks", "demo-task", "memory.md"), "legacy epsilon task memory\n", "utf-8");

  const projectIndex = buildMemoryIndex({ cwd: root });
  const taskIndex = buildMemoryIndex({ cwd: root, scope: "task", taskName: "demo-task" });
  const projectSearch = searchMemory({ cwd: root, query: "alpha" });
  const externalSearch = searchMemory({ cwd: root, query: "zeta" });
  const taskSearch = searchMemory({ cwd: root, scope: "task", taskName: "demo-task", query: "gamma" });
  const taskMemory = getMemory({ cwd: root, scope: "task", taskName: "demo-task" });

  assert.equal(projectIndex.scope, "project");
  assert.equal(taskIndex.scope, "task");
  assert.ok(projectSearch.results.some((item) => item.sourcePath.endsWith(path.join(".claw", "memory.md"))));
  assert.ok(projectIndex.sources.some((item) => item.endsWith(path.join("docs", "guide.md"))));
  assert.ok(externalSearch.results.some((item) => item.sourcePath.endsWith(path.join("docs", "guide.md"))));
  assert.ok(taskSearch.results.some((item) => item.kind === "active_plan"));
  assert.equal(taskMemory.sources[0]?.kind, "active_plan");
});

test("truth ingest writes only under .claw/truth", () => {
  const root = createFixture("truth-ingest");

  const result = ingestTruth({
    cwd: root,
    target: "features/test-feature.md",
    content: "# Feature\n\nCanonical truth.\n",
  });

  assert.ok(result.targetPath.startsWith(path.join(root, ".claw", "truth")));
  assert.equal(fs.readFileSync(result.targetPath, "utf-8"), "# Feature\n\nCanonical truth.\n");
});

test("existing .claw project without project.json still works", async () => {
  const root = createFixture("legacy");
  await writePlan({
    cwd: root,
    taskName: "legacy-task",
    title: "Legacy task",
    goalText: "Remain compatible",
  });

  const result = resolveContext(root, "legacy-task");

  assert.equal(result.project.projectId, path.basename(root));
  assert.equal(result.task?.taskName, "legacy-task");
});

test("ensureProjectProtocol rewrites project.json into explicit canonical protocol fields", () => {
  const root = createFixture("project-check-fix");
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify(
      {
        id: "Fix Me",
        name: "Fix Me",
        maxTasksToKeep: 0,
        memory: {
          externalDocPaths: ["docs/", 123],
        },
      },
      null,
      2,
    ),
    "utf-8",
  );

  const result = ensureProjectProtocol(root);
  const projectConfig = JSON.parse(fs.readFileSync(result.projectJsonPath, "utf-8")) as {
    id: string;
    name: string;
    autoAchieveTask: boolean;
    maxTasksToKeep: number;
    contextPaths: string[];
    memory: { externalDocPaths: string[] };
    gitnexus: { enabled: boolean };
  };

  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.ok(result.issueCountBefore > 0);
  assert.ok(result.fixedPaths.includes("autoAchieveTask"));
  assert.equal(projectConfig.id, "fix-me");
  assert.equal(projectConfig.name, "Fix Me");
  assert.equal(projectConfig.autoAchieveTask, true);
  assert.equal(projectConfig.maxTasksToKeep, 99);
  assert.deepEqual(projectConfig.contextPaths, []);
  assert.deepEqual(projectConfig.memory.externalDocPaths, ["docs/"]);
  assert.equal(projectConfig.gitnexus.enabled, false);
});

test("enforceTaskRetention archives completed task and prunes archive by updatedAt", async () => {
  const root = createFixture("task-retention");
  initProject({
    cwd: root,
    projectName: "Retention Project",
    autoAchieveTask: true,
    maxTasksToKeep: 1,
    force: true,
  });
  await writePlan({
    cwd: root,
    taskName: "older-task",
    title: "Older task",
    goalText: "Archive older task",
    content: {
      title: "Older task",
      status: "end.completed",
      goal: { text: "Archive older task" },
      tasks: [],
      retrospective: { summary: "Older complete." },
    },
  });
  await writePlan({
    cwd: root,
    taskName: "newer-task",
    title: "Newer task",
    goalText: "Archive newer task",
    content: {
      title: "Newer task",
      status: "end.completed",
      goal: { text: "Archive newer task" },
      tasks: [],
      retrospective: { summary: "Newer complete." },
    },
  });

  const olderMetaPath = path.join(root, ".claw", "tasks", "older-task", "meta.json");
  const olderMeta = JSON.parse(fs.readFileSync(olderMetaPath, "utf-8")) as { updatedAt: string };
  olderMeta.updatedAt = "2026-01-01T00:00:00.000Z";
  fs.writeFileSync(olderMetaPath, `${JSON.stringify(olderMeta, null, 2)}\n`, "utf-8");

  const newerMetaPath = path.join(root, ".claw", "tasks", "newer-task", "meta.json");
  const newerMeta = JSON.parse(fs.readFileSync(newerMetaPath, "utf-8")) as { updatedAt: string };
  newerMeta.updatedAt = "2026-02-01T00:00:00.000Z";
  fs.writeFileSync(newerMetaPath, `${JSON.stringify(newerMeta, null, 2)}\n`, "utf-8");

  const project = resolveContext(root).project;
  const first = enforceTaskRetention(project, "older-task");

  assert.equal(first.archivedCurrentTask?.taskName, "older-task");
  assert.equal(fs.existsSync(path.join(root, ".claw", "tasks", "older-task")), false);
  assert.equal(first.prunedArchivedTasks[0]?.taskName, "older-task");
  assert.equal(fs.existsSync(first.archivedCurrentTask?.archivedTaskDir ?? ""), false);

  const second = enforceTaskRetention(project, "newer-task");

  assert.equal(second.archivedCurrentTask, undefined);
  assert.deepEqual(second.prunedArchivedTasks, []);
  assert.equal(fs.existsSync(path.join(root, ".claw", "archive", "tasks", "newer-task")), true);
});

test("enforceTaskRetention also archives legacy completed tasks still left in active tasks", async () => {
  const root = createFixture("task-retention-legacy-completed");
  initProject({
    cwd: root,
    projectName: "Retention Sweep Project",
    autoAchieveTask: true,
    maxTasksToKeep: 99,
    force: true,
  });
  await writePlan({
    cwd: root,
    taskName: "legacy-completed",
    title: "Legacy completed",
    goalText: "Archive legacy completed task",
    content: {
      title: "Legacy completed",
      status: "end.completed",
      goal: { text: "Archive legacy completed task" },
      tasks: [],
      retrospective: { summary: "Legacy complete." },
    },
  });
  await writePlan({
    cwd: root,
    taskName: "current-completed",
    title: "Current completed",
    goalText: "Archive current completed task",
    content: {
      title: "Current completed",
      status: "end.completed",
      goal: { text: "Archive current completed task" },
      tasks: [],
      retrospective: { summary: "Current complete." },
    },
  });

  const project = resolveContext(root).project;
  const result = enforceTaskRetention(project, "current-completed");

  assert.equal(result.archivedCurrentTask?.taskName, "current-completed");
  assert.equal(fs.existsSync(path.join(root, ".claw", "tasks", "legacy-completed")), false);
  assert.equal(fs.existsSync(path.join(root, ".claw", "tasks", "current-completed")), false);
  assert.equal(fs.existsSync(path.join(root, ".claw", "archive", "tasks", "legacy-completed")), true);
  assert.equal(fs.existsSync(path.join(root, ".claw", "archive", "tasks", "current-completed")), true);
});

test("concurrent plan writes fail fast with PLAN_WRITE_CONFLICT", async () => {
  const root = createFixture("plan-write-conflict");
  await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Protect canonical writes",
    content: {
      title: "Demo task",
      status: "process.active",
      goal: { text: "Protect canonical writes" },
      tasks: [{ id: 1, title: "Only task", status: "pending" }],
    },
  });

  const taskDir = path.join(root, ".claw", "tasks", "demo-task");
  const planPath = path.join(taskDir, "plan.json");
  fs.writeFileSync(`${planPath}.lock`, "", "utf-8");

  await assert.rejects(
    editPlan({
      cwd: root,
      taskName: "demo-task",
      taskId: 1,
      taskStatus: "done",
    }),
    (error: unknown) => {
      const candidate = error as { code?: unknown; message?: unknown } | null;
      return (
        typeof candidate === "object" &&
        candidate !== null &&
        candidate.code === "PLAN_WRITE_CONFLICT" &&
        String(candidate.message).includes("Concurrent write detected")
      );
    },
  );

  fs.unlinkSync(`${planPath}.lock`);
});
