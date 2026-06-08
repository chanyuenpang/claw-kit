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
    maxTasksToKeep: 20,
    externalTruthSkill: "external-truth-writer",
    externalAdrSkill: "external-adr-writer",
    contextPaths: ["docs/project-guide.md"],
    externalDocPaths: ["docs/", "README.md"],
    gitnexusEnabled: true,
  });
  const projectConfig = JSON.parse(
    fs.readFileSync(path.join(root, ".claw", "project.json"), "utf-8"),
  ) as {
    id: string;
    name: string;
    maxTasksToKeep: number;
    externalTruthSkill: string | null;
    externalAdrSkill: string | null;
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
    maxTasksToKeep: 20,
    externalTruthSkill: "external-truth-writer",
    externalAdrSkill: "external-adr-writer",
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

  const meta = JSON.parse(fs.readFileSync(result.metaPath, "utf-8")) as { activePlan: string; rootPlan: string };
  assert.equal(result.planFile, "plan.json");
  assert.equal(meta.activePlan, "plan.json");
  assert.equal(meta.rootPlan, "plan.json");
  assert.ok(fs.existsSync(result.planPath));
  assert.equal(result.workflowGuidance.stage, "requirements");
  assert.equal(result.workflowGuidance.delegateSubagents, undefined);
  assert.equal(
    result.workflowGuidance.goalMode?.recommendedObjective,
    "\u6309\u7167 claw \u6d41\u7a0b\uff0c\u63a8\u8fdb\u4efb\u52a1\uff0c\u66f4\u65b0plan\uff0c\u5b8c\u6210\uff1aShip the first plan",
  );
  assert.equal(result.workflowGuidance.goalMode?.allowOverwrite, true);
  assert.ok(result.workflowGuidance.summary.includes("Enter goal mode first"));
  assert.ok(result.workflowGuidance.nextStep.includes("Enter goal mode"));
  assert.ok(result.workflowGuidance.nextStep.includes("Review whether requirements are clear enough to execute"));
  assert.ok(result.workflowGuidance.nextStep.includes("Fill the `requirements` section"));
  assert.equal(result.workflowGuidance.askUser, undefined);
  assert.deepEqual(result.planSchema.references[0], {
    path: "<string>",
    why: "<string>",
  });
  assert.equal(result.planView.collapsedSummary, "Demo task");
  assert.equal(result.planView.goal.defaultCollapsed, true);
  assert.equal(result.planView.renderHints.defaultCollapsed, true);
  assert.equal(result.planView.expanded.sections[0]?.id, "goal");
  assert.equal(result.planView.expanded.sections[0]?.defaultExpanded, false);
  assert.equal(result.planView.expanded.sections[1]?.id, "tasks");
});

test("plan write guidance leaves requirement judgment to the agent", async () => {
  const root = createFixture("plan-write-clear-requirements");

  const result = await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Ship the first plan",
    content: {
      title: "Demo task",
      status: "prepare.requirements",
      goal: { text: "Ship the first plan" },
      tasks: [{ id: 1, title: "Implement work", status: "pending" }],
    },
  });

  assert.equal(result.workflowGuidance.askUser, undefined);
  assert.ok(result.workflowGuidance.nextStep.includes("Enter goal mode"));
  assert.ok(result.workflowGuidance.nextStep.includes("Fill the `requirements` section"));
  assert.ok(result.workflowGuidance.nextStep.includes("If requirements are clear, move into `process.active`"));
  assert.ok(result.workflowGuidance.nextStep.includes("If requirements are not clear, ask the user to clarify the missing scope first"));
  assert.deepEqual(result.workflowGuidance.notes, [
    "Do not start implementation while the plan is still in `prepare.requirements`.",
  ]);
});

test("plan write auto-assigns stable integer task ids when omitted", async () => {
  const root = createFixture("plan-write-auto-task-ids");

  const result = await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Ship the first plan",
    content: {
      title: "Demo task",
      status: "prepare.requirements",
      goal: { text: "Ship the first plan" },
      tasks: [
        { title: "First task", status: "pending" } as unknown as { id: number; title: string; status: "pending" },
        { title: "Second task", status: "pending" } as unknown as { id: number; title: string; status: "pending" },
      ],
    },
  });

  assert.deepEqual(
    result.planView.tasks.items.map((task) => ({ id: task.id, title: task.title })),
    [
      { id: 1, title: "First task" },
      { id: 2, title: "Second task" },
    ],
  );
  assert.equal(result.workflowGuidance.askUser, undefined);
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
  ) as { tasks: Array<{ title?: string; execution?: { type?: string; subplan?: string } }> };

  assert.equal(result.planFile, "plans/child-plan.json");
  assert.equal(meta.activePlan, "plans/child-plan.json");
  assert.equal(parentPlan.tasks[0]?.execution?.type, "subplan");
  assert.equal(parentPlan.tasks[0]?.execution?.subplan, "plans/child-plan.json");
});

test("subplan completion resumes the parent plan and marks the parent task done", async () => {
  const root = createFixture("subplan-complete-resume-parent");
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
        {
          id: 2,
          title: "Resume parent work",
          status: "pending",
        },
      ],
    },
  });

  await writePlan({
    cwd: root,
    taskName: "demo-task",
    filePath: "child-plan.json",
    parentTaskId: 1,
    title: "Child plan",
    goalText: "Handle a subplan",
    content: {
      title: "Child plan",
      status: "process.active",
      goal: { text: "Handle a subplan" },
      tasks: [{ id: 1, title: "Finish child", status: "done" }],
      retrospective: { summary: "Child complete." },
    },
  });

  const result = await editPlan({
    cwd: root,
    taskName: "demo-task",
    planFile: "plans/child-plan.json",
    planStatus: "end.completed",
    patch: {
      retrospective: { summary: "Child complete." },
    },
  });

  const meta = JSON.parse(
    fs.readFileSync(path.join(root, ".claw", "tasks", "demo-task", "meta.json"), "utf-8"),
  ) as { activePlan: string; status: string };
  const parentPlan = JSON.parse(
    fs.readFileSync(path.join(root, ".claw", "tasks", "demo-task", "plan.json"), "utf-8"),
  ) as { status: string; tasks: Array<{ id: number; status: string }> };
  const childPlan = JSON.parse(
    fs.readFileSync(path.join(root, ".claw", "tasks", "demo-task", "plans", "child-plan.json"), "utf-8"),
  ) as { status: string };

  assert.equal(result.planFile, "plan.json");
  assert.equal(result.planStatus, "process.active");
  assert.equal(result.workflowGuidance.stage, "execution");
  assert.equal(result.workflowGuidance.nextTask?.id, 2);
  assert.equal(result.workflowGuidance.nextTask?.title, "Resume parent work");
  assert.equal(result.workflowGuidance.delegateSubagents, undefined);
  assert.equal(meta.activePlan, "plan.json");
  assert.equal(meta.status, "active");
  assert.equal(parentPlan.status, "process.active");
  assert.equal(parentPlan.tasks[0]?.status, "done");
  assert.equal(parentPlan.tasks[1]?.status, "pending");
  assert.equal(childPlan.status, "end.completed");
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
      tasks: [{ id: 1, title: "Implement work", status: "pending" }],
    },
  });

  const activated = await editPlan({
    cwd: root,
    taskName: "demo-task",
    planStatus: "process.active",
  });

  assert.equal(activated.planStatus, "process.active");
  assert.equal(activated.workflowGuidance.stage, "execution");
  assert.equal(activated.workflowGuidance.nextTask?.id, 1);
  assert.equal(activated.workflowGuidance.nextTask?.title, "Implement work");
  assert.ok(activated.workflowGuidance.nextStep.includes("Sync the thread progress with our tasks."));
  assert.ok(activated.workflowGuidance.nextStep.includes("task #1"));

  const result = await editPlan({
    cwd: root,
    taskName: "demo-task",
    taskId: 1,
    taskStatus: "done",
  });

  assert.equal(result.planStatus, "process.active");
  assert.equal(result.planView.counts.completed, 1);
  assert.deepEqual(
    result.planView.tasks.items.map((task) => ({ id: task.id, status: task.status })),
    [{ id: 1, status: "done" }],
  );

  assert.equal(result.workflowGuidance.stage, "done");
  assert.ok(result.workflowGuidance.recommendedCommands?.some((command) => command.includes("claw plan done")));
  const truthDelegate = result.workflowGuidance.delegateSubagents?.[0];
  assert.ok(truthDelegate);
  assert.equal(truthDelegate.name, "truth-writer");
  assert.equal(truthDelegate.skill, "claw-kit:truth-writer");
  assert.equal(truthDelegate.model, "gpt-5.4-mini");
  assert.equal(truthDelegate.waitForCompletion, false);
  assert.equal(truthDelegate.preferReuseSameTypeInThread, true);
  assert.equal(truthDelegate.closePolicy, "keep_open_for_reuse");
  assert.equal(
    truthDelegate.inputContract,
    "curated completed subtask report with valuable findings for truth deposition",
  );
  assert.ok(result.workflowGuidance.nextStep.includes("truth-writer"));
  assert.ok(result.workflowGuidance.nextStep.includes("retrospective"));
});

test("process entry returns the first task and task completion returns truth-writer contract before plan completion", async () => {
  const root = createFixture("process-entry-and-truth-contract");
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify(
      {
        id: "process-entry-and-truth-contract",
        name: "Process Entry And Truth Contract",
        maxTasksToKeep: 99,
        externalTruthSkill: "external-truth-writer",
        externalAdrSkill: null,
        contextPaths: [],
        memory: { externalDocPaths: [] },
        gitnexus: { enabled: false },
      },
      null,
      2,
    ),
    "utf-8",
  );

  await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Verify process entry and task completion semantics",
    content: {
      title: "Demo task",
      status: "prepare.requirements",
      goal: { text: "Verify process entry and task completion semantics" },
      tasks: [
        { id: 1, title: "First task", status: "pending" },
        { id: 2, title: "Second task", status: "pending" },
      ],
    },
  });

  const activated = await editPlan({
    cwd: root,
    taskName: "demo-task",
    planStatus: "process.active",
  });
  assert.equal(activated.workflowGuidance.nextTask?.id, 1);
  assert.equal(activated.workflowGuidance.delegateSubagents, undefined);

  const taskDone = await editPlan({
    cwd: root,
    taskName: "demo-task",
    taskId: 1,
    taskStatus: "done",
  });
  assert.equal(taskDone.workflowGuidance.stage, "execution");
  assert.equal(taskDone.workflowGuidance.nextTask?.id, 2);
  assert.equal(
    taskDone.workflowGuidance.nextStep,
    "1. Sync the thread progress with our tasks. 2. Curate the valuable findings from the completed task into a completed subtask report, then dispatch `truth-writer` with that report. 3. Continue with task #2.",
  );
  assert.equal(taskDone.workflowGuidance.delegateSubagents?.[0]?.skill, "external-truth-writer");
});

test("plan edit appendTasks auto-assigns ids when omitted", async () => {
  const root = createFixture("plan-edit-auto-task-ids");
  await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Ship the first plan",
    content: {
      title: "Demo task",
      status: "process.active",
      goal: { text: "Ship the first plan" },
      tasks: [{ id: 3, title: "Existing task", status: "pending" }],
    },
  });

  const result = await editPlan({
    cwd: root,
    taskName: "demo-task",
    appendTasks: [
      { title: "Auto id task", status: "pending" } as unknown as { id: number; title: string; status: "pending" },
    ],
  });

  assert.deepEqual(
    result.planView.tasks.items.map((task) => ({ id: task.id, title: task.title })),
    [
      { id: 3, title: "Existing task" },
      { id: 4, title: "Auto id task" },
    ],
  );
});

test("plan edit changing a task back to pending does not advertise nextTask", async () => {
  const root = createFixture("plan-edit-pending-no-next-task");
  await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Verify pending edits stay lightweight",
    content: {
      title: "Demo task",
      status: "process.active",
      goal: { text: "Verify pending edits stay lightweight" },
      tasks: [
        { id: 1, title: "Current task", status: "in_progress" },
        { id: 2, title: "Later task", status: "pending" },
      ],
    },
  });

  const result = await editPlan({
    cwd: root,
    taskName: "demo-task",
    taskId: 1,
    taskStatus: "pending",
  });

  assert.equal(result.workflowGuidance.nextStep, "Continue with task #1.");
  assert.equal(result.workflowGuidance.nextTask, undefined);
  assert.deepEqual(result.workflowGuidance.recommendedCommands, [
    "claw plan edit --task demo-task --task-id <id> --task-status done",
  ]);
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

test("plan show falls back to archived tasks when the active task no longer exists", async () => {
  const root = createFixture("plan-show-archived");
  initProject({
    cwd: root,
    projectName: "Archived Show",
    maxTasksToKeep: 99,
    force: true,
  });
  await writePlan({
    cwd: root,
    taskName: "archived-task",
    title: "Archived task",
    goalText: "Show archived plan",
    content: {
      title: "Archived task",
      status: "end.completed",
      goal: { text: "Show archived plan" },
      tasks: [{ id: 1, title: "Done task", status: "done" }],
      retrospective: { summary: "Archived." },
    },
  });

  const project = resolveContext(root).project;
  enforceTaskRetention(project, "archived-task");

  const result = showPlan({
    cwd: root,
    taskName: "archived-task",
  });

  assert.equal(result.archived, true);
  assert.match(result.planPath, /archive[\\/]tasks[\\/]archived-task[\\/].*plan\.json$/);
  assert.equal(result.plan.title, "Archived task");
  assert.equal(result.planView.collapsedSummary, "1/1 Archived task");
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

test("workflow guidance uses external writer skills from project config", async () => {
  const root = createFixture("external-writer-skill-guidance");
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify(
      {
        id: "external-writer-skill-guidance",
        name: "External Writer Guidance",
        maxTasksToKeep: 99,
        externalTruthSkill: "external-truth-writer",
        externalAdrSkill: "external-adr-writer",
        contextPaths: [],
        memory: { externalDocPaths: [] },
        gitnexus: { enabled: false },
      },
      null,
      2,
    ),
    "utf-8",
  );

  await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Verify external writer routing",
    content: {
      title: "Demo task",
      status: "process.active",
      goal: { text: "Verify external writer routing" },
      tasks: [{ id: 1, title: "Complete the task", status: "pending" }],
    },
  });

  const taskDone = await editPlan({
    cwd: root,
    taskName: "demo-task",
    taskId: 1,
    taskStatus: "done",
  });
  assert.equal(taskDone.workflowGuidance.delegateSubagents?.[0]?.skill, "external-truth-writer");
  assert.equal(taskDone.workflowGuidance.delegateSubagents?.[0]?.model, "gpt-5.4-mini");

  const completed = await editPlan({
    cwd: root,
    taskName: "demo-task",
    planStatus: "end.completed",
    patch: { retrospective: { summary: "Done." } },
  });
  assert.equal(completed.workflowGuidance.delegateSubagents?.[0]?.skill, "external-adr-writer");
  assert.equal(completed.workflowGuidance.delegateSubagents?.[0]?.model, "gpt-5.4-mini");
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
    maxTasksToKeep: number;
    externalTruthSkill: string | null;
    externalAdrSkill: string | null;
    contextPaths: string[];
    memory: { externalDocPaths: string[] };
    gitnexus: { enabled: boolean };
  };

  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.ok(result.issueCountBefore > 0);
  assert.equal(projectConfig.id, "fix-me");
  assert.equal(projectConfig.name, "Fix Me");
  assert.equal(projectConfig.maxTasksToKeep, 99);
  assert.equal(projectConfig.externalTruthSkill, null);
  assert.equal(projectConfig.externalAdrSkill, null);
  assert.deepEqual(projectConfig.contextPaths, []);
  assert.deepEqual(projectConfig.memory.externalDocPaths, ["docs/"]);
  assert.equal(projectConfig.gitnexus.enabled, false);
});

test("enforceTaskRetention archives completed task and prunes archive by updatedAt", async () => {
  const root = createFixture("task-retention");
  initProject({
    cwd: root,
    projectName: "Retention Project",
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
