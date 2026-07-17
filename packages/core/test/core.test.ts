import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  buildDirectWorkflowGuidance,
  buildMemoryIndex,
  createSubplan,
  ensureProjectProtocol,
  ensureUtf8Bom,
  editPlan,
  enforceTaskRetention,
  getMemory,
  ingestTruth,
  initProject,
  resolveContext,
  resolveProjectContext,
  resolveSessionBoundPlan,
  searchMemory,
  showPlan,
  switchTask,
  writePlan,
  type PlanDocument,
} from "../src/index.js";
import { readTextFile, withSerializedAccess } from "../src/io.js";
import {
  buildProjectKeywordSearchPlan,
  buildProjectQueryIntent,
  extractProjectKeywordTerms,
} from "../src/memory-query.js";
import {
  resolveDefaultLocalEmbeddingCacheDir,
  resolveLocalEmbeddingCacheDir,
} from "../src/embedding-defaults.js";

function createFixture(name: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `claw-kit-${name}-`));
  fs.mkdirSync(path.join(root, ".claw", "truth"), { recursive: true });
  return root;
}

function createEmptyFixture(name: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `claw-kit-${name}-`));
}

function createPlanLikeTemplate(params: {
  id: string;
  configOverride?: Record<string, unknown>;
  title?: string;
  status?: PlanDocument["status"];
  goalText?: string;
  tasks: Array<Record<string, unknown>>;
  references?: Array<{ path: string; why: string }>;
  rules?: string[];
  keyDecisions?: string[];
  retrospectiveSummary?: string;
}): Record<string, unknown> {
  return {
    id: params.id,
    ...(params.configOverride ? { configOverride: params.configOverride } : {}),
    ...(params.title ? { title: params.title } : {}),
    status: params.status ?? "process.discussing",
    goal: {
      text: params.goalText ?? "",
    },
    requirements: {
      summary: "",
      openQuestions: [],
      acceptanceCriteria: [],
    },
    tasks: params.tasks,
    references: params.references ?? [],
    rules: params.rules ?? [],
    keyDecisions: params.keyDecisions ?? [],
    retrospective: {
      summary: params.retrospectiveSummary ?? "",
    },
  };
}

test("workflow guidance json config is emitted with the build output", () => {
  const distConfigPath = new URL("../src/workflow-guidance.config.json", import.meta.url);
  const sourceConfigPath = new URL("../../src/workflow-guidance.config.json", import.meta.url);
  assert.equal(fs.existsSync(distConfigPath), true);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(distConfigPath, "utf-8")),
    JSON.parse(fs.readFileSync(sourceConfigPath, "utf-8")),
  );
});

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
    version: string;
    id: string;
    name: string;
    maxTasksToKeep: number;
    autoUpdate: boolean;
    externalTruthSkill: string | null;
    externalAdrSkill: string | null;
    contextPaths: string[];
    goalMode: boolean;
    truthDispatch: "per_task" | "final_only";
    memory: {
      enabled: boolean;
      externalDocPaths: string[];
      embedding: {
        provider: string;
        model: string;
        local?: {
          modelCacheDir?: string;
        };
      };
    };
    gitnexus: boolean;
  };

  assert.equal(result.projectId, "demo-project");
  assert.ok(fs.existsSync(path.join(root, ".claw", "project.json")));
  assert.ok(fs.existsSync(path.join(root, ".claw", "memory.md")));
  assert.ok(fs.statSync(path.join(root, ".claw", "truth")).isDirectory());
  assert.equal(fs.existsSync(path.join(root, ".claw", "truth", "SUMMARY.md")), false);
  assert.ok(fs.existsSync(path.join(root, ".claw", "tasks")));
  assert.equal(
    fs.readFileSync(path.join(root, ".gitignore"), "utf-8"),
    "# claw-kit\n.claw/*\n!.claw/project.json\n!.claw/truth/\n!.claw/truth/**\n.claw/project-override.json\n",
  );
  assert.deepEqual(projectConfig, {
    version: "0.1.72",
    id: "demo-project",
    name: "Demo Project",
    maxTasksToKeep: 20,
    planning: true,
    autoUpdate: true,
    externalPlanningSkill: null,
    externalTruthSkill: "external-truth-writer",
    externalAdrSkill: "external-adr-writer",
    defaultPlanTemplate: null,
    contextPaths: ["docs/project-guide.md"],
    goalMode: true,
    truthDispatch: "final_only",
    memory: {
      enabled: true,
      externalDocPaths: ["docs/", "README.md"],
      embedding: {
        provider: "local",
        model: "Snowflake/snowflake-arctic-embed-m-v2.0",
      },
    },
    gitnexus: true,
  });
});

test("initProject appends claw gitignore rules once when project already has a gitignore", () => {
  const root = createEmptyFixture("init-gitignore-existing");
  const gitignorePath = path.join(root, ".gitignore");
  fs.writeFileSync(gitignorePath, "node_modules/\n", "utf-8");

  initProject({
    cwd: root,
    projectName: "Demo Project",
    force: true,
  });

  const once = fs.readFileSync(gitignorePath, "utf-8");
  assert.equal(
    once,
    "node_modules/\n\n# claw-kit\n.claw/*\n!.claw/project.json\n!.claw/truth/\n!.claw/truth/**\n.claw/project-override.json\n",
  );

  initProject({
    cwd: root,
    projectName: "Demo Project",
    force: true,
  });

  assert.equal(fs.readFileSync(gitignorePath, "utf-8"), once);
});

test("writePlan seeds a planning-first root plan by default", async () => {
  const root = createFixture("plan-write");

  const result = await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Ship the first plan",
  });

  assert.equal(result.planFile, "plan.json");
  assert.equal(fs.existsSync(path.join(result.taskDir, "meta.json")), false);
  assert.ok(fs.existsSync(result.planPath));
  assert.equal(result.workflowGuidance.stage, "discussion");
  assert.equal(result.workflowGuidance.delegateSubagents, undefined);
  assert.equal(result.workflowGuidance.goalMode, undefined);
  assert.deepEqual(result.workflowGuidance.nextsteps, [
    "1. Run one project recall query.",
    "2. Resolve the discussion, then resume through `process.active`.",
  ]);
  assert.equal(result.workflowGuidance.recommendedCommands?.[0], 'claw search --query "<topic>"');
  assert.equal(result.workflowGuidance.goalTool, undefined);
  assert.ok(result.workflowGuidance.summary.includes("discussion"));
  assert.equal(result.workflowGuidance.askUser, undefined);
  assert.equal(result.plan.title, "Demo task");
  assert.equal(result.plan.status, "process.discussing");
  assert.equal(result.plan.goal.text, "Ship the first plan");
  assert.equal(result.plan.tasks[0]?.title, "Use the planning skill to refine the request and append executable tasks");
  assert.match(result.plan.tasks[0]?.detail ?? "", /Recommended planning skill: the built-in planning skill\./);
  assert.doesNotMatch(result.plan.tasks[0]?.detail ?? "", /\btakes\b/);
  assert.equal(result.plan.tasks[1]?.title, "Enter process.active");
  assert.deepEqual(result.plan.references, []);
  assert.equal(result.planView.collapsedSummary, "0/2 Demo task");
  assert.equal(result.planView.goal.defaultCollapsed, true);
  assert.equal(result.planView.renderHints.defaultCollapsed, true);
  assert.equal(result.planView.expanded.sections[0]?.id, "goal");
  assert.equal(result.planView.expanded.sections[0]?.defaultExpanded, false);
  assert.equal(result.planView.expanded.sections[1]?.id, "tasks");
});

test("writePlan includes the recommended goal objective in the activation task when goal mode is enabled", async () => {
  const root = createFixture("plan-write-goalmode-activation-detail");

  const result = await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Ship the first plan",
  });

  assert.equal(
    result.plan.tasks[1]?.detail,
    "After the planning task appends the executable tasks, move the plan into `process.active` and continue execution from the refined task list. If Goal Mode is enabled for this project, start Goal Mode when entering `process.active` and use `Using claw-kit, update plan, follow returned workflowGuidance，finish your goal：Ship the first plan` as the goal objective.",
  );
});

test("writePlan keeps the activation task detail plain for opencode host", async () => {
  const root = createFixture("plan-write-opencode-activation-detail");

  const result = await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Ship the first plan",
    host: "opencode",
  });

  assert.equal(
    result.plan.tasks[1]?.detail,
    "After the planning task appends the executable tasks, move the plan into `process.active` and continue execution from the refined task list. If Goal Mode is enabled for this project, start Goal Mode when entering `process.active`.",
  );
});

test("writePlan keeps the activation task detail plain when goal mode is disabled", async () => {
  const root = createFixture("plan-write-goalmode-disabled-activation-detail");
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify({
      version: "0.1.60",
      id: "plan-write-goalmode-disabled-activation-detail",
      name: "Plan Write GoalMode Disabled Activation Detail",
      planning: true,
      maxTasksToKeep: 99,
      goalMode: false,
      truthDispatch: "per_task",
      externalTruthSkill: null,
      externalAdrSkill: null,
      contextPaths: [],
      memory: { enabled: true, externalDocPaths: [], embedding: null },
      gitnexus: false,
    }, null, 2),
    "utf-8",
  );

  const result = await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Ship the first plan",
  });

  assert.equal(
    result.plan.tasks[1]?.detail,
    "After the planning task appends the executable tasks, move the plan into `process.active` and continue execution from the refined task list.",
  );
});

test("planning appendTasks preserves the seeded activation task ordering", async () => {
  const root = createFixture("planning-append-preserves-activation");

  await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Ship the first plan",
  });

  const result = await editPlan({
    cwd: root,
    taskName: "demo-task",
    taskId: 1,
    taskStatus: "done",
    appendTasks: [
      { title: "Implement the change", status: "pending" } as unknown as { id: number; title: string; status: "pending" },
      { title: "Verify the change", status: "pending" } as unknown as { id: number; title: string; status: "pending" },
    ],
  });

  const plan = JSON.parse(
    fs.readFileSync(path.join(root, ".claw", "tasks", "demo-task", "plan.json"), "utf-8"),
  ) as PlanDocument;

  assert.deepEqual(
    plan.tasks.map((task) => ({ id: task.id, title: task.title, status: task.status })),
    [
      { id: 1, title: "Use the planning skill to refine the request and append executable tasks", status: "done" },
      { id: 2, title: "Enter process.active", status: "pending" },
      { id: 3, title: "Implement the change", status: "pending" },
      { id: 4, title: "Verify the change", status: "pending" },
    ],
  );
});

test("writePlan uses externalPlanningSkill in the seeded planning task detail", async () => {
  const root = createFixture("plan-write-external-planning-skill");
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify({
      version: "0.1.60",
      id: "plan-write-external-planning-skill",
      name: "Plan Write External Planning Skill",
      planning: true,
      externalPlanningSkill: "team-planner",
      maxTasksToKeep: 99,
      goalMode: true,
      truthDispatch: "per_task",
      externalTruthSkill: null,
      externalAdrSkill: null,
      contextPaths: [],
      memory: { enabled: true, externalDocPaths: [], embedding: null },
      gitnexus: false,
    }, null, 2),
    "utf-8",
  );

  const result = await writePlan({
    cwd: root,
    title: "Demo task",
    goalText: "Use the external planner",
  });

  assert.ok(result.plan.tasks[0]?.detail?.includes("team-planner"));
});

test("writePlan loads a project JSON template from .claw/templates", async () => {
  const root = createFixture("plan-template-project-json");
  initProject({ cwd: root, projectName: "Project Json Template", planning: true, force: true });
  fs.mkdirSync(path.join(root, ".claw", "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "templates", "team-default.json"),
    `${JSON.stringify(createPlanLikeTemplate({
      id: "team-default",
      tasks: [
        {
          id: 1,
          title: "Draft requirements with the team template",
          detail: "Use {{planningSkill}} to turn the request into executable tasks.",
          status: "pending",
        },
        {
          id: 2,
          title: "Activate the team template plan",
          detail: "Move this plan into process.active after refinement.",
          goalModeDetail: "If Goal Mode is enabled for this project, start Goal Mode.",
          status: "pending",
        },
      ],
    }), null, 2)}\n`,
    "utf-8",
  );

  const result = await writePlan({
    cwd: root,
    title: "Use project JSON template",
    templateName: "team-default",
  });

  assert.equal(result.plan.templateId, "team-default");
  assert.equal(result.plan.tasks[0]?.title, "Draft requirements with the team template");
  assert.equal(result.plan.tasks[1]?.title, "Activate the team template plan");
});

test("writePlan loads a global user template when the project does not define one", { concurrency: false }, async () => {
  const root = createFixture("plan-template-global-json");
  initProject({ cwd: root, projectName: "Global Template Project", planning: true, force: true });
  const homeRoot = createEmptyFixture("global-template-home");
  fs.mkdirSync(path.join(homeRoot, ".claw", "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(homeRoot, ".claw", "templates", "global-default.json"),
    `${JSON.stringify(createPlanLikeTemplate({
      id: "global-default",
      tasks: [
        {
          id: 1,
          title: "Use the global template",
          detail: "Use {{planningSkill}} to prepare the globally installed template.",
          status: "pending",
        },
        {
          id: 2,
          title: "Activate the global template",
          detail: "Move into process.active after the global template planning pass.",
          status: "pending",
        },
      ],
    }), null, 2)}\n`,
    "utf-8",
  );

  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  process.env.HOME = homeRoot;
  process.env.USERPROFILE = homeRoot;

  try {
    const result = await writePlan({
      cwd: root,
      title: "Use global template",
      templateName: "global-default",
    });

    assert.equal(result.plan.templateId, "global-default");
    assert.equal(result.plan.tasks[0]?.title, "Use the global template");
    assert.equal(result.plan.tasks[1]?.title, "Activate the global template");
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = previousUserProfile;
    }
  }
});

test("writePlan loads a project skill-local template from TEMPLATE.json", async () => {
  const root = createFixture("plan-template-project-skill-local");
  initProject({ cwd: root, projectName: "Project Skill Local Template", planning: true, force: true });
  fs.mkdirSync(path.join(root, "skills", "example-skill-template"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "skills", "example-skill-template", "TEMPLATE.json"),
    `${JSON.stringify(createPlanLikeTemplate({
      id: "example-skill-template",
      tasks: [
        {
          id: 1,
          title: "Use the colocated skill template",
          detail: "Read the skill-local template instead of .claw/templates.",
          status: "pending",
        },
      ],
    }), null, 2)}\n`,
    "utf-8",
  );

  const result = await writePlan({
    cwd: root,
    title: "Use project skill-local template",
    templateName: "example-skill-template",
  });

  assert.equal(result.plan.templateId, "example-skill-template");
  assert.equal(result.plan.tasks[0]?.title, "Use the colocated skill template");
});

test("writePlan deduplicates mirrored project skill-local templates with matching content", async () => {
  const root = createFixture("plan-template-project-skill-local-mirror");
  initProject({ cwd: root, projectName: "Mirrored Skill Local Template", planning: true, force: true });
  const templateText = `${JSON.stringify(createPlanLikeTemplate({
    id: "create-claw-skill",
    tasks: [
      {
        id: 1,
        title: "Use the mirrored skill template",
        detail: "Mirror copies from multiple adapters should resolve as one template.",
        status: "pending",
      },
    ],
  }), null, 2)}\n`;
  for (const adapterName of ["codex-adapter", "opencode-adapter"]) {
    const skillDir = path.join(root, "packages", adapterName, "skills", "create-claw-skill");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "TEMPLATE.json"), templateText, "utf-8");
  }

  const result = await writePlan({
    cwd: root,
    title: "Use mirrored skill-local template",
    templateName: "create-claw-skill",
  });

  assert.equal(result.plan.templateId, "create-claw-skill");
  assert.equal(result.plan.tasks[0]?.title, "Use the mirrored skill template");
});

test("writePlan loads a global skill-local template from the Codex plugin cache", { concurrency: false }, async () => {
  const root = createFixture("plan-template-global-skill-local");
  initProject({ cwd: root, projectName: "Global Skill Local Template", planning: true, force: true });
  const homeRoot = createEmptyFixture("global-skill-template-home");
  const skillDir = path.join(
    homeRoot,
    ".codex",
    "plugins",
    "cache",
    "claw-kit-local",
    "claw-kit",
    "0.1.57+codex.test",
    "skills",
    "example-global-skill-template",
  );
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "TEMPLATE.json"),
    `${JSON.stringify(createPlanLikeTemplate({
      id: "example-global-skill-template",
      tasks: [
        {
          id: 1,
          title: "Use the global skill-local template",
          detail: "Resolve the template from the installed Codex plugin skill package.",
          status: "pending",
        },
      ],
    }), null, 2)}\n`,
    "utf-8",
  );

  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  process.env.HOME = homeRoot;
  process.env.USERPROFILE = homeRoot;

  try {
    const result = await writePlan({
      cwd: root,
      title: "Use global skill-local template",
      templateName: "example-global-skill-template",
    });

    assert.equal(result.plan.templateId, "example-global-skill-template");
    assert.equal(result.plan.tasks[0]?.title, "Use the global skill-local template");
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = previousUserProfile;
    }
  }
});

test("writePlan loads a plan-like project template and strips template-only task fields from runtime plan", async () => {
  const root = createFixture("planlike-template-project-json");
  initProject({ cwd: root, projectName: "Planlike Template Project", planning: true, force: true });
  fs.mkdirSync(path.join(root, ".claw", "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "templates", "planlike-default.json"),
    `${JSON.stringify({
      id: "planlike-default",
      status: "process.discussing",
      goal: {
        text: "Compile the workflow",
      },
      requirements: {
        summary: "",
        openQuestions: [],
        acceptanceCriteria: [],
      },
      tasks: [
        {
          id: 1,
          title: "Plan the conversion",
          detail: "Use {{planningSkill}} to shape the conversion work.",
          status: "pending",
        },
        {
          id: 2,
          title: "Enter process.active",
          detail: "Move into execution after planning.",
          goalModeDetail: "If Goal Mode is enabled for this project, start Goal Mode when entering process.active.",
          status: "pending",
        },
        {
          id: 3,
          title: "Compile the claw route",
          detail: "Produce the claw entry skill.",
          status: "pending",
          guidance: {
            onDone: {
              default: {
                mergeMode: "override",
                summary: "Template-controlled route complete.",
              },
            },
          },
        },
      ],
      references: [
        {
          path: "skills/source-skill.md",
          why: "source skill"
        }
      ],
      rules: [
        "Keep template control out of runtime task prose."
      ],
      keyDecisions: [],
      retrospective: {
        summary: ""
      }
    }, null, 2)}\n`,
    "utf-8",
  );

  const result = await writePlan({
    cwd: root,
    title: "Use planlike template",
    templateName: "planlike-default",
  });

  assert.equal(result.plan.templateId, "planlike-default");
  assert.equal(result.plan.title, "Use planlike template");
  assert.equal(result.plan.status, "process.discussing");
  assert.equal(result.plan.goal.text, "Compile the workflow");
  assert.equal(result.plan.tasks[0]?.detail, "Use the built-in planning skill to shape the conversion work.");
  assert.match(result.plan.tasks[1]?.detail ?? "", /Goal Mode is enabled/);
  assert.equal("guidance" in (result.plan.tasks[2] ?? {}), false);
  assert.equal("goalModeDetail" in (result.plan.tasks[1] ?? {}), false);
  assert.deepEqual(result.plan.references, [{ path: "skills/source-skill.md", why: "source skill" }]);
  assert.deepEqual(result.plan.rules, ["Keep template control out of runtime task prose."]);
});

test("writePlan records template configOverride in the runtime plan", async () => {
  const root = createFixture("plan-template-config-override");
  initProject({ cwd: root, projectName: "Project Template Config Override", planning: true, force: true });
  fs.mkdirSync(path.join(root, ".claw", "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "templates", "team-override.json"),
    `${JSON.stringify(createPlanLikeTemplate({
      id: "team-override",
      configOverride: {
        goalMode: false,
        truthDispatch: "final_only",
      },
      tasks: [
        {
          id: 1,
          title: "Plan with override",
          detail: "Use {{planningSkill}} to shape the work.",
          status: "pending",
        },
        {
          id: 2,
          title: "Activate with override",
          detail: "Move to process.active after planning.",
          goalModeDetail: "If Goal Mode is enabled for this project, start Goal Mode.",
          status: "pending",
        },
      ],
    }), null, 2)}\n`,
    "utf-8",
  );

  const result = await writePlan({
    cwd: root,
    title: "Use template override",
    templateName: "team-override",
  });

  assert.equal(result.plan.templateId, "team-override");
  assert.deepEqual(result.plan.configOverride, {
    goalMode: false,
    truthDispatch: "final_only",
  });
});

test("template configOverride goalMode=false suppresses goal-mode activation detail", async () => {
  const root = createFixture("plan-template-config-override-goalmode");
  initProject({ cwd: root, projectName: "Project Template Override GoalMode", planning: true, force: true });
  fs.mkdirSync(path.join(root, ".claw", "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "templates", "goalmode-off.json"),
    `${JSON.stringify(createPlanLikeTemplate({
      id: "goalmode-off",
      configOverride: {
        goalMode: false,
      },
      tasks: [
        {
          id: 1,
          title: "Plan with goal mode disabled",
          detail: "Use {{planningSkill}} to shape the work.",
          status: "pending",
        },
        {
          id: 2,
          title: "Activate with goal mode disabled",
          detail: "Move to process.active after planning.",
          goalModeDetail: "If Goal Mode is enabled for this project, start Goal Mode.",
          status: "pending",
        },
      ],
    }), null, 2)}\n`,
    "utf-8",
  );

  const result = await writePlan({
    cwd: root,
    title: "Use goalmode-off template",
    templateName: "goalmode-off",
  });

  assert.equal(result.plan.tasks[1]?.detail, "Move to process.active after planning.");
});

test("writePlan rejects unsupported template configOverride keys", async () => {
  const root = createFixture("plan-template-config-override-invalid");
  initProject({ cwd: root, projectName: "Project Template Invalid Override", planning: true, force: true });
  fs.mkdirSync(path.join(root, ".claw", "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "templates", "bad-override.json"),
    `${JSON.stringify(createPlanLikeTemplate({
      id: "bad-override",
      configOverride: {
        contextPaths: ["docs/"],
      },
      tasks: [
        {
          id: 1,
          title: "Plan with invalid override",
          detail: "Use {{planningSkill}} to shape the work.",
          status: "pending",
        },
        {
          id: 2,
          title: "Activate with invalid override",
          detail: "Move to process.active after planning.",
          goalModeDetail: "If Goal Mode is enabled for this project, start Goal Mode.",
          status: "pending",
        },
      ],
    }), null, 2)}\n`,
    "utf-8",
  );

  await assert.rejects(
    () =>
      writePlan({
        cwd: root,
        title: "Use invalid override",
        templateName: "bad-override",
      }),
    /configOverride|override/i,
  );
});

test("writePlan loads a project JS template from .claw/templates", async () => {
  const root = createFixture("plan-template-project-js");
  initProject({ cwd: root, projectName: "Project Js Template", planning: true, force: true });
  fs.mkdirSync(path.join(root, ".claw", "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "templates", "team-js-template.mjs"),
    `export default ${JSON.stringify(createPlanLikeTemplate({
      id: "team-js-template",
      tasks: [
        {
          id: 1,
          title: "Plan with the JS template",
          detail: "Use {{planningSkill}} to build the plan.",
          status: "pending",
        },
        {
          id: 2,
          title: "Activate the JS template",
          detail: "Move to process.active after planning.",
          goalModeDetail: "If Goal Mode is enabled for this project, start Goal Mode.",
          status: "pending",
        },
      ],
    }), null, 2)};\n`,
    "utf-8",
  );

  const result = await writePlan({
    cwd: root,
    title: "Use project JS template",
    templateName: "team-js-template",
  });

  assert.equal(result.plan.templateId, "team-js-template");
  assert.equal(result.plan.tasks[0]?.title, "Plan with the JS template");
});

test("template configOverride truthDispatch=final_only suppresses mid-task truth guidance", async () => {
  const root = createFixture("plan-template-config-override-truthdispatch");
  initProject({ cwd: root, projectName: "Project Template Override TruthDispatch", planning: true, force: true });
  fs.mkdirSync(path.join(root, ".claw", "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "templates", "final-only.json"),
    `${JSON.stringify(createPlanLikeTemplate({
      id: "final-only",
      configOverride: {
        truthDispatch: "final_only",
      },
      status: "process.active",
      tasks: [
        {
          id: 1,
          title: "Only task",
          detail: "Use {{planningSkill}} to shape the work.",
          status: "pending",
        },
        {
          id: 2,
          title: "Unused activation",
          detail: "Unused activation detail.",
          goalModeDetail: "If Goal Mode is enabled for this project, start Goal Mode.",
          status: "pending",
        },
      ],
    }), null, 2)}\n`,
    "utf-8",
  );

  await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Use final-only template override",
    templateName: "final-only",
    content: {
      title: "Demo task",
      templateId: "final-only",
      configOverride: {
        truthDispatch: "final_only",
      },
      status: "process.active",
      goal: { text: "Use final-only template override" },
      tasks: [
        { id: 1, title: "Complete the first task", status: "pending" },
        { id: 2, title: "Leave one task unfinished", status: "pending" },
      ],
    },
  });

  const taskDone = await editPlan({
    cwd: root,
    taskName: "demo-task",
    taskId: 1,
    taskStatus: "done",
  });

  assert.equal(taskDone.workflowGuidance.delegateSubagents, undefined);
  assert.deepEqual(taskDone.workflowGuidance.nextsteps, ["Continue with task #2."]);
  assert.equal(taskDone.workflowGuidance.nextsteps.some((step) => step.includes("update_plan")), false);
  assert.match(taskDone.workflowGuidance.notes ?? "", /do not mirror every task completion mechanically/);
  assert.deepEqual(taskDone.workflowGuidance.recommendedCommands, [
    "claw plan edit --task demo-task --task-id <id> --task-status done",
  ]);
});

test("route-aware task completion requires taskChoiceId when the template defines choices", async () => {
  const root = createFixture("plan-template-guidance-choice-required");
  initProject({ cwd: root, projectName: "Project Template Guidance Choice Required", planning: true, force: true });
  fs.mkdirSync(path.join(root, ".claw", "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "templates", "choice-required.json"),
    `${JSON.stringify(createPlanLikeTemplate({
      id: "choice-required",
      status: "process.active",
      tasks: [
        {
          id: 1,
          title: "Choose a route",
          detail: "Pick the execution route.",
          status: "pending",
          guidance: {
            onDone: {
              choices: {
                simple: {
                  summary: "Simple route",
                  nextsteps: ["Keep going."],
                },
              },
            },
          },
        },
        {
          id: 2,
          title: "Activation task",
          detail: "Activation detail.",
          goalModeDetail: "If Goal Mode is enabled for this project, start Goal Mode.",
          status: "pending",
        },
      ],
    }), null, 2)}\n`,
    "utf-8",
  );

  await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Require a task choice",
    templateName: "choice-required",
  });

  await assert.rejects(
    () =>
      editPlan({
        cwd: root,
        taskName: "demo-task",
        taskId: 1,
        taskStatus: "done",
      }),
    /choice/i,
  );
});

test("plan-like template guidance choices work for downstream task ids beyond the default skeleton", async () => {
  const root = createFixture("planlike-template-guidance-choice-required");
  initProject({ cwd: root, projectName: "Planlike Template Guidance Choice Required", planning: true, force: true });
  fs.mkdirSync(path.join(root, ".claw", "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "templates", "planlike-choice-required.json"),
    `${JSON.stringify({
      id: "planlike-choice-required",
      status: "process.active",
      goal: {
        text: "Choose the downstream route",
      },
      requirements: {
        summary: "",
        openQuestions: [],
        acceptanceCriteria: [],
      },
      tasks: [
        {
          id: 3,
          title: "Choose a route",
          detail: "Pick the execution route.",
          status: "pending",
          guidance: {
            onDone: {
              choices: {
                simple: {
                  summary: "Simple route",
                  nextsteps: ["Keep going."],
                },
              },
            },
          },
        }
      ],
      references: [],
      rules: [],
      keyDecisions: [],
      retrospective: {
        summary: ""
      }
    }, null, 2)}\n`,
    "utf-8",
  );

  await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Require a task choice on downstream task id",
    templateName: "planlike-choice-required",
  });

  await assert.rejects(
    () =>
      editPlan({
        cwd: root,
        taskName: "demo-task",
        taskId: 3,
        taskStatus: "done",
      }),
    /choice/i,
  );
});

test("route-aware task completion rejects invalid taskChoiceId", async () => {
  const root = createFixture("plan-template-guidance-choice-invalid");
  initProject({ cwd: root, projectName: "Project Template Guidance Choice Invalid", planning: true, force: true });
  fs.mkdirSync(path.join(root, ".claw", "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "templates", "choice-invalid.json"),
    `${JSON.stringify(createPlanLikeTemplate({
      id: "choice-invalid",
      status: "process.active",
      tasks: [
        {
          id: 1,
          title: "Choose a route",
          detail: "Pick the execution route.",
          status: "pending",
          guidance: {
            onDone: {
              choices: {
                simple: {
                  summary: "Simple route",
                  nextsteps: ["Keep going."],
                },
              },
            },
          },
        },
        {
          id: 2,
          title: "Activation task",
          detail: "Activation detail.",
          goalModeDetail: "If Goal Mode is enabled for this project, start Goal Mode.",
          status: "pending",
        },
      ],
    }), null, 2)}\n`,
    "utf-8",
  );

  await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Reject invalid task choice",
    templateName: "choice-invalid",
  });

  await assert.rejects(
    () =>
      editPlan({
        cwd: root,
        taskName: "demo-task",
        taskId: 1,
        taskStatus: "done",
        taskChoiceId: "wrong",
      }),
    /choice/i,
  );
});

test("route-aware task completion persists valid taskChoiceId", async () => {
  const root = createFixture("plan-template-guidance-choice-valid");
  initProject({ cwd: root, projectName: "Project Template Guidance Choice Valid", planning: true, force: true });
  fs.mkdirSync(path.join(root, ".claw", "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "templates", "choice-valid.json"),
    `${JSON.stringify(createPlanLikeTemplate({
      id: "choice-valid",
      status: "process.active",
      tasks: [
        {
          id: 1,
          title: "Choose a route",
          detail: "Pick the execution route.",
          status: "pending",
          guidance: {
            onDone: {
              choices: {
                simple: {
                  summary: "Simple route",
                  nextsteps: ["Keep going."],
                },
              },
            },
          },
        },
        {
          id: 2,
          title: "Activation task",
          detail: "Activation detail.",
          goalModeDetail: "If Goal Mode is enabled for this project, start Goal Mode.",
          status: "pending",
        },
      ],
    }), null, 2)}\n`,
    "utf-8",
  );

  const created = await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Persist valid task choice",
    templateName: "choice-valid",
  });

  const completed = await editPlan({
    cwd: root,
    taskName: "demo-task",
    taskId: 1,
    taskStatus: "done",
    taskChoiceId: "simple",
  });

  assert.equal(completed.planPath, created.planPath);
  const persisted = JSON.parse(fs.readFileSync(created.planPath, "utf-8")) as PlanDocument;
  assert.equal(persisted.tasks[0]?.choiceId, "simple");
});

test("default template planning and activation tasks suppress per-task truth dispatch", async () => {
  const root = createFixture("default-template-suppress-truth");
  initProject({
    cwd: root,
    projectName: "Default Template Suppress Truth",
    externalTruthSkill: "external-truth-writer",
    force: true,
  });

  await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Keep bridge tasks lightweight",
  });

  await editPlan({
    cwd: root,
    taskName: "demo-task",
    appendTasks: [{ id: 3, title: "Real execution task", status: "pending" }],
  });

  await editPlan({
    cwd: root,
    taskName: "demo-task",
    planStatus: "process.active",
  });

  const planningDone = await editPlan({
    cwd: root,
    taskName: "demo-task",
    taskId: 1,
    taskStatus: "done",
  });
  assert.equal(planningDone.workflowGuidance.delegateSubagents, undefined);
  assert.equal(planningDone.workflowGuidance.nextsteps.some((step) => step.includes("truth-writer")), false);
  assert.equal(planningDone.workflowGuidance.nextTask?.id, 2);

  const activationDone = await editPlan({
    cwd: root,
    taskName: "demo-task",
    taskId: 2,
    taskStatus: "done",
  });
  assert.equal(activationDone.workflowGuidance.delegateSubagents, undefined);
  assert.equal(activationDone.workflowGuidance.nextsteps.some((step) => step.includes("truth-writer")), false);
  assert.equal(activationDone.workflowGuidance.nextTask?.id, 3);

  const realTaskDone = await editPlan({
    cwd: root,
    taskName: "demo-task",
    taskId: 3,
    taskStatus: "done",
  });
  assert.equal(realTaskDone.workflowGuidance.delegateSubagents?.[0]?.name, "truth-writer");
  assert.equal(realTaskDone.workflowGuidance.delegateSubagents?.[1]?.name, "adr-writer");
});

test("template guidance onDone default can override default workflow guidance without choices", async () => {
  const root = createFixture("template-guidance-override-default");
  initProject({ cwd: root, projectName: "Template Guidance Override", planning: true, force: true });
  fs.mkdirSync(path.join(root, ".claw", "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "templates", "override-default.json"),
    `${JSON.stringify(createPlanLikeTemplate({
      id: "override-default",
      status: "process.active",
      tasks: [
        {
          id: 1,
          title: "Primary task",
          detail: "Run the main work.",
          status: "pending",
          guidance: {
            onDone: {
              default: {
                mergeMode: "override",
                summary: "Template-adjusted completion guidance",
                nextsteps: ["Capture the route-specific handoff note."],
                recommendedCommands: ["claw task done --task demo-task --id 2"],
                delegateTruth: false,
              },
            },
          },
        },
        {
          id: 2,
          title: "Second task",
          detail: "Continue to the next step.",
          goalModeDetail: "If Goal Mode is enabled for this project, start Goal Mode.",
          status: "pending",
        },
      ],
    }), null, 2)}\n`,
    "utf-8",
  );

  await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Override default guidance",
    templateName: "override-default",
  });

  const taskDone = await editPlan({
    cwd: root,
    taskName: "demo-task",
    taskId: 1,
    taskStatus: "done",
  });

  assert.equal(taskDone.workflowGuidance.summary, "Template-adjusted completion guidance");
  assert.equal(taskDone.workflowGuidance.delegateSubagents, undefined);
  assert.equal(taskDone.workflowGuidance.nextsteps.some((step) => step.includes("truth-writer")), false);
  assert.equal(taskDone.workflowGuidance.nextsteps.some((step) => step.includes("Capture the route-specific handoff note.")), true);
  assert.equal(taskDone.workflowGuidance.recommendedCommands?.includes("claw task done --task demo-task --id 2"), true);
  assert.equal(taskDone.workflowGuidance.nextTask?.id, 2);
});

test("template guidance onDone default can replace default workflow guidance without choices", async () => {
  const root = createFixture("template-guidance-replace-default");
  initProject({ cwd: root, projectName: "Template Guidance Replace", planning: true, force: true });
  fs.mkdirSync(path.join(root, ".claw", "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "templates", "replace-default.json"),
    `${JSON.stringify(createPlanLikeTemplate({
      id: "replace-default",
      status: "process.active",
      tasks: [
        {
          id: 1,
          title: "Primary task",
          detail: "Run the main work.",
          status: "pending",
          guidance: {
            onDone: {
              default: {
                mergeMode: "replace",
                summary: "Use the template-specific done route.",
                nextsteps: ["Only follow this explicit route."],
                notes: "Default completion wording is intentionally replaced here.",
                recommendedCommands: ["claw plan edit --task demo-task --task-id 2 --task-status in_progress"],
                nextTaskId: 2,
                delegateTruth: false,
              },
            },
          },
        },
        {
          id: 2,
          title: "Second task",
          detail: "Continue to the next step.",
          goalModeDetail: "If Goal Mode is enabled for this project, start Goal Mode.",
          status: "pending",
        },
      ],
    }), null, 2)}\n`,
    "utf-8",
  );

  await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Replace default guidance",
    templateName: "replace-default",
  });

  const taskDone = await editPlan({
    cwd: root,
    taskName: "demo-task",
    taskId: 1,
    taskStatus: "done",
  });

  assert.equal(taskDone.workflowGuidance.summary, "Use the template-specific done route.");
  assert.deepEqual(taskDone.workflowGuidance.nextsteps, ["1. Only follow this explicit route."]);
  assert.equal(taskDone.workflowGuidance.notes, "Default completion wording is intentionally replaced here.");
  assert.deepEqual(taskDone.workflowGuidance.recommendedCommands, [
    "claw plan edit --task demo-task --task-id 2 --task-status in_progress",
  ]);
  assert.equal(taskDone.workflowGuidance.delegateSubagents, undefined);
  assert.equal(taskDone.workflowGuidance.nextTask?.id, 2);
});

test("writePlan rejects legacy template guidance route mode field in favor of mergeMode", async () => {
  const root = createFixture("template-guidance-legacy-mode");
  initProject({ cwd: root, projectName: "Template Guidance Legacy Mode", planning: true, force: true });
  fs.mkdirSync(path.join(root, ".claw", "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "templates", "legacy-mode.json"),
    `${JSON.stringify(createPlanLikeTemplate({
      id: "legacy-mode",
      status: "process.active",
      tasks: [
        {
          id: 1,
          title: "Primary task",
          detail: "Run the main work.",
          status: "pending",
          guidance: {
            onDone: {
              default: {
                mode: "override",
                summary: "This should be rejected.",
              },
            },
          },
        },
        {
          id: 2,
          title: "Activate",
          detail: "Move to process.active.",
          goalModeDetail: "If Goal Mode is enabled for this project, start Goal Mode.",
          status: "pending",
        },
      ],
    }), null, 2)}\n`,
    "utf-8",
  );

  await assert.rejects(
    () =>
      writePlan({
        cwd: root,
        title: "Use invalid legacy route field",
        templateName: "legacy-mode",
      }),
    /Invalid template task|plan-like template|Invalid plan template/i,
  );
});

test("writePlan rejects unresolved placeholders in template recommended commands", async () => {
  const root = createFixture("template-guidance-unresolved-command");
  initProject({ cwd: root, projectName: "Template Placeholder", planning: true, force: true });
  fs.mkdirSync(path.join(root, ".claw", "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "templates", "unresolved-command.json"),
    `${JSON.stringify(createPlanLikeTemplate({
      id: "unresolved-command",
      status: "process.active",
      tasks: [{
        id: 1,
        title: "Primary task",
        status: "pending",
        guidance: {
          onDone: {
            default: {
              recommendedCommands: ["claw plan edit --task {{unknownTask}}"],
            },
          },
        },
      }],
    }), null, 2)}\n`,
    "utf-8",
  );

  await assert.rejects(
    () => writePlan({ cwd: root, title: "Reject unresolved command", templateName: "unresolved-command" }),
    /Invalid template task|plan-like template|Invalid plan template/i,
  );
});

test("writePlan rejects an invalid project template export shape", async () => {
  const root = createFixture("plan-template-project-invalid");
  initProject({ cwd: root, projectName: "Invalid Project Template", planning: true, force: true });
  fs.mkdirSync(path.join(root, ".claw", "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "templates", "broken-template.js"),
    "module.exports = { nope: true };\n",
    "utf-8",
  );

  await assert.rejects(
    () =>
      writePlan({
        cwd: root,
        title: "Use broken template",
        templateName: "broken-template",
      }),
    /template/i,
  );
});

test("plan create guidance leaves requirement judgment to the agent", async () => {
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
  assert.ok(result.workflowGuidance.nextsteps.includes("1. Fill the missing plan fields."));
  assert.ok(result.workflowGuidance.nextsteps.includes("2. Move into `process.active` once requirements are clear."));
  assert.deepEqual(result.workflowGuidance.recommendedCommands, [
    "claw plan edit --task demo-task --plan-status process.active",
    "claw plan edit --task demo-task --patch <updated-plan.json>",
    "claw plan edit --task demo-task --reference-path <path> --reference-why <why>",
  ]);
  assert.equal(
    result.workflowGuidance.notes,
    "Fill only the fields still needed to execute, such as `requirements`, `tasks`, `references`, `rules`, and `keyDecisions`. If scope is still unclear, clarify it with the user before switching to `process.active`.",
  );
});

test("local embedding cache resolver prefers explicit local cache dir over shared default", () => {
  assert.equal(
    resolveLocalEmbeddingCacheDir(
      "Snowflake/snowflake-arctic-embed-m-v2.0",
      path.join("workspace", ".claw", "models"),
      {
        fallbackCacheDir: path.join("sandbox", ".claw", "models"),
        platform: "win32",
        env: { LOCALAPPDATA: "C:\\Users\\demo\\AppData\\Local" },
        homedir: "C:\\Users\\demo",
      },
    ),
    path.resolve(path.join("workspace", ".claw", "models")),
  );
});

test("local embedding cache resolver uses platform shared cache when modelCacheDir is omitted", () => {
  assert.equal(
    resolveDefaultLocalEmbeddingCacheDir({
      platform: "win32",
      env: { LOCALAPPDATA: "C:\\Users\\demo\\AppData\\Local" },
      homedir: "C:\\Users\\demo",
    }),
    path.join("C:\\Users\\demo\\AppData\\Local", "claw", "models"),
  );
  assert.equal(
    resolveDefaultLocalEmbeddingCacheDir({
      platform: "darwin",
      env: {},
      homedir: "/Users/demo",
    }),
    path.join("/Users/demo", "Library", "Caches", "claw", "models"),
  );
  assert.equal(
    resolveDefaultLocalEmbeddingCacheDir({
      platform: "linux",
      env: {},
      homedir: "/home/demo",
    }),
    path.join("/home/demo", ".cache", "claw", "models"),
  );
});

test("local embedding cache resolver reuses global cache when configured local cache does not contain the model", () => {
  const root = createEmptyFixture("embedding-cache-global-hit");
  const localCache = path.join(root, "local-cache");
  const globalCache = path.join(root, "global-cache");
  fs.mkdirSync(localCache, { recursive: true });
  fs.mkdirSync(path.join(globalCache, "Snowflake", "snowflake-arctic-embed-m-v2.0", "onnx"), { recursive: true });

  assert.equal(
    resolveLocalEmbeddingCacheDir(
      "Snowflake/snowflake-arctic-embed-m-v2.0",
      localCache,
      {
        cwd: root,
        platform: "linux",
        env: {},
        homedir: root,
        globalCacheDir: globalCache,
      },
    ),
    globalCache,
  );
});

test("local embedding cache resolver downloads into configured local cache when local and global are both missing", () => {
  const root = createEmptyFixture("embedding-cache-local-download");
  const localCache = path.join(root, "local-cache");
  const globalCache = path.join(root, "global-cache");

  assert.equal(
    resolveLocalEmbeddingCacheDir(
      "Snowflake/snowflake-arctic-embed-m-v2.0",
      localCache,
      {
        cwd: root,
        platform: "linux",
        env: {},
        homedir: root,
        globalCacheDir: globalCache,
      },
    ),
    path.resolve(localCache),
  );
});

test("writePlan uses title as the default goal text for planning-enabled seed plans", async () => {
  const root = createFixture("plan-write-no-goal");

  const result = await writePlan({
    cwd: root,
    title: "Goal later task",
  });

  assert.equal(result.planStatus, "process.discussing");
  assert.equal(result.workflowGuidance.goalMode, undefined);
  assert.equal(result.plan.goal.text, "Goal later task");
  assert.equal(result.plan.tasks.length, 2);
});

test("plan create auto-assigns stable integer task ids when omitted", async () => {
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

test("plan create updates existing task and stores subplans flat without task metadata", async () => {
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

  const parentPlan = JSON.parse(
    fs.readFileSync(path.join(root, ".claw", "tasks", "demo-task", "plan.json"), "utf-8"),
  ) as { tasks: Array<{ title?: string; execution?: { type?: string; subplan?: string } }> };

  assert.equal(result.planFile, "child-plan.json");
  assert.equal(fs.existsSync(path.join(root, ".claw", "tasks", "demo-task", "meta.json")), false);
  assert.equal(parentPlan.tasks[0]?.execution?.type, "subplan");
  assert.equal(parentPlan.tasks[0]?.execution?.subplan, "child-plan.json");
});

test("createSubplan uses the planning-aware default seed shape", async () => {
  const root = createFixture("subplan-create-planning-seed");
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
          detail: "Split this into a subplan",
          status: "pending",
        },
      ],
    },
  });

  const result = await createSubplan({
    cwd: root,
    parentTaskName: "demo-task",
    parentTaskId: 1,
    templateName: "default",
  });

  assert.equal(result.planFile, "Implement-child-work.json");
  assert.equal(result.plan.title, "Implement child work");
  assert.equal(result.plan.status, "process.discussing");
  assert.equal(result.plan.goal.text, "Implement child work: Split this into a subplan");
  assert.equal(result.plan.tasks.length, 2);
  assert.deepEqual(result.workflowGuidance.nextsteps, [
    "Set or overwrite Goal Mode to this subplan objective before doing target work: Using claw-kit, update plan, follow returned workflowGuidance，finish your goal：Implement child work: Split this into a subplan",
    "1. Run one project recall query.",
    "2. Resolve the discussion, then resume through `process.active`.",
  ]);
  assert.equal(result.workflowGuidance.recommendedCommands?.[0], 'claw search --query "<topic>"');
  assert.equal(
    result.workflowGuidance.goalMode?.recommendedObjective,
    "Using claw-kit, update plan, follow returned workflowGuidance，finish your goal：Implement child work: Split this into a subplan",
  );
  assert.equal(result.workflowGuidance.goalMode?.allowOverwrite, true);
  assert.match(result.workflowGuidance.notes ?? "", /parent\/root plan as paused/i);
  assert.equal(result.workflowGuidance.goalTool, undefined);
  assert.match(result.plan.tasks[0]?.detail ?? "", /append executable tasks/i);
  assert.match(result.plan.tasks[1]?.detail ?? "", /process\.active/);
});

test("createSubplan uses project defaultPlanTemplate when templateName is omitted", async () => {
  const root = createFixture("subplan-create-project-default-template");
  initProject({ cwd: root, projectName: "Subplan Project Default Template", planning: true, force: true });
  fs.mkdirSync(path.join(root, ".claw", "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "templates", "team-subplan-default.json"),
    `${JSON.stringify(createPlanLikeTemplate({
      id: "team-subplan-default",
      configOverride: {
        goalMode: false,
        truthDispatch: "final_only",
      },
      tasks: [
        {
          id: 1,
          title: "Refine the child workflow",
          detail: "Use {{planningSkill}} to shape the subplan work.",
          status: "pending",
        },
        {
          id: 2,
          title: "Activate the child workflow",
          detail: "Move to process.active after refinement.",
          goalModeDetail: "Start Goal Mode for this child plan.",
          status: "pending",
        },
      ],
      references: [{ path: "docs/subplan-template.md", why: "Subplan template reference" }],
      rules: ["Follow the project default template for subplans."],
    }), null, 2)}\n`,
    "utf-8",
  );
  const projectConfigPath = path.join(root, ".claw", "project.json");
  const projectConfig = JSON.parse(fs.readFileSync(projectConfigPath, "utf-8")) as Record<string, unknown>;
  projectConfig.defaultPlanTemplate = "team-subplan-default";
  fs.writeFileSync(projectConfigPath, JSON.stringify(projectConfig, null, 2), "utf-8");
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
          detail: "Split this into a subplan",
          status: "pending",
        },
      ],
    },
  });

  const result = await createSubplan({
    cwd: root,
    parentTaskName: "demo-task",
    parentTaskId: 1,
  });

  assert.equal(result.plan.templateId, "team-subplan-default");
  assert.equal(result.plan.title, "Implement child work");
  assert.equal(result.plan.goal.text, "Implement child work: Split this into a subplan");
  assert.deepEqual(result.plan.configOverride, {
    goalMode: false,
    truthDispatch: "final_only",
  });
  assert.equal(result.plan.tasks[0]?.title, "Refine the child workflow");
  assert.equal(result.plan.tasks[1]?.detail, "Move to process.active after refinement.");
  assert.deepEqual(result.plan.references, [{ path: "docs/subplan-template.md", why: "Subplan template reference" }]);
  assert.deepEqual(result.plan.rules, ["Follow the project default template for subplans."]);
  assert.equal(result.workflowGuidance.goalMode, undefined);
});

test("createSubplan always uses planning shape even when project planning is disabled", async () => {
  const root = createFixture("subplan-create-planning-disabled");
  initProject({ cwd: root, projectName: "Subplan Planning Disabled", planning: false, force: true });
  await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Ship the parent plan",
  });

  const patchPath = path.join(root, ".claw", "tasks", "demo-task", "plan.json");
  const parentPlan = JSON.parse(fs.readFileSync(patchPath, "utf-8")) as PlanDocument;
  parentPlan.tasks = [{ id: 1, title: "Implement child work", status: "pending" }];
  fs.writeFileSync(patchPath, JSON.stringify(parentPlan, null, 2), "utf-8");

  const result = await createSubplan({
    cwd: root,
    parentTaskName: "demo-task",
    parentTaskId: 1,
    templateName: "default",
  });

  assert.equal(result.plan.status, "process.discussing");
  assert.equal(result.plan.goal.text, "Implement child work");
  assert.deepEqual(result.plan.tasks.map((task) => task.id), [1, 2]);
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
    planFile: "child-plan.json",
    planStatus: "end.completed",
    patch: {
      retrospective: { summary: "Child complete." },
    },
  });

  const parentPlan = JSON.parse(
    fs.readFileSync(path.join(root, ".claw", "tasks", "demo-task", "plan.json"), "utf-8"),
  ) as { status: string; tasks: Array<{ id: number; status: string }> };
  const childPlan = JSON.parse(
    fs.readFileSync(path.join(root, ".claw", "tasks", "demo-task", "child-plan.json"), "utf-8"),
  ) as { status: string };

  assert.equal(result.planFile, "plan.json");
  assert.equal(result.planStatus, "process.active");
  assert.equal(result.workflowGuidance.stage, "execution");
  assert.equal(result.workflowGuidance.nextTask?.id, 2);
  assert.equal(result.workflowGuidance.nextTask?.title, "Resume parent work");
  assert.equal(result.workflowGuidance.delegateSubagents, undefined);
  assert.equal(fs.existsSync(path.join(root, ".claw", "tasks", "demo-task", "meta.json")), false);
  assert.equal(parentPlan.status, "process.active");
  assert.equal(parentPlan.tasks[0]?.status, "done");
  assert.equal(parentPlan.tasks[1]?.status, "pending");
  assert.equal(childPlan.status, "end.completed");
});

test("writePlan starts directly in process.active when project planning is disabled", async () => {
  const root = createFixture("plan-write-review");
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify({
      version: "0.1.60",
      id: "plan-write-review",
      name: "Plan Write Review",
      planning: false,
      externalPlanningSkill: null,
      maxTasksToKeep: 99,
      goalMode: true,
      truthDispatch: "per_task",
      externalTruthSkill: null,
      externalAdrSkill: null,
      contextPaths: [],
      memory: { enabled: true, externalDocPaths: [], embedding: null },
      gitnexus: false,
    }, null, 2),
    "utf-8",
  );

  const result = await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Ship work directly",
    planStatus: "process.active",
  });

  assert.equal(result.planStatus, "process.active");
  assert.equal(result.planReview, undefined);
  assert.equal(result.plan.tasks.length, 1);
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
  assert.ok(activated.workflowGuidance.goalMode?.recommendedObjective?.includes("Ship the first plan"));
  assert.equal(activated.workflowGuidance.goalMode?.setWhen, "on_enter_process_active");
  assert.ok(activated.workflowGuidance.nextsteps.includes("Sync thread progress with `update_plan`."));
  assert.ok(activated.workflowGuidance.nextsteps.includes("Start with task #1."));

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
  assert.equal(
    result.workflowGuidance.summary,
    "All plan tasks are done. Clear thread progress, deposit confirmed reusable truth when present, then complete the required ADR closeout.",
  );
  assert.equal(
    result.workflowGuidance.notes,
    "Truth dispatch requires the main agent's reusable-value confirmation; ADR dispatch is required but remains asynchronous for root-plan closeout. Root `claw plan done` records completedAt and keeps the plan path readable for at least one hour. Honor every field in a dispatched delegate contract.",
  );
  const truthDelegate = result.workflowGuidance.delegateSubagents?.[0];
  const adrDelegate = result.workflowGuidance.delegateSubagents?.[1];
  assert.ok(truthDelegate);
  assert.ok(adrDelegate);
  assert.equal(truthDelegate.name, "truth-writer");
  assert.equal(truthDelegate.skill, "claw-kit:truth-writer");
  assert.equal(truthDelegate.dispatch, "when_reusable_truth_confirmed");
  assert.equal(truthDelegate.model, "gpt-5.4-mini");
  assert.equal(truthDelegate.fork_context, false);
  assert.equal(truthDelegate.waitForCompletion, false);
  assert.equal(truthDelegate.preferReuseSameTypeInThread, true);
  assert.equal(truthDelegate.closePolicy, "keep_open_for_reuse");
  assert.equal(
    truthDelegate.inputContract,
    "curated completed subtask report containing the reusable facts and evidence needed for deposition; canonical target routing belongs to the truth writer",
  );
  assert.equal(adrDelegate.name, "adr-writer");
  assert.equal(adrDelegate.skill, "claw-kit:adr-writer");
  assert.equal(adrDelegate.dispatch, "required");
  assert.equal(adrDelegate.waitForCompletion, false);
  assert.equal(
    adrDelegate.inputContract,
    "updated active root plan.json path after retrospective and durable keyDecisions are persisted; plan done retains this path for at least one hour so the ADR writer can continue asynchronously; decision extraction and canonical target routing belong to the ADR writer",
  );
  assert.equal(adrDelegate.model, "gpt-5.4-mini");
  assert.equal(adrDelegate.fork_context, false);
  assert.ok(result.workflowGuidance.nextsteps.some((step) => step.includes("truth-writer")));
  assert.ok(result.workflowGuidance.nextsteps.some((step) => step.includes("adr-writer")));
  assert.deepEqual(result.workflowGuidance.nextsteps, [
    "1. Clear thread progress with `update_plan`.",
    "2. Read the returned `truth-writer` entry's `dispatch`. For `when_reusable_truth_confirmed`, the main agent must evaluate reusable truth and dispatch only after confirmation.",
    "3. First write both `retrospective` and `keyDecisions` back into the plan, then execute the `adr-writer` contract with `dispatch: required` using that updated active root `plan.json` path. Do not wait for the writer before running `claw plan done`; delayed archive keeps the path readable for at least one hour.",
  ]);
  assert.deepEqual(result.workflowGuidance.recommendedCommands, [
    "claw plan edit --task demo-task --patch <completed-plan.json>",
    "claw plan done --task demo-task --summary \"<retrospective summary>\"",
  ]);
});

test("plan edit rejects entering process.active without goal text", async () => {
  const root = createFixture("plan-edit-active-requires-goal");
  await writePlan({
    cwd: root,
    title: "Goal later task",
    content: {
      title: "Goal later task",
      status: "prepare.requirements",
      goal: { text: "" },
      tasks: [],
    },
  });

  await assert.rejects(
    () =>
      editPlan({
        cwd: root,
        taskName: "Goal-later-task",
        planStatus: "process.active",
      }),
    /goal\.text is required before the plan can leave prepare\.requirements/,
  );
});

test("plan edit process.wait guidance pauses goal mode and points resume back to active", async () => {
  const root = createFixture("plan-edit-wait-guidance");
  await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Pause execution cleanly",
    content: {
      title: "Demo task",
      status: "process.active",
      goal: { text: "Pause execution cleanly" },
      tasks: [{ id: 1, title: "Implement work", status: "in_progress" }],
    },
  });

  const paused = await editPlan({
    cwd: root,
    taskName: "demo-task",
    planStatus: "process.wait",
  });

  assert.equal(paused.planStatus, "process.wait");
  assert.equal(paused.workflowGuidance.stage, "paused");
  assert.deepEqual(paused.workflowGuidance.nextsteps, [
    "1. Use `update_goal(status=\"blocked\")` to end the current active thread goal.",
    "2. When resuming the plan, restore the active thread goal after re-entering `process.active`.",
    "3. Resume through `process.active` when execution should continue.",
  ]);
  assert.deepEqual(paused.workflowGuidance.recommendedCommands, [
    "claw plan edit --task demo-task --plan-status process.active",
  ]);
  assert.deepEqual(paused.workflowGuidance.goalTool, {
    tool: "update_goal",
    status: "blocked",
    reason: "Execution is paused in `process.wait`, so the current active thread goal should be ended as blocked until work resumes.",
  });
  assert.equal(paused.workflowGuidance.goalMode, undefined);
});

test("plan edit process.discussing guidance pauses goal mode and waits for discussion resolution", async () => {
  const root = createFixture("plan-edit-discussing-guidance");
  await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Discuss the next route",
    content: {
      title: "Demo task",
      status: "process.active",
      goal: { text: "Discuss the next route" },
      tasks: [{ id: 1, title: "Decide route", status: "in_progress" }],
    },
  });

  const discussing = await editPlan({
    cwd: root,
    taskName: "demo-task",
    planStatus: "process.discussing",
  });

  assert.equal(discussing.planStatus, "process.discussing");
  assert.equal(discussing.workflowGuidance.stage, "discussion");
  assert.deepEqual(discussing.workflowGuidance.nextsteps, [
    "1. Use `update_goal(status=\"blocked\")` to end the current active thread goal.",
    "2. When resuming the plan, restore the active thread goal after re-entering `process.active`.",
    "3. Resolve the discussion, then resume through `process.active`.",
  ]);
  assert.deepEqual(discussing.workflowGuidance.recommendedCommands, [
    "claw plan edit --task demo-task --plan-status process.active",
  ]);
  assert.deepEqual(discussing.workflowGuidance.goalTool, {
    tool: "update_goal",
    status: "blocked",
    reason: "Execution is paused in `process.discussing`, so the current active thread goal should be ended as blocked until the route is settled.",
  });
  assert.equal(discussing.workflowGuidance.goalMode, undefined);
});

test("resuming from process.wait to process.active re-emits goal mode guidance", async () => {
  const root = createFixture("plan-edit-resume-from-wait");
  await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Resume execution with goal mode",
    content: {
      title: "Demo task",
      status: "process.wait",
      goal: { text: "Resume execution with goal mode" },
      tasks: [{ id: 1, title: "Implement work", status: "pending" }],
    },
  });

  const resumed = await editPlan({
    cwd: root,
    taskName: "demo-task",
    planStatus: "process.active",
  });

  assert.equal(resumed.planStatus, "process.active");
  assert.equal(resumed.workflowGuidance.stage, "execution");
  assert.equal(resumed.workflowGuidance.goalMode?.setWhen, "on_resume_process_active");
  assert.ok(resumed.workflowGuidance.goalMode?.recommendedObjective?.includes("Resume execution with goal mode"));
  assert.deepEqual(resumed.workflowGuidance.goalTool, {
    tool: "create_goal",
    objective: "Using claw-kit, update plan, follow returned workflowGuidance，finish your goal：Resume execution with goal mode",
    allowOverwrite: true,
    reason: "Execution is resuming from a paused process state, so the thread should restore an active Codex goal for the plan goal.",
  });
  assert.equal(
    resumed.workflowGuidance.notes,
    "The plan is moving back from a paused status into active execution, so Goal Mode should be restored to the active state before work resumes.",
  );
  assert.deepEqual(resumed.workflowGuidance.nextsteps, [
    "Sync thread progress with `update_plan`.",
    "Restore Goal Mode to the active state.",
    "Resume with task #1.",
  ]);
  assert.ok(resumed.workflowGuidance.nextsteps.includes("Sync thread progress with `update_plan`."));
});

test("end.completed emits complete goal tool guidance", async () => {
  const root = createFixture("end-completed-goal-tool");
  await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Finish the plan",
    content: {
      title: "Demo task",
      status: "process.active",
      goal: { text: "Finish the plan" },
      tasks: [{ id: 1, title: "Implement work", status: "done" }],
      retrospective: { summary: "Done." },
    },
  });

  const result = await editPlan({
    cwd: root,
    taskName: "demo-task",
    planStatus: "end.completed",
  });

  assert.equal(result.workflowGuidance.stage, "done");
  assert.match(showPlan({ cwd: root, taskName: "demo-task" }).plan.completedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(result.workflowGuidance.nextsteps, [
    "1. Use `update_goal(status=\"complete\")` to close the active thread goal for this plan.",
    "2. Finish any remaining workflow-guided closeout work such as archive or parent-plan resumption.",
    "3. Do not continue ad hoc in this thread. Start the next task only through `using-claw-kit`, then follow the returned `workflowGuidance`.",
  ]);
  assert.deepEqual(result.workflowGuidance.goalTool, {
    tool: "update_goal",
    status: "complete",
    reason: "The plan has reached completion, so the active thread goal should be marked complete.",
  });
});

test("process entry returns the first task and task completion returns truth-writer contract before plan completion", async () => {
  const root = createFixture("process-entry-and-truth-contract");
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify(
      {
        version: "0.1.60",
        id: "process-entry-and-truth-contract",
        name: "Process Entry And Truth Contract",
        maxTasksToKeep: 99,
        goalMode: true,
        truthDispatch: "per_task",
        externalTruthSkill: "external-truth-writer",
        externalAdrSkill: null,
        contextPaths: [],
        memory: {
          enabled: true,
          externalDocPaths: [],
          embedding: {
            provider: "local",
            model: "Snowflake/snowflake-arctic-embed-xs",
            local: {
              modelCacheDir: ".claw/models",
            },
          },
        },
        gitnexus: false,
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
    taskDone.workflowGuidance.notes,
    "In `process.active`, keep moving unless there is a real blocker or explicit user interruption. Evaluate confirmed reusable truth before truth dispatch; when dispatching the writer, honor every field in its delegate contract.",
  );
  assert.deepEqual(taskDone.workflowGuidance.nextsteps, [
    "1. Sync thread progress with `update_plan`.",
    "2. Read the returned `truth-writer` entry's `dispatch`. For `when_reusable_truth_confirmed`, the main agent must evaluate reusable truth and dispatch only after confirmation.",
    "3. Continue with task #2.",
  ]);
  assert.equal(taskDone.workflowGuidance.delegateSubagents?.[0]?.skill, "external-truth-writer");
  assert.equal(taskDone.workflowGuidance.delegateSubagents?.[0]?.dispatch, "when_reusable_truth_confirmed");
  assert.equal(taskDone.workflowGuidance.delegateSubagents?.[0]?.fork_context, false);
});

test("resolveContext deep-merges project-override.json and preserves explicit null overrides", () => {
  const root = createFixture("project-override-merge");
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify(
      {
        version: "0.1.60",
        id: "project-override-merge",
        name: "Project Override Merge",
        maxTasksToKeep: 99,
        goalMode: true,
        truthDispatch: "per_task",
        externalTruthSkill: "team-truth-writer",
        externalAdrSkill: "team-adr-writer",
        contextPaths: ["docs/team.md"],
        memory: {
          enabled: true,
          externalDocPaths: ["docs/"],
          embedding: {
            provider: "local",
            model: "Snowflake/snowflake-arctic-embed-xs",
          },
        },
        gitnexus: false,
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(root, ".claw", "project-override.json"),
    JSON.stringify(
      {
        externalTruthSkill: null,
        goalMode: false,
        contextPaths: ["docs/personal.md"],
        memory: {
          embedding: {
            model: "Snowflake/snowflake-arctic-embed-m-v2.0",
          },
        },
      },
      null,
      2,
    ),
    "utf-8",
  );

  const result = resolveContext(root);

  assert.equal(result.project.projectConfig?.externalTruthSkill, null);
  assert.equal(result.project.projectConfig?.externalAdrSkill, "team-adr-writer");
  assert.deepEqual(result.project.projectConfig?.contextPaths, ["docs/personal.md"]);
  assert.equal(result.project.projectConfig?.goalMode, false);
  assert.equal(result.project.projectConfig?.truthDispatch, "per_task");
  assert.equal(result.project.projectConfig?.memory?.embedding?.model, "Snowflake/snowflake-arctic-embed-m-v2.0");
});

test("resolveContext deep-merges defaultPlanTemplate from project-override.json", () => {
  const root = createFixture("project-override-default-template");
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify(
      {
        id: "project-override-default-template",
        name: "Project Override Default Template",
        maxTasksToKeep: 99,
        planning: true,
        goalMode: true,
        truthDispatch: "per_task",
        externalPlanningSkill: null,
        externalTruthSkill: null,
        externalAdrSkill: null,
        defaultPlanTemplate: "team-default",
        contextPaths: [],
        memory: {
          externalDocPaths: [],
          embedding: {
            provider: "local",
            model: "Snowflake/snowflake-arctic-embed-m-v2.0",
          },
        },
        gitnexus: false,
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(root, ".claw", "project-override.json"),
    JSON.stringify(
      {
        defaultPlanTemplate: "personal-default",
      },
      null,
      2,
    ),
    "utf-8",
  );

  const result = resolveContext(root);

  assert.equal(result.project.projectConfig?.defaultPlanTemplate, "personal-default");
});

test("workflow guidance respects disabled goal mode and final-only truth dispatch from effective project config", async () => {
  const root = createFixture("workflow-guidance-config-toggles");
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify(
      {
        version: "0.1.60",
        id: "workflow-guidance-config-toggles",
        name: "Workflow Guidance Config Toggles",
        maxTasksToKeep: 99,
        goalMode: true,
        truthDispatch: "per_task",
        externalTruthSkill: "external-truth-writer",
        externalAdrSkill: "external-adr-writer",
        contextPaths: [],
        memory: {
          enabled: true,
          externalDocPaths: [],
          embedding: {
            provider: "local",
            model: "Snowflake/snowflake-arctic-embed-xs",
          },
        },
        gitnexus: false,
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(root, ".claw", "project-override.json"),
    JSON.stringify(
      {
        goalMode: false,
        truthDispatch: "final_only",
      },
      null,
      2,
    ),
    "utf-8",
  );

  const written = await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Respect workflow toggles",
    content: {
      title: "Demo task",
      status: "prepare.requirements",
      goal: { text: "Respect workflow toggles" },
      tasks: [
        { id: 1, title: "First task", status: "pending" },
        { id: 2, title: "Second task", status: "pending" },
      ],
    },
  });
  assert.equal(written.workflowGuidance.goalMode, undefined);

  const activated = await editPlan({
    cwd: root,
    taskName: "demo-task",
    planStatus: "process.active",
  });
  assert.equal(activated.workflowGuidance.goalMode, undefined);

  const taskDone = await editPlan({
    cwd: root,
    taskName: "demo-task",
    taskId: 1,
    taskStatus: "done",
  });
  assert.equal(taskDone.workflowGuidance.delegateSubagents, undefined);
  assert.equal(taskDone.workflowGuidance.nextsteps.some((step) => step.includes("truth-writer")), false);

  const allDone = await editPlan({
    cwd: root,
    taskName: "demo-task",
    taskId: 2,
    taskStatus: "done",
  });
  assert.equal(allDone.workflowGuidance.delegateSubagents?.[0]?.name, "truth-writer");
  assert.equal(allDone.workflowGuidance.delegateSubagents?.[1]?.name, "adr-writer");
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

test("atomic plan start refines, appends, completes bridge tasks, and emits one mutation stream", async () => {
  const root = createFixture("plan-start-atomic");
  await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Start atomically",
  });

  const result = await editPlan({
    cwd: root,
    taskName: "demo-task",
    patch: {
      requirements: {
        summary: "Refined once",
        openQuestions: [],
        acceptanceCriteria: ["Atomic start succeeds"],
      },
    },
    appendTasks: [
      { title: "Implement outcome", status: "pending" } as unknown as { id: number; title: string; status: "pending" },
    ],
    planStatus: "process.active",
    completeLifecycleBridge: true,
    commandSource: "plan.start",
  });

  assert.equal(result.planStatus, "process.active");
  assert.deepEqual(result.plan.tasks.map((task) => task.status), ["done", "done", "pending"]);
  assert.deepEqual(result.changedTaskIds, [1, 2]);
  assert.deepEqual(result.appendedTaskIds, [3]);
  assert.deepEqual(result.events.map((event) => event.type), [
    "plan_changed",
    "plan_task_completed",
    "plan_task_completed",
    "plan_activated",
  ]);
  assert.equal(new Set(result.events.map((event) => event.mutationId)).size, 1);
  assert.ok(result.events.every((event) => event.schemaVersion === 1));
  assert.ok(result.events.every((event) => event.commandSource === "plan.start"));
  assert.equal(new Set(result.events.map((event) => event.eventId)).size, result.events.length);
});

test("atomic plan start validation failure leaves the plan unchanged", async () => {
  const root = createFixture("plan-start-rollback");
  await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Reject incompatible bridge",
    content: {
      title: "Demo task",
      status: "process.discussing",
      goal: { text: "Reject incompatible bridge" },
      tasks: [{ id: 1, title: "Custom planning task", status: "pending" }],
    },
  });

  await assert.rejects(
    editPlan({
      cwd: root,
      taskName: "demo-task",
      appendTasks: [
        { title: "Must not persist", status: "pending" } as unknown as { id: number; title: string; status: "pending" },
      ],
      planStatus: "process.active",
      completeLifecycleBridge: true,
      commandSource: "plan.start",
    }),
    /both default lifecycle bridge tasks/,
  );
  const plan = showPlan({ cwd: root, taskName: "demo-task" }).plan;
  assert.equal(plan.status, "process.discussing");
  assert.deepEqual(plan.tasks.map((task) => task.title), ["Custom planning task"]);
});

test("plan edit appendTasks defaults omitted task status to pending", async () => {
  const root = createFixture("plan-edit-default-task-status");
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

  const result = await editPlan({
    cwd: root,
    taskName: "demo-task",
    appendTasks: [
      { title: "Task without status" } as unknown as { id: number; title: string; status: "pending" },
    ],
  });

  assert.deepEqual(
    result.planView.tasks.items.map((task) => ({ id: task.id, title: task.title, status: task.status })),
    [
      { id: 1, title: "Task without status", status: "pending" },
    ],
  );
});

test("plan edit patch tasks defaults omitted task status to pending", async () => {
  const root = createFixture("plan-edit-patch-default-task-status");
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

  const result = await editPlan({
    cwd: root,
    taskName: "demo-task",
    patch: {
      tasks: [
        { id: 5, title: "Patched task without status" } as unknown as { id: number; title: string; status: "pending" },
      ],
    },
  });

  assert.deepEqual(
    result.planView.tasks.items.map((task) => ({ id: task.id, title: task.title, status: task.status })),
    [
      { id: 5, title: "Patched task without status", status: "pending" },
    ],
  );
});

test("plan edit patch merges nested requirement objects and preserves untouched fields", async () => {
  const root = createFixture("plan-edit-merge-patch-requirements");
  await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Keep merge patch expectations stable",
    content: {
      title: "Demo task",
      status: "process.active",
      goal: { text: "Keep merge patch expectations stable" },
      requirements: {
        summary: "Initial summary",
        openQuestions: ["Question A"],
        acceptanceCriteria: ["Criterion A"],
      },
      tasks: [],
    },
  });

  const result = await editPlan({
    cwd: root,
    taskName: "demo-task",
    patch: {
      requirements: {
        summary: "Updated summary",
      } as unknown as PlanDocument["requirements"],
    },
  });

  const finalPlan = showPlan({
    cwd: root,
    taskName: "demo-task",
  }).plan;

  assert.deepEqual(finalPlan.requirements, {
    summary: "Updated summary",
    openQuestions: ["Question A"],
    acceptanceCriteria: ["Criterion A"],
  });
});

test("plan edit patch uses null to delete optional object fields", async () => {
  const root = createFixture("plan-edit-merge-patch-null-delete");
  await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Allow null deletes",
    content: {
      title: "Demo task",
      status: "process.active",
      goal: { text: "Allow null deletes" },
      summary: "Detailed summary",
      references: [{ path: "docs/example.md", why: "carry context" }],
      tasks: [],
    },
  });

  const result = await editPlan({
    cwd: root,
    taskName: "demo-task",
    patch: {
      summary: null,
      references: null,
    } as unknown as Partial<PlanDocument>,
  });

  const finalPlan = showPlan({
    cwd: root,
    taskName: "demo-task",
  }).plan;

  assert.equal(finalPlan.summary, undefined);
  assert.equal(finalPlan.references, undefined);
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

  assert.deepEqual(result.workflowGuidance.nextsteps, ["Continue with task #1."]);
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
      completedAt: "2020-01-01T00:00:00.000Z",
      goal: { text: "Show archived plan" },
      tasks: [{ id: 1, title: "Done task", status: "done" }],
      retrospective: { summary: "Archived." },
    },
  });

  const project = resolveContext(root).project;
  enforceTaskRetention(project, "archived-task", Date.parse("2020-01-01T01:00:00.000Z"));

  const result = showPlan({
    cwd: root,
    taskName: "archived-task",
  });

  assert.equal(result.archived, true);
  assert.match(result.planPath, /archive[\\/]tasks[\\/]archived-task[\\/].*plan\.json$/);
  assert.equal(result.plan.title, "Archived task");
  assert.equal(result.planView.collapsedSummary, "1/1 Archived task");
});

test("switch-task returns transient lineage without writing task metadata", async () => {
  const root = createFixture("switch-task");
  await writePlan({ cwd: root, taskName: "source-task", title: "Source", goalText: "Source goal" });
  await writePlan({ cwd: root, taskName: "target-task", title: "Target", goalText: "Target goal" });

  const result = switchTask({
    cwd: root,
    fromTask: "source-task",
    toTask: "target-task",
  });

  assert.equal(result.leaveState.toTask, "target-task");
  assert.match(result.sourcePlanPath, /source-task[\\/]plan\.json$/);
  assert.match(result.targetPlanPath ?? "", /target-task[\\/]plan\.json$/);
  assert.equal(fs.existsSync(path.join(root, ".claw", "tasks", "source-task", "meta.json")), false);
  assert.equal(fs.existsSync(path.join(root, ".claw", "tasks", "target-task", "meta.json")), false);
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
          embedding: {
            provider: "local",
            model: "Snowflake/snowflake-arctic-embed-xs",
            local: {
              modelCacheDir: path.join(root, ".model-cache"),
            },
          },
        },
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.mkdirSync(path.join(root, ".claw", "truth", "features"), { recursive: true });
  fs.writeFileSync(path.join(root, ".claw", "memory.md"), "project alpha memory\n", "utf-8");
  fs.writeFileSync(path.join(root, ".claw", "truth", "shared.md"), "shared beta truth\n", "utf-8");
  fs.writeFileSync(path.join(root, ".claw", "truth", "SUMMARY.md"), "root navigation\n", "utf-8");
  fs.writeFileSync(path.join(root, ".claw", "truth", "features", "SUMMARY.md"), "module navigation\n", "utf-8");
  fs.writeFileSync(path.join(root, "docs", "guide.md"), "zeta external doc\n", "utf-8");
  fs.writeFileSync(path.join(root, "docs", "notes.txt"), "legacy txt doc\n", "utf-8");
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

  const previousMockEnv = process.env.CLAW_EMBEDDING_MOCK;
  process.env.CLAW_EMBEDDING_MOCK = "1";

  try {
    const projectIndex = buildMemoryIndex({ cwd: root });
    const taskIndex = buildMemoryIndex({ cwd: root, scope: "task", taskName: "demo-task" });
    const projectSearch = searchMemory({ cwd: root, query: "alpha" });
    const externalSearch = searchMemory({ cwd: root, query: "zeta" });
    const txtSearch = searchMemory({ cwd: root, query: "legacy" });
    const taskSearch = searchMemory({ cwd: root, scope: "task", taskName: "demo-task", query: "gamma" });
    const taskMemory = getMemory({ cwd: root, scope: "task", taskName: "demo-task" });

    assert.equal(projectIndex.scope, "project");
    assert.equal(taskIndex.scope, "task");
    assert.deepEqual(projectIndex.embedding, {
      provider: "local",
      model: "Snowflake/snowflake-arctic-embed-xs",
      local: {
        modelCacheDir: path.join(root, ".model-cache"),
      },
    });
    assert.ok(projectSearch.results.some((item) => item.sourcePath.endsWith(path.join(".claw", "memory.md"))));
    assert.ok(projectIndex.sources.some((item) => item.endsWith(path.join(".claw", "truth", "shared.md"))));
    assert.equal(projectIndex.sources.some((item) => path.basename(item).toLowerCase() === "summary.md"), false);
    assert.ok(projectIndex.sources.some((item) => item.endsWith(path.join("docs", "guide.md"))));
    assert.equal(projectIndex.sources.some((item) => item.endsWith(path.join("docs", "notes.txt"))), false);
    assert.ok(externalSearch.results.some((item) => item.sourcePath.endsWith(path.join("docs", "guide.md"))));
    assert.equal(txtSearch.results.some((item) => item.sourcePath.endsWith(path.join("docs", "notes.txt"))), false);
    assert.ok(taskSearch.results.some((item) => item.kind === "active_plan"));
    assert.equal(taskMemory.sources[0]?.kind, "active_plan");
  } finally {
    if (previousMockEnv === undefined) {
      delete process.env.CLAW_EMBEDDING_MOCK;
    } else {
      process.env.CLAW_EMBEDDING_MOCK = previousMockEnv;
    }
  }
});

test("project search rejects queries when no vector index is available", () => {
  const root = createFixture("memory-search-no-vectors");
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify(
      {
        version: "0.1.60",
        id: "memory-search-no-vectors",
        name: "Memory Search No Vectors",
        maxTasksToKeep: 99,
        planning: true,
        goalMode: true,
        truthDispatch: "per_task",
        externalPlanningSkill: null,
        externalTruthSkill: null,
        externalAdrSkill: null,
        defaultPlanTemplate: null,
        contextPaths: [],
        memory: {
          enabled: false,
          externalDocPaths: [],
          embedding: {
            provider: "local",
            model: "Snowflake/snowflake-arctic-embed-xs",
            local: {
              modelCacheDir: ".claw/models",
            },
          },
        },
        gitnexus: false,
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.writeFileSync(path.join(root, ".claw", "memory.md"), "project alpha memory\n", "utf-8");

  assert.throws(
    () => searchMemory({ cwd: root, query: "alpha" }),
    /memory is disabled/i,
  );
});

/* test("project keyword search plan keeps exact multi-term query and per-term Chinese fallbacks", () => {
  assert.deepEqual(
    buildProjectKeywordSearchPlan("搜打撤 哈基宝"),
    [
      { query: "\"搜打撤\" AND \"哈基宝\"", matchedTerms: ["搜打撤", "哈基宝"] },
      { query: "\"搜打撤\"", matchedTerms: ["搜打撤"] },
      { query: "\"哈基宝\"", matchedTerms: ["哈基宝"] },
    ],
  );
});

test("project search keeps recall for multi-term Chinese queries across different markdown docs", { concurrency: false }, () => {
  const root = createFixture("memory-search-chinese-multi-term");
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify(
      {
        id: "memory-search-chinese-multi-term",
        memory: {
          externalDocPaths: ["docs/"],
          embedding: {
            provider: "local",
            model: "Snowflake/snowflake-arctic-embed-xs",
            local: {
              modelCacheDir: path.join(root, ".model-cache"),
            },
          },
        },
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, ".claw", "memory.md"), "项目检索记忆\n", "utf-8");
  fs.writeFileSync(path.join(root, ".claw", "truth", "shared.md"), "共享中文 truth\n", "utf-8");
  fs.writeFileSync(path.join(root, "docs", "sdtz.md"), "这里记录搜打撤模式的说明\n", "utf-8");
  fs.writeFileSync(path.join(root, "docs", "hjb.md"), "这里记录哈基宝的说明\n", "utf-8");

  const previousMockEnv = process.env.CLAW_EMBEDDING_MOCK;
  process.env.CLAW_EMBEDDING_MOCK = "1";

  try {
    buildMemoryIndex({ cwd: root });

    const firstTerm = searchMemory({ cwd: root, query: "搜打撤" });
    const secondTerm = searchMemory({ cwd: root, query: "哈基宝" });
    const multiTerm = searchMemory({ cwd: root, query: "搜打撤 哈基宝", limit: 5 });

    assert.ok(firstTerm.results.some((item) => item.sourcePath.endsWith(path.join("docs", "sdtz.md"))));
    assert.ok(secondTerm.results.some((item) => item.sourcePath.endsWith(path.join("docs", "hjb.md"))));
    assert.ok(multiTerm.results.some((item) => item.sourcePath.endsWith(path.join("docs", "sdtz.md"))));
    assert.ok(multiTerm.results.some((item) => item.sourcePath.endsWith(path.join("docs", "hjb.md"))));
  } finally {
    if (previousMockEnv === undefined) {
      delete process.env.CLAW_EMBEDDING_MOCK;
    } else {
      process.env.CLAW_EMBEDDING_MOCK = previousMockEnv;
    }
  }
});

*/

test("project keyword search plan keeps exact multi-term query and per-term Chinese fallbacks", () => {
  assert.deepEqual(
    buildProjectKeywordSearchPlan("\u641c\u6253\u64a4 \u54c8\u57fa\u5b9d"),
    [
      {
        query: "\"\u641c\u6253\u64a4\" AND \"\u54c8\u57fa\u5b9d\"",
        matchedTerms: ["\u641c\u6253\u64a4", "\u54c8\u57fa\u5b9d"],
        substringTerms: [],
      },
      {
        query: "\"\u641c\u6253\u64a4\"",
        matchedTerms: ["\u641c\u6253\u64a4"],
        substringTerms: [],
      },
      {
        query: "\"\u54c8\u57fa\u5b9d\"",
        matchedTerms: ["\u54c8\u57fa\u5b9d"],
        substringTerms: [],
      },
    ],
  );
});

test("project keyword search plan uses substring fallback for short Chinese terms", () => {
  assert.deepEqual(
    buildProjectKeywordSearchPlan("\u641c\u6253 \u54c8\u57fa"),
    [
      {
        query: null,
        matchedTerms: ["\u641c\u6253", "\u54c8\u57fa"],
        substringTerms: ["\u641c\u6253", "\u54c8\u57fa"],
      },
      {
        query: null,
        matchedTerms: ["\u641c\u6253"],
        substringTerms: ["\u641c\u6253"],
      },
      {
        query: null,
        matchedTerms: ["\u54c8\u57fa"],
        substringTerms: ["\u54c8\u57fa"],
      },
    ],
  );
});

test("project keyword extraction keeps meaningful Chinese terms from conversational queries", () => {
  assert.deepEqual(
    extractProjectKeywordTerms("\u4e4b\u524d\u8ba8\u8bba\u7684\u90a3\u4e2a\u641c\u6253\u64a4\u65b9\u6848"),
    ["\u8ba8\u8bba", "\u641c\u6253\u64a4", "\u65b9\u6848"],
  );
});

test("project keyword extraction drops OpenClaw-style English stop words", () => {
  assert.deepEqual(
    extractProjectKeywordTerms("please show me that thing we discussed about the extraction API"),
    ["discussed", "extraction", "api"],
  );
});

test("project keyword search plan skips weak standalone fallback terms from conversational Chinese queries", () => {
  assert.deepEqual(
    buildProjectKeywordSearchPlan("\u4e4b\u524d\u8ba8\u8bba\u7684\u90a3\u4e2a\u641c\u6253\u64a4\u65b9\u6848"),
    [
      {
        query: "\"\u641c\u6253\u64a4\"",
        matchedTerms: ["\u8ba8\u8bba", "\u641c\u6253\u64a4", "\u65b9\u6848"],
        substringTerms: ["\u8ba8\u8bba", "\u65b9\u6848"],
      },
      {
        query: "\"\u641c\u6253\u64a4\"",
        matchedTerms: ["\u641c\u6253\u64a4", "\u65b9\u6848"],
        substringTerms: ["\u65b9\u6848"],
      },
      {
        query: "\"\u641c\u6253\u64a4\"",
        matchedTerms: ["\u641c\u6253\u64a4"],
        substringTerms: [],
      },
    ],
  );
});

test("project query intent uses strong terms for conversational Chinese embedding text", () => {
  assert.deepEqual(
    buildProjectQueryIntent("\u4e4b\u524d\u8ba8\u8bba\u7684\u90a3\u4e2a\u641c\u6253\u64a4\u65b9\u6848"),
    {
      terms: ["\u8ba8\u8bba", "\u641c\u6253\u64a4", "\u65b9\u6848"],
      strongTerms: ["\u641c\u6253\u64a4"],
      weakTerms: ["\u8ba8\u8bba", "\u65b9\u6848"],
      embeddingText: "\u641c\u6253\u64a4",
    },
  );
});

test("project search skips the embedding worker for a unique exact filename hit", { concurrency: false }, () => {
  const root = createFixture("memory-search-lexical-fast-path");
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify({
      id: "memory-search-lexical-fast-path",
      memory: {
        externalDocPaths: ["docs/"],
        embedding: {
          provider: "local",
          model: "Snowflake/snowflake-arctic-embed-xs",
          local: { modelCacheDir: path.join(root, ".model-cache") },
        },
      },
    }, null, 2),
    "utf-8",
  );
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, ".claw", "memory.md"), "project notes\n", "utf-8");
  fs.writeFileSync(path.join(root, "docs", "coldstarttarget.md"), "focused implementation notes\n", "utf-8");
  fs.writeFileSync(path.join(root, "docs", "other.md"), "unrelated notes\n", "utf-8");

  const previousMockEnv = process.env.CLAW_EMBEDDING_MOCK;
  const previousTimeoutEnv = process.env.CLAW_EMBEDDING_WORKER_TIMEOUT_MS;
  process.env.CLAW_EMBEDDING_MOCK = "1";
  try {
    buildMemoryIndex({ cwd: root });
    delete process.env.CLAW_EMBEDDING_MOCK;
    process.env.CLAW_EMBEDDING_WORKER_TIMEOUT_MS = "1";

    const result = searchMemory({ cwd: root, query: "coldstarttarget", limit: 5 });
    assert.equal(path.basename(result.results[0]?.sourcePath ?? ""), "coldstarttarget.md");
    assert.equal(result.telemetry.route, "lexical_fast_path");
    assert.equal(result.telemetry.queryEmbedding, "skipped");
  } finally {
    if (previousMockEnv === undefined) {
      delete process.env.CLAW_EMBEDDING_MOCK;
    } else {
      process.env.CLAW_EMBEDDING_MOCK = previousMockEnv;
    }
    if (previousTimeoutEnv === undefined) {
      delete process.env.CLAW_EMBEDDING_WORKER_TIMEOUT_MS;
    } else {
      process.env.CLAW_EMBEDDING_WORKER_TIMEOUT_MS = previousTimeoutEnv;
    }
  }
});

test("project search reuses query embeddings by final embedding text", { concurrency: false }, () => {
  const root = createFixture("memory-search-query-cache");
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify({
      id: "memory-search-query-cache",
      memory: {
        externalDocPaths: ["docs/"],
        embedding: {
          provider: "local",
          model: "Snowflake/snowflake-arctic-embed-xs",
          local: { modelCacheDir: path.join(root, ".model-cache") },
        },
      },
    }, null, 2),
    "utf-8",
  );
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, ".claw", "memory.md"), "project notes\n", "utf-8");
  fs.writeFileSync(path.join(root, "docs", "sdtz.md"), "这里记录搜打撤模式说明\n", "utf-8");

  const previousMockEnv = process.env.CLAW_EMBEDDING_MOCK;
  process.env.CLAW_EMBEDDING_MOCK = "1";
  try {
    const index = buildMemoryIndex({ cwd: root });
    const firstSearch = searchMemory({ cwd: root, query: "之前讨论的那个搜打撤方案" });
    const secondSearch = searchMemory({ cwd: root, query: "之后讨论的搜打撤方案" });
    assert.equal(firstSearch.telemetry.route, "hybrid");
    assert.equal(firstSearch.telemetry.queryEmbedding, "generated");
    assert.equal(firstSearch.telemetry.embeddingRuntime, "mock");
    assert.equal(secondSearch.telemetry.queryEmbedding, "cache_hit");
    assert.equal(secondSearch.telemetry.embeddingRuntime, undefined);

    const db = new DatabaseSync(index.storePath);
    try {
      const rows = db
        .prepare("SELECT query_text, dimensions FROM query_embeddings")
        .all() as Array<{ query_text: string; dimensions: number }>;
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.query_text, "搜打撤");
      assert.ok((rows[0]?.dimensions ?? 0) > 0);
    } finally {
      db.close();
    }
  } finally {
    if (previousMockEnv === undefined) {
      delete process.env.CLAW_EMBEDDING_MOCK;
    } else {
      process.env.CLAW_EMBEDDING_MOCK = previousMockEnv;
    }
  }
});

test("project query embedding cache resets when embedding config changes", { concurrency: false }, () => {
  const root = createFixture("memory-search-query-cache-config-reset");
  const projectPath = path.join(root, ".claw", "project.json");
  const writeProjectConfig = (model: string): void => {
    fs.writeFileSync(
      projectPath,
      JSON.stringify({
        id: "memory-search-query-cache-config-reset",
        memory: {
          externalDocPaths: ["docs/"],
          embedding: {
            provider: "local",
            model,
            local: { modelCacheDir: path.join(root, ".model-cache") },
          },
        },
      }, null, 2),
      "utf-8",
    );
  };
  writeProjectConfig("Snowflake/snowflake-arctic-embed-xs");
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, ".claw", "memory.md"), "project notes\n", "utf-8");
  fs.writeFileSync(path.join(root, "docs", "guide.md"), "semantic fallback target\n", "utf-8");

  const previousMockEnv = process.env.CLAW_EMBEDDING_MOCK;
  process.env.CLAW_EMBEDDING_MOCK = "1";
  try {
    const index = buildMemoryIndex({ cwd: root });
    searchMemory({ cwd: root, query: "please recall the semantic fallback target we discussed" });
    const firstDb = new DatabaseSync(index.storePath);
    let firstFingerprint = "";
    try {
      const row = firstDb
        .prepare("SELECT embedding_fingerprint FROM query_embeddings")
        .get() as { embedding_fingerprint: string };
      firstFingerprint = row.embedding_fingerprint;
    } finally {
      firstDb.close();
    }

    writeProjectConfig("Snowflake/snowflake-arctic-embed-xs-v2");
    buildMemoryIndex({ cwd: root });
    const resetDb = new DatabaseSync(index.storePath);
    try {
      const row = resetDb.prepare("SELECT COUNT(*) AS count FROM query_embeddings").get() as { count: number };
      assert.equal(row.count, 0);
    } finally {
      resetDb.close();
    }

    searchMemory({ cwd: root, query: "please recall the semantic fallback target we discussed" });
    const secondDb = new DatabaseSync(index.storePath);
    try {
      const rows = secondDb
        .prepare("SELECT embedding_fingerprint FROM query_embeddings")
        .all() as Array<{ embedding_fingerprint: string }>;
      assert.equal(rows.length, 1);
      assert.notEqual(rows[0]?.embedding_fingerprint, firstFingerprint);
    } finally {
      secondDb.close();
    }
  } finally {
    if (previousMockEnv === undefined) {
      delete process.env.CLAW_EMBEDDING_MOCK;
    } else {
      process.env.CLAW_EMBEDDING_MOCK = previousMockEnv;
    }
  }
});

test("project query embedding cache remains bounded to 128 rows", { concurrency: false }, () => {
  const root = createFixture("memory-search-query-cache-limit");
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify({
      id: "memory-search-query-cache-limit",
      memory: {
        externalDocPaths: ["docs/"],
        embedding: {
          provider: "local",
          model: "Snowflake/snowflake-arctic-embed-xs",
          local: { modelCacheDir: path.join(root, ".model-cache") },
        },
      },
    }, null, 2),
    "utf-8",
  );
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, ".claw", "memory.md"), "project notes\n", "utf-8");
  fs.writeFileSync(path.join(root, "docs", "guide.md"), "semantic fallback target\n", "utf-8");

  const previousMockEnv = process.env.CLAW_EMBEDDING_MOCK;
  process.env.CLAW_EMBEDDING_MOCK = "1";
  try {
    const index = buildMemoryIndex({ cwd: root });
    const db = new DatabaseSync(index.storePath);
    try {
      const insert = db.prepare(
        "INSERT INTO query_embeddings (cache_key, embedding_fingerprint, query_text, dimensions, embedding_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      );
      for (let indexValue = 0; indexValue < 128; indexValue += 1) {
        insert.run(`seed-${indexValue}`, "seed", `seed-${indexValue}`, 1, "[1]", indexValue);
      }
    } finally {
      db.close();
    }

    searchMemory({ cwd: root, query: "please recall the semantic fallback target we discussed" });

    const verifyDb = new DatabaseSync(index.storePath);
    try {
      const row = verifyDb.prepare("SELECT COUNT(*) AS count FROM query_embeddings").get() as { count: number };
      assert.equal(row.count, 128);
      const oldest = verifyDb
        .prepare("SELECT COUNT(*) AS count FROM query_embeddings WHERE cache_key = ?")
        .get("seed-0") as { count: number };
      assert.equal(oldest.count, 0);
    } finally {
      verifyDb.close();
    }
  } finally {
    if (previousMockEnv === undefined) {
      delete process.env.CLAW_EMBEDDING_MOCK;
    } else {
      process.env.CLAW_EMBEDDING_MOCK = previousMockEnv;
    }
  }
});

test("project search prioritizes strong-term Chinese docs for conversational queries over generic plan docs", { concurrency: false }, () => {
  const root = createFixture("memory-search-conversational-chinese-ranking");
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify(
      {
        id: "memory-search-conversational-chinese-ranking",
        memory: {
          externalDocPaths: ["docs/"],
          embedding: {
            provider: "local",
            model: "Snowflake/snowflake-arctic-embed-xs",
            local: {
              modelCacheDir: path.join(root, ".model-cache"),
            },
          },
        },
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, ".claw", "memory.md"), "project memory notes\n", "utf-8");
  fs.writeFileSync(path.join(root, ".claw", "truth", "shared.md"), "shared truth summary\n", "utf-8");
  fs.writeFileSync(path.join(root, "docs", "sdtz-guide.md"), "\u641c\u6253\u64a4\u6a21\u5f0f\u8bf4\u660e\n", "utf-8");
  fs.writeFileSync(path.join(root, "docs", "generic-plan-a.md"), "\u5185\u5b58\u4f18\u5316\u65b9\u6848\n", "utf-8");
  fs.writeFileSync(path.join(root, "docs", "generic-plan-b.md"), "\u7f51\u7edc\u91cd\u6784\u65b9\u6848\n", "utf-8");

  const previousMockEnv = process.env.CLAW_EMBEDDING_MOCK;
  process.env.CLAW_EMBEDDING_MOCK = "1";

  try {
    buildMemoryIndex({ cwd: root });

    const result = searchMemory({ cwd: root, query: "\u4e4b\u524d\u8ba8\u8bba\u7684\u90a3\u4e2a\u641c\u6253\u64a4\u65b9\u6848", limit: 5 });
    assert.equal(path.basename(result.results[0]?.sourcePath ?? ""), "sdtz-guide.md");
  } finally {
    if (previousMockEnv === undefined) {
      delete process.env.CLAW_EMBEDDING_MOCK;
    } else {
      process.env.CLAW_EMBEDDING_MOCK = previousMockEnv;
    }
  }
});

test("project search demotes index-like docs when a focused Chinese doc matches the same topic", { concurrency: false }, () => {
  const root = createFixture("memory-search-index-doc-penalty");
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify(
      {
        id: "memory-search-index-doc-penalty",
        memory: {
          externalDocPaths: ["docs/"],
          embedding: {
            provider: "local",
            model: "Snowflake/snowflake-arctic-embed-xs",
            local: {
              modelCacheDir: path.join(root, ".model-cache"),
            },
          },
        },
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, ".claw", "memory.md"), "project memory notes\n", "utf-8");
  fs.writeFileSync(path.join(root, ".claw", "truth", "shared.md"), "shared truth summary\n", "utf-8");
  fs.writeFileSync(path.join(root, "docs", "contents.md"), "\u8fd9\u91cc\u5217\u51fa\u641c\u6253\u64a4\u3001\u6b66\u5668\u3001\u9053\u5177\u3001\u7cfb\u7edf\u3001\u6280\u672f\u5b9e\u73b0\u7d22\u5f15\u3002\n", "utf-8");
  fs.writeFileSync(path.join(root, "docs", "sdtz-guide.md"), "\u641c\u6253\u64a4\u6a21\u5f0f\u8bf4\u660e\n", "utf-8");

  const previousMockEnv = process.env.CLAW_EMBEDDING_MOCK;
  process.env.CLAW_EMBEDDING_MOCK = "1";

  try {
    buildMemoryIndex({ cwd: root });

    const result = searchMemory({ cwd: root, query: "\u641c\u6253\u64a4", limit: 5 });
    assert.equal(path.basename(result.results[0]?.sourcePath ?? ""), "sdtz-guide.md");
  } finally {
    if (previousMockEnv === undefined) {
      delete process.env.CLAW_EMBEDDING_MOCK;
    } else {
      process.env.CLAW_EMBEDDING_MOCK = previousMockEnv;
    }
  }
});

test("project search keeps recall for multi-term Chinese queries across different markdown docs", () => {
  const root = createFixture("memory-search-chinese-multi-term");
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify(
      {
        id: "memory-search-chinese-multi-term",
        memory: {
          externalDocPaths: ["docs/"],
          embedding: {
            provider: "local",
            model: "Snowflake/snowflake-arctic-embed-xs",
            local: {
              modelCacheDir: path.join(root, ".model-cache"),
            },
          },
        },
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, ".claw", "memory.md"), "\u9879\u76ee\u68c0\u7d22\u8bb0\u5fc6\n", "utf-8");
  fs.writeFileSync(path.join(root, ".claw", "truth", "shared.md"), "\u5171\u4eab\u4e2d\u6587 truth\n", "utf-8");
  fs.writeFileSync(path.join(root, "docs", "sdtz.md"), "\u8fd9\u91cc\u8bb0\u5f55\u641c\u6253\u64a4\u6a21\u5f0f\u7684\u8bf4\u660e\n", "utf-8");
  fs.writeFileSync(path.join(root, "docs", "hjb.md"), "\u8fd9\u91cc\u8bb0\u5f55\u54c8\u57fa\u5b9d\u7684\u8bf4\u660e\n", "utf-8");

  const previousMockEnv = process.env.CLAW_EMBEDDING_MOCK;
  process.env.CLAW_EMBEDDING_MOCK = "1";

  try {
    buildMemoryIndex({ cwd: root });

    const firstTerm = searchMemory({ cwd: root, query: "\u641c\u6253\u64a4" });
    const secondTerm = searchMemory({ cwd: root, query: "\u54c8\u57fa\u5b9d" });
    const multiTerm = searchMemory({ cwd: root, query: "\u641c\u6253\u64a4 \u54c8\u57fa\u5b9d", limit: 5 });

    assert.ok(firstTerm.results.some((item) => item.sourcePath.endsWith(path.join("docs", "sdtz.md"))));
    assert.ok(secondTerm.results.some((item) => item.sourcePath.endsWith(path.join("docs", "hjb.md"))));
    assert.ok(multiTerm.results.some((item) => item.sourcePath.endsWith(path.join("docs", "sdtz.md"))));
    assert.ok(multiTerm.results.some((item) => item.sourcePath.endsWith(path.join("docs", "hjb.md"))));
  } finally {
    if (previousMockEnv === undefined) {
      delete process.env.CLAW_EMBEDDING_MOCK;
    } else {
      process.env.CLAW_EMBEDDING_MOCK = previousMockEnv;
    }
  }
});

test("project search reranks multi-term Chinese queries to cover distinct strong terms near the top", { concurrency: false }, () => {
  const root = createFixture("memory-search-chinese-multi-term-coverage");
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify(
      {
        id: "memory-search-chinese-multi-term-coverage",
        memory: {
          externalDocPaths: ["docs/"],
          embedding: {
            provider: "local",
            model: "Snowflake/snowflake-arctic-embed-xs",
            local: {
              modelCacheDir: path.join(root, ".model-cache"),
            },
          },
        },
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, ".claw", "memory.md"), "project memory notes\n", "utf-8");
  fs.writeFileSync(path.join(root, ".claw", "truth", "shared.md"), "shared truth summary\n", "utf-8");
  fs.writeFileSync(path.join(root, "docs", "sdtz-guide.md"), "\u641c\u6253\u64a4\u6a21\u5f0f\u8bf4\u660e\n", "utf-8");
  fs.writeFileSync(path.join(root, "docs", "hjb-guide.md"), "\u54c8\u57fa\u5b9d\u7cfb\u7edf\u8bf4\u660e\n", "utf-8");
  fs.writeFileSync(
    path.join(root, "docs", "noise.md"),
    "\u641c\u6253\u64a4\u6280\u672f\u5b9e\u73b0 \u641c\u6253\u64a4\u4ea4\u4e92\u89c4\u5219 \u641c\u6253\u64a4\u754c\u9762\u8bf4\u660e\n",
    "utf-8",
  );

  const previousMockEnv = process.env.CLAW_EMBEDDING_MOCK;
  process.env.CLAW_EMBEDDING_MOCK = "1";

  try {
    buildMemoryIndex({ cwd: root });

    const result = searchMemory({ cwd: root, query: "\u641c\u6253\u64a4 \u54c8\u57fa\u5b9d", limit: 3 });
    const topBasenames = result.results.slice(0, 2).map((item) => path.basename(item.sourcePath));

    assert.ok(topBasenames.includes("sdtz-guide.md"));
    assert.ok(topBasenames.includes("hjb-guide.md"));
  } finally {
    if (previousMockEnv === undefined) {
      delete process.env.CLAW_EMBEDDING_MOCK;
    } else {
      process.env.CLAW_EMBEDDING_MOCK = previousMockEnv;
    }
  }
});

test("project search uses substring fallback for short Chinese multi-term queries", { concurrency: false }, () => {
  const root = createFixture("memory-search-short-chinese-multi-term");
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify(
      {
        id: "memory-search-short-chinese-multi-term",
        memory: {
          externalDocPaths: ["docs/"],
          embedding: {
            provider: "local",
            model: "Snowflake/snowflake-arctic-embed-xs",
            local: {
              modelCacheDir: path.join(root, ".model-cache"),
            },
          },
        },
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, ".claw", "memory.md"), "\u77ed\u8bcd\u4e2d\u6587\u68c0\u7d22\n", "utf-8");
  fs.writeFileSync(path.join(root, ".claw", "truth", "shared.md"), "\u77ed\u8bcd truth\n", "utf-8");
  fs.writeFileSync(path.join(root, "docs", "sdtz.md"), "\u8fd9\u91cc\u8bb0\u5f55\u641c\u6253\u64a4\u6a21\u5f0f\u7684\u8bf4\u660e\n", "utf-8");
  fs.writeFileSync(path.join(root, "docs", "hjb.md"), "\u8fd9\u91cc\u8bb0\u5f55\u54c8\u57fa\u5b9d\u89d2\u8272\u7684\u8bf4\u660e\n", "utf-8");

  const previousMockEnv = process.env.CLAW_EMBEDDING_MOCK;
  process.env.CLAW_EMBEDDING_MOCK = "1";

  try {
    buildMemoryIndex({ cwd: root });

    const shortFirst = searchMemory({ cwd: root, query: "\u641c\u6253" });
    const shortSecond = searchMemory({ cwd: root, query: "\u54c8\u57fa" });
    const multiTerm = searchMemory({ cwd: root, query: "\u641c\u6253 \u54c8\u57fa", limit: 5 });

    assert.ok(shortFirst.results.some((item) => item.sourcePath.endsWith(path.join("docs", "sdtz.md"))));
    assert.ok(shortSecond.results.some((item) => item.sourcePath.endsWith(path.join("docs", "hjb.md"))));
    assert.ok(multiTerm.results.some((item) => item.sourcePath.endsWith(path.join("docs", "sdtz.md"))));
    assert.ok(multiTerm.results.some((item) => item.sourcePath.endsWith(path.join("docs", "hjb.md"))));
  } finally {
    if (previousMockEnv === undefined) {
      delete process.env.CLAW_EMBEDDING_MOCK;
    } else {
      process.env.CLAW_EMBEDDING_MOCK = previousMockEnv;
    }
  }
});

test("project search can rescue filename-aligned Chinese plan docs through candidate reranking", { concurrency: false }, () => {
  const root = createFixture("memory-search-filename-rescue");
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify(
      {
        id: "memory-search-filename-rescue",
        memory: {
          externalDocPaths: ["docs/"],
          embedding: {
            provider: "local",
            model: "Snowflake/snowflake-arctic-embed-xs",
            local: {
              modelCacheDir: path.join(root, ".model-cache"),
            },
          },
        },
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.mkdirSync(path.join(root, "docs", "plans"), { recursive: true });
  fs.writeFileSync(path.join(root, ".claw", "memory.md"), "project memory notes\n", "utf-8");
  fs.writeFileSync(path.join(root, ".claw", "truth", "shared.md"), "shared truth summary\n", "utf-8");
  fs.writeFileSync(
    path.join(root, "docs", "plans", "\u641c\u6253\u64a4\u65b9\u6848.md"),
    "\u7cfb\u7edf\u8bbe\u8ba1\u6458\u8981\n",
    "utf-8",
  );
  fs.writeFileSync(
    path.join(root, "docs", "sdtz-test-log.md"),
    "\u641c\u6253\u64a4\u6d4b\u8bd5\u8bb0\u5f55 \u641c\u6253\u64a4\u6d4b\u8bd5\u8bb0\u5f55 \u641c\u6253\u64a4\u6d4b\u8bd5\u8bb0\u5f55\n",
    "utf-8",
  );

  const previousMockEnv = process.env.CLAW_EMBEDDING_MOCK;
  process.env.CLAW_EMBEDDING_MOCK = "1";

  try {
    buildMemoryIndex({ cwd: root });

    const result = searchMemory({ cwd: root, query: "\u4e4b\u524d\u8ba8\u8bba\u7684\u90a3\u4e2a\u641c\u6253\u64a4\u65b9\u6848", limit: 3 });
    assert.equal(path.basename(result.results[0]?.sourcePath ?? ""), "\u641c\u6253\u64a4\u65b9\u6848.md");
  } finally {
    if (previousMockEnv === undefined) {
      delete process.env.CLAW_EMBEDDING_MOCK;
    } else {
      process.env.CLAW_EMBEDDING_MOCK = previousMockEnv;
    }
  }
});

test("project search prioritizes exact Chinese document hits over weaker project-memory matches", { concurrency: false }, () => {
  const root = createFixture("memory-search-chinese-ranking");
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify(
      {
        id: "memory-search-chinese-ranking",
        memory: {
          externalDocPaths: ["docs/"],
          embedding: {
            provider: "local",
            model: "Snowflake/snowflake-arctic-embed-xs",
            local: {
              modelCacheDir: path.join(root, ".model-cache"),
            },
          },
        },
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, ".claw", "memory.md"), "project memory notes\n", "utf-8");
  fs.writeFileSync(path.join(root, ".claw", "truth", "shared.md"), "shared truth summary\n", "utf-8");
  fs.writeFileSync(path.join(root, "docs", "sdtz-guide.md"), "\u641c\u6253\u64a4\u6a21\u5f0f\u8bf4\u660e\n", "utf-8");
  fs.writeFileSync(path.join(root, "docs", "hjb-guide.md"), "\u54c8\u57fa\u5b9d\u89d2\u8272\u8bf4\u660e\n", "utf-8");
  fs.writeFileSync(
    path.join(root, "docs", "noise-a.md"),
    "\u641c\u6253\u64a4\u76f8\u5173\u6218\u672f\u4e0e\u8d5b\u5b63\u5e73\u8861\u3001\u5c40\u5185\u8def\u7ebf\u3001\u641c\u6253\u64a4\u6280\u5de7\u3001\u591a\u4eba\u641c\u6253\u64a4\u7ecf\u9a8c\u3001\u88c5\u5907\u3001\u64a4\u79bb\u3002\n",
    "utf-8",
  );
  fs.writeFileSync(
    path.join(root, "docs", "noise-b.md"),
    "\u54c8\u57fa\u5b9d\u517b\u6210\u3001\u54c8\u57fa\u5b9d\u642d\u914d\u3001\u54c8\u57fa\u5b9d\u7ecf\u9a8c\u3002\n",
    "utf-8",
  );

  const previousMockEnv = process.env.CLAW_EMBEDDING_MOCK;
  process.env.CLAW_EMBEDDING_MOCK = "1";

  try {
    buildMemoryIndex({ cwd: root });

    const multiTerm = searchMemory({ cwd: root, query: "\u641c\u6253\u64a4 \u54c8\u57fa\u5b9d", limit: 5 });
    const topTwo = multiTerm.results.slice(0, 2).map((item) => path.basename(item.sourcePath)).sort();

    assert.deepEqual(topTwo, ["hjb-guide.md", "sdtz-guide.md"]);
  } finally {
    if (previousMockEnv === undefined) {
      delete process.env.CLAW_EMBEDDING_MOCK;
    } else {
      process.env.CLAW_EMBEDDING_MOCK = previousMockEnv;
    }
  }
});

test("project memory refresh generates local embedding metadata and vector rows for markdown sources", { concurrency: false }, () => {
  const root = createFixture("memory-local-embeddings");
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify(
      {
        id: "memory-local-embeddings",
        name: "Memory Local Embeddings",
        maxTasksToKeep: 99,
        externalTruthSkill: null,
        externalAdrSkill: null,
        contextPaths: [],
        memory: {
          externalDocPaths: ["docs/"],
          embedding: {
            provider: "local",
            model: "Snowflake/snowflake-arctic-embed-xs",
            local: {
              modelCacheDir: path.join(root, ".model-cache"),
            },
          },
        },
        gitnexus: {
          enabled: false,
        },
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.writeFileSync(path.join(root, ".claw", "memory.md"), "project alpha memory\n", "utf-8");
  fs.writeFileSync(path.join(root, ".claw", "truth", "shared.md"), "shared beta truth\n", "utf-8");
  fs.writeFileSync(path.join(root, "docs", "guide.md"), "gamma markdown doc\n", "utf-8");
  fs.writeFileSync(path.join(root, "docs", "notes.txt"), "should stay unindexed\n", "utf-8");

  const previousMockEnv = process.env.CLAW_EMBEDDING_MOCK;
  process.env.CLAW_EMBEDDING_MOCK = "1";

  try {
    const result = buildMemoryIndex({ cwd: root });

    assert.deepEqual(result.embedding, {
      provider: "local",
      model: "Snowflake/snowflake-arctic-embed-xs",
      local: {
        modelCacheDir: path.join(root, ".model-cache"),
      },
    });
    assert.deepEqual(result.vectorIndex, {
      enabled: true,
      provider: "local",
      model: "Snowflake/snowflake-arctic-embed-xs",
      dimensions: 384,
      chunkCount: 3,
    });
    assert.equal(result.sources.some((item) => item.endsWith(path.join("docs", "notes.txt"))), false);

    const db = new DatabaseSync(result.storePath);
    try {
      const metadata = db
        .prepare("SELECT value FROM index_metadata WHERE key = ?")
        .get("vector_index") as { value: string } | undefined;
      const vectors = db
        .prepare("SELECT COUNT(*) AS count FROM doc_embeddings")
        .get() as { count: number };

      assert.ok(metadata);
      assert.deepEqual(JSON.parse(metadata.value), result.vectorIndex);
      assert.equal(vectors.count, 3);
    } finally {
      db.close();
    }
  } finally {
    if (previousMockEnv === undefined) {
      delete process.env.CLAW_EMBEDDING_MOCK;
    } else {
      process.env.CLAW_EMBEDDING_MOCK = previousMockEnv;
    }
  }
});

test("project memory refresh uses 768 dimensions for the default local embedding model", { concurrency: false }, () => {
  const root = createEmptyFixture("memory-default-local-embeddings");
  initProject({
    cwd: root,
    projectName: "Memory Default Local Embeddings",
    externalDocPaths: ["docs/"],
  });
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "guide.md"), "default local embedding doc\n", "utf-8");
  fs.writeFileSync(path.join(root, ".claw", "truth", "stable.md"), "stable truth doc\n", "utf-8");

  const previousMockEnv = process.env.CLAW_EMBEDDING_MOCK;
  process.env.CLAW_EMBEDDING_MOCK = "1";

  try {
    const result = buildMemoryIndex({ cwd: root });

    assert.ok(result.embedding);
    assert.equal(result.embedding.model, "Snowflake/snowflake-arctic-embed-m-v2.0");
    assert.equal(result.vectorIndex?.enabled, true);
    assert.equal(result.vectorIndex?.provider, "local");
    assert.equal(result.vectorIndex?.model, "Snowflake/snowflake-arctic-embed-m-v2.0");
    assert.equal(result.vectorIndex?.dimensions, 768);
    assert.ok(Number(result.vectorIndex?.chunkCount) >= 3);
  } finally {
    if (previousMockEnv === undefined) {
      delete process.env.CLAW_EMBEDDING_MOCK;
    } else {
      process.env.CLAW_EMBEDDING_MOCK = previousMockEnv;
    }
  }
});

test("project memory refresh splits oversized markdown paragraphs into multiple embedding chunks", { concurrency: false }, () => {
  const root = createEmptyFixture("memory-oversized-paragraph-split");
  initProject({
    cwd: root,
    projectName: "Memory Oversized Paragraph Split",
    externalDocPaths: ["docs/"],
  });
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  const oversizedParagraph = "甲".repeat(7000);
  fs.writeFileSync(
    path.join(root, "docs", "oversized.md"),
    `# Oversized\n\n${oversizedParagraph}\n`,
    "utf-8",
  );

  const previousMockEnv = process.env.CLAW_EMBEDDING_MOCK;
  process.env.CLAW_EMBEDDING_MOCK = "1";

  try {
    const result = buildMemoryIndex({ cwd: root });
    const db = new DatabaseSync(result.storePath);
    try {
      const sourcePath = path.join(root, "docs", "oversized.md");
      const rows = db
        .prepare(
          [
            "SELECT chunk_index, chunk_text",
            "FROM doc_embeddings",
            "WHERE source_path = ?",
            "ORDER BY chunk_index ASC",
          ].join(" "),
        )
        .all(sourcePath) as Array<{ chunk_index: number; chunk_text: string }>;

      assert.ok(rows.length >= 2);
      assert.ok(rows.every((row) => row.chunk_text.length <= 6144));
    } finally {
      db.close();
    }
  } finally {
    if (previousMockEnv === undefined) {
      delete process.env.CLAW_EMBEDDING_MOCK;
    } else {
      process.env.CLAW_EMBEDDING_MOCK = previousMockEnv;
    }
  }
});

test("project memory refresh surfaces embedding worker timeouts", { concurrency: false }, () => {
  const root = createEmptyFixture("memory-embedding-timeout");
  initProject({
    cwd: root,
    projectName: "Memory Embedding Timeout",
    externalDocPaths: ["docs/"],
  });
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "guide.md"), "timeout doc\n", "utf-8");

  const previousMockEnv = process.env.CLAW_EMBEDDING_MOCK;
  const previousTimeoutEnv = process.env.CLAW_EMBEDDING_WORKER_TIMEOUT_MS;
  delete process.env.CLAW_EMBEDDING_MOCK;
  process.env.CLAW_EMBEDDING_WORKER_TIMEOUT_MS = "1";

  try {
    assert.throws(
      () => buildMemoryIndex({ cwd: root }),
      (error: unknown) => {
        const payload = error as {
          code?: unknown;
          message?: unknown;
          details?: Record<string, unknown>;
        };
        assert.equal(payload.code, "PROJECT_CONFIG_INVALID");
        assert.match(String(payload.message), /Memory embedding generation failed/);
        const details = payload.details;
        assert.equal(details?.timedOut, true);
        assert.equal(details?.timeoutMs, 1);
        return true;
      },
    );
  } finally {
    if (previousMockEnv === undefined) {
      delete process.env.CLAW_EMBEDDING_MOCK;
    } else {
      process.env.CLAW_EMBEDDING_MOCK = previousMockEnv;
    }
    if (previousTimeoutEnv === undefined) {
      delete process.env.CLAW_EMBEDDING_WORKER_TIMEOUT_MS;
    } else {
      process.env.CLAW_EMBEDDING_WORKER_TIMEOUT_MS = previousTimeoutEnv;
    }
  }
});

test("project search reports a clear error when the memory store is busy", { concurrency: false }, () => {
  const root = createFixture("memory-store-busy");
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify(
      {
        id: "memory-store-busy",
        name: "Memory Store Busy",
        maxTasksToKeep: 99,
        externalTruthSkill: null,
        externalAdrSkill: null,
        contextPaths: [],
        memory: {
          externalDocPaths: [],
          embedding: null,
        },
        gitnexus: {
          enabled: false,
        },
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.writeFileSync(path.join(root, ".claw", "memory.md"), "busy store search target\n", "utf-8");
  const index = buildMemoryIndex({ cwd: root });
  const lockDb = new DatabaseSync(index.storePath);
  const previousBusyTimeout = process.env.CLAW_MEMORY_SQLITE_BUSY_TIMEOUT_MS;
  process.env.CLAW_MEMORY_SQLITE_BUSY_TIMEOUT_MS = "1";

  try {
    lockDb.exec("PRAGMA busy_timeout = 0;");
    lockDb.exec("PRAGMA locking_mode = EXCLUSIVE;");
    lockDb.exec("BEGIN EXCLUSIVE;");

    assert.throws(
      () => searchMemory({ cwd: root, query: "busy store" }),
      (error: unknown) => {
        const payload = error as {
          code?: unknown;
          message?: unknown;
          details?: Record<string, unknown>;
        };
        assert.equal(payload.code, "MEMORY_STORE_BUSY");
        assert.match(String(payload.message), /Memory index store is busy/);
        assert.match(String(payload.message), /retry after that operation finishes/);
        assert.equal(payload.details?.storePath, index.storePath);
        assert.equal(payload.details?.operation, "search");
        return true;
      },
    );
  } finally {
    try {
      lockDb.exec("ROLLBACK;");
    } catch {
      // The assertion path may fail before BEGIN succeeds.
    }
    lockDb.close();
    if (previousBusyTimeout === undefined) {
      delete process.env.CLAW_MEMORY_SQLITE_BUSY_TIMEOUT_MS;
    } else {
      process.env.CLAW_MEMORY_SQLITE_BUSY_TIMEOUT_MS = previousBusyTimeout;
    }
  }
});

test("project memory refresh incrementally reuses unchanged docs and syncs changed or deleted markdown docs", { concurrency: false }, () => {
  const root = createFixture("memory-incremental-refresh");
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify(
      {
        id: "memory-incremental-refresh",
        name: "Memory Incremental Refresh",
        maxTasksToKeep: 99,
        externalTruthSkill: null,
        externalAdrSkill: null,
        contextPaths: [],
        memory: {
          externalDocPaths: ["docs/"],
          embedding: {
            provider: "local",
            model: "Snowflake/snowflake-arctic-embed-xs",
            local: {
              modelCacheDir: path.join(root, ".model-cache"),
            },
          },
        },
        gitnexus: {
          enabled: false,
        },
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.writeFileSync(path.join(root, ".claw", "memory.md"), "project alpha memory\n", "utf-8");
  fs.writeFileSync(path.join(root, ".claw", "truth", "shared.md"), "shared beta truth\n", "utf-8");
  fs.writeFileSync(path.join(root, "docs", "stable.md"), "stable doc stays the same\n", "utf-8");
  fs.writeFileSync(path.join(root, "docs", "change.md"), "first version paragraph\n\nsecond paragraph\n", "utf-8");
  fs.writeFileSync(path.join(root, "docs", "remove.md"), "remove me later\n", "utf-8");

  const previousMockEnv = process.env.CLAW_EMBEDDING_MOCK;
  process.env.CLAW_EMBEDDING_MOCK = "1";

  try {
    const firstIndex = buildMemoryIndex({ cwd: root });
    const firstDb = new DatabaseSync(firstIndex.storePath);
    let stableBefore: { id: number } | undefined;
    let changedBefore: { id: number } | undefined;
    let removedBefore: { id: number } | undefined;
    let stableEmbeddingBefore: { embedding_json: string } | undefined;

    try {
      stableBefore = firstDb
        .prepare("SELECT id FROM docs WHERE source_path = ?")
        .get(path.join(root, "docs", "stable.md")) as { id: number } | undefined;
      changedBefore = firstDb
        .prepare("SELECT id FROM docs WHERE source_path = ?")
        .get(path.join(root, "docs", "change.md")) as { id: number } | undefined;
      removedBefore = firstDb
        .prepare("SELECT id FROM docs WHERE source_path = ?")
        .get(path.join(root, "docs", "remove.md")) as { id: number } | undefined;
      stableEmbeddingBefore = firstDb
        .prepare("SELECT embedding_json FROM doc_embeddings WHERE doc_id = ? AND chunk_index = 0")
        .get(stableBefore?.id ?? -1) as { embedding_json: string } | undefined;
    } finally {
      firstDb.close();
    }

    fs.writeFileSync(path.join(root, "docs", "change.md"), "updated version paragraph only\n", "utf-8");
    fs.unlinkSync(path.join(root, "docs", "remove.md"));

    const secondIndex = buildMemoryIndex({ cwd: root });
    const secondDb = new DatabaseSync(secondIndex.storePath);

    try {
      const stableAfter = secondDb
        .prepare("SELECT id FROM docs WHERE source_path = ?")
        .get(path.join(root, "docs", "stable.md")) as { id: number } | undefined;
      const changedAfter = secondDb
        .prepare("SELECT id, content FROM docs WHERE source_path = ?")
        .get(path.join(root, "docs", "change.md")) as { id: number; content: string } | undefined;
      const removedAfter = secondDb
        .prepare("SELECT id FROM docs WHERE source_path = ?")
        .get(path.join(root, "docs", "remove.md")) as { id: number } | undefined;
      const stableEmbeddingAfter = secondDb
        .prepare("SELECT embedding_json FROM doc_embeddings WHERE doc_id = ? AND chunk_index = 0")
        .get(stableAfter?.id ?? -1) as { embedding_json: string } | undefined;
      const changedEmbeddings = secondDb
        .prepare("SELECT COUNT(*) AS count FROM doc_embeddings WHERE doc_id = ?")
        .get(changedAfter?.id ?? -1) as { count: number };
      const removedEmbeddings = secondDb
        .prepare("SELECT COUNT(*) AS count FROM doc_embeddings WHERE source_path = ?")
        .get(path.join(root, "docs", "remove.md")) as { count: number };

      assert.ok(stableBefore);
      assert.ok(changedBefore);
      assert.ok(removedBefore);
      assert.ok(stableAfter);
      assert.ok(changedAfter);
      assert.equal(stableAfter.id, stableBefore.id);
      assert.notEqual(changedAfter.id, changedBefore.id);
      assert.equal(changedAfter.content, "updated version paragraph only\n");
      assert.equal(removedAfter, undefined);
      assert.equal(stableEmbeddingAfter?.embedding_json, stableEmbeddingBefore?.embedding_json);
      assert.equal(changedEmbeddings.count, 1);
      assert.equal(removedEmbeddings.count, 0);
    } finally {
      secondDb.close();
    }
  } finally {
    if (previousMockEnv === undefined) {
      delete process.env.CLAW_EMBEDDING_MOCK;
    } else {
      process.env.CLAW_EMBEDDING_MOCK = previousMockEnv;
    }
  }
});

test("project memory refresh backfills vectors for existing docs when embeddings are missing", { concurrency: false }, () => {
  const root = createFixture("memory-backfill-missing-embeddings");
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify(
      {
        id: "memory-backfill-missing-embeddings",
        name: "Memory Backfill Missing Embeddings",
        maxTasksToKeep: 99,
        externalTruthSkill: null,
        externalAdrSkill: null,
        contextPaths: [],
        memory: {
          externalDocPaths: ["docs/"],
          embedding: {
            provider: "local",
            model: "Snowflake/snowflake-arctic-embed-xs",
            local: {
              modelCacheDir: path.join(root, ".model-cache"),
            },
          },
        },
        gitnexus: {
          enabled: false,
        },
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.writeFileSync(path.join(root, ".claw", "memory.md"), "project alpha memory\n", "utf-8");
  fs.writeFileSync(path.join(root, ".claw", "truth", "shared.md"), "shared beta truth\n", "utf-8");
  fs.writeFileSync(path.join(root, "docs", "guide.md"), "gamma markdown doc\n", "utf-8");

  const previousMockEnv = process.env.CLAW_EMBEDDING_MOCK;
  process.env.CLAW_EMBEDDING_MOCK = "1";

  try {
    const firstIndex = buildMemoryIndex({ cwd: root });
    assert.deepEqual(firstIndex.vectorIndex, {
      enabled: true,
      provider: "local",
      model: "Snowflake/snowflake-arctic-embed-xs",
      dimensions: 384,
      chunkCount: 3,
    });

    const db = new DatabaseSync(firstIndex.storePath);
    try {
      db.exec("DELETE FROM doc_embeddings;");
      db.prepare("DELETE FROM index_metadata WHERE key = ?").run("vector_index");
    } finally {
      db.close();
    }

    const repairedIndex = buildMemoryIndex({ cwd: root });
    assert.deepEqual(repairedIndex.vectorIndex, {
      enabled: true,
      provider: "local",
      model: "Snowflake/snowflake-arctic-embed-xs",
      dimensions: 384,
      chunkCount: 3,
    });
    assert.equal(repairedIndex.processedFileCount, 0);

    const repairedDb = new DatabaseSync(repairedIndex.storePath);
    try {
      const vectors = repairedDb
        .prepare("SELECT COUNT(*) AS count FROM doc_embeddings")
        .get() as { count: number };
      const metadata = repairedDb
        .prepare("SELECT value FROM index_metadata WHERE key = ?")
        .get("vector_index") as { value: string } | undefined;

      assert.equal(vectors.count, 3);
      assert.ok(metadata);
      assert.deepEqual(JSON.parse(metadata.value), repairedIndex.vectorIndex);
    } finally {
      repairedDb.close();
    }
  } finally {
    if (previousMockEnv === undefined) {
      delete process.env.CLAW_EMBEDDING_MOCK;
    } else {
      process.env.CLAW_EMBEDDING_MOCK = previousMockEnv;
    }
  }
});

test("project memory refresh defaults to processing changed files in 100-file batches", { concurrency: false }, () => {
  const root = createFixture("memory-default-file-batches");
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify(
      {
        id: "memory-default-file-batches",
        name: "Memory Default File Batches",
        maxTasksToKeep: 99,
        externalTruthSkill: null,
        externalAdrSkill: null,
        contextPaths: [],
        memory: {
          externalDocPaths: ["docs/"],
          embedding: {
            provider: "local",
            model: "Snowflake/snowflake-arctic-embed-xs",
            local: {
              modelCacheDir: path.join(root, ".model-cache"),
            },
          },
        },
        gitnexus: {
          enabled: false,
        },
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.writeFileSync(path.join(root, ".claw", "memory.md"), "project alpha memory\n", "utf-8");
  fs.writeFileSync(path.join(root, ".claw", "truth", "shared.md"), "shared beta truth\n", "utf-8");
  for (let index = 0; index < 101; index += 1) {
    fs.writeFileSync(path.join(root, "docs", `doc-${index.toString().padStart(3, "0")}.md`), `doc ${index}\n`, "utf-8");
  }

  const previousMockEnv = process.env.CLAW_EMBEDDING_MOCK;
  process.env.CLAW_EMBEDDING_MOCK = "1";

  try {
    const firstIndex = buildMemoryIndex({ cwd: root });
    const secondIndex = buildMemoryIndex({ cwd: root });
    const db = new DatabaseSync(secondIndex.storePath);

    try {
      const docs = db.prepare("SELECT COUNT(*) AS count FROM docs").get() as { count: number };

      assert.equal(firstIndex.indexedCount, 103);
      assert.equal(firstIndex.processedFileCount, 100);
      assert.equal(firstIndex.pendingFileCount, 3);
      assert.equal(secondIndex.processedFileCount, 3);
      assert.equal(secondIndex.pendingFileCount, 0);
      assert.equal(docs.count, 103);
    } finally {
      db.close();
    }
  } finally {
    if (previousMockEnv === undefined) {
      delete process.env.CLAW_EMBEDDING_MOCK;
    } else {
      process.env.CLAW_EMBEDDING_MOCK = previousMockEnv;
    }
  }
});

test("project memory refresh still batches files after embedding config changes", { concurrency: false }, () => {
  const root = createFixture("memory-batches-after-embedding-config-change");
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });

  const writeProjectConfig = (model: string) => {
    fs.writeFileSync(
      path.join(root, ".claw", "project.json"),
      JSON.stringify(
        {
          id: "memory-batches-after-embedding-config-change",
          name: "Memory Batches After Embedding Config Change",
          maxTasksToKeep: 99,
          externalTruthSkill: null,
          externalAdrSkill: null,
          contextPaths: [],
          memory: {
            externalDocPaths: ["docs/"],
            embedding: {
              provider: "local",
              model,
              local: {
                modelCacheDir: path.join(root, ".model-cache"),
              },
            },
          },
          gitnexus: {
            enabled: false,
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
  };

  writeProjectConfig("Snowflake/snowflake-arctic-embed-xs");
  fs.writeFileSync(path.join(root, ".claw", "memory.md"), "project alpha memory\n", "utf-8");
  fs.writeFileSync(path.join(root, ".claw", "truth", "shared.md"), "shared beta truth\n", "utf-8");
  for (let index = 0; index < 101; index += 1) {
    fs.writeFileSync(path.join(root, "docs", `doc-${index.toString().padStart(3, "0")}.md`), `doc ${index}\n`, "utf-8");
  }

  const previousMockEnv = process.env.CLAW_EMBEDDING_MOCK;
  process.env.CLAW_EMBEDDING_MOCK = "1";

  try {
    const firstIndex = buildMemoryIndex({ cwd: root });
    const secondIndex = buildMemoryIndex({ cwd: root });

    assert.equal(firstIndex.processedFileCount, 100);
    assert.equal(firstIndex.pendingFileCount, 3);
    assert.equal(secondIndex.processedFileCount, 3);
    assert.equal(secondIndex.pendingFileCount, 0);

    writeProjectConfig("Snowflake/snowflake-arctic-embed-m-v2.0");

    const resetIndex = buildMemoryIndex({ cwd: root });
    const completionIndex = buildMemoryIndex({ cwd: root });
    const db = new DatabaseSync(resetIndex.storePath);

    try {
      const docs = db.prepare("SELECT COUNT(*) AS count FROM docs").get() as { count: number };

      assert.equal(resetIndex.indexedCount, 103);
      assert.equal(resetIndex.processedFileCount, 100);
      assert.equal(resetIndex.pendingFileCount, 3);
      assert.equal(completionIndex.processedFileCount, 3);
      assert.equal(completionIndex.pendingFileCount, 0);
      assert.equal(docs.count, 103);
    } finally {
      db.close();
    }
  } finally {
    if (previousMockEnv === undefined) {
      delete process.env.CLAW_EMBEDDING_MOCK;
    } else {
      process.env.CLAW_EMBEDDING_MOCK = previousMockEnv;
    }
  }
});

test("workflow guidance uses external writer skills from project config", async () => {
  const root = createFixture("external-writer-skill-guidance");
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify(
      {
        version: "0.1.60",
        id: "external-writer-skill-guidance",
        name: "External Writer Guidance",
        maxTasksToKeep: 99,
        goalMode: true,
        truthDispatch: "per_task",
        externalTruthSkill: "external-truth-writer",
        externalAdrSkill: "external-adr-writer",
        contextPaths: [],
        memory: {
          enabled: true,
          externalDocPaths: [],
          embedding: {
            provider: "local",
            model: "Snowflake/snowflake-arctic-embed-xs",
            local: {
              modelCacheDir: ".claw/models",
            },
          },
        },
        gitnexus: false,
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
  assert.equal(
    taskDone.workflowGuidance.notes,
    "Truth dispatch requires the main agent's reusable-value confirmation; ADR dispatch is required but remains asynchronous for root-plan closeout. Root `claw plan done` records completedAt and keeps the plan path readable for at least one hour. Honor every field in a dispatched delegate contract.",
  );
  assert.equal(taskDone.workflowGuidance.delegateSubagents?.[0]?.skill, "external-truth-writer");
  assert.equal(taskDone.workflowGuidance.delegateSubagents?.[0]?.dispatch, "when_reusable_truth_confirmed");
  assert.equal(taskDone.workflowGuidance.delegateSubagents?.[1]?.dispatch, "required");
  assert.equal(taskDone.workflowGuidance.delegateSubagents?.[0]?.model, "gpt-5.4-mini");
  assert.equal(taskDone.workflowGuidance.delegateSubagents?.[0]?.fork_context, false);

  const completed = await editPlan({
    cwd: root,
    taskName: "demo-task",
    planStatus: "end.completed",
    patch: { retrospective: { summary: "Done." } },
  });
  assert.equal(completed.workflowGuidance.delegateSubagents, undefined);
});

test("direct workflow guidance uses the configured truth writer contract", () => {
  const guidance = buildDirectWorkflowGuidance({
    projectConfig: {
      externalTruthSkill: "external-truth-writer",
    },
  });

  assert.equal(guidance.stage, "done");
  assert.match(guidance.summary, /lean path|without extra decomposition/i);
  assert.equal(guidance.delegateSubagents?.[0]?.name, "truth-writer");
  assert.equal(guidance.delegateSubagents?.[0]?.skill, "external-truth-writer");
  assert.equal(guidance.delegateSubagents?.[0]?.dispatch, "when_reusable_truth_confirmed");
  assert.equal(guidance.delegateSubagents?.[0]?.model, "gpt-5.4-mini");
  assert.equal(guidance.delegateSubagents?.[0]?.fork_context, false);
  assert.equal(guidance.nextsteps.some((step) => step.includes("truth-writer")), true);
  assert.equal(guidance.nextsteps.some((step) => step.includes("completion refresh")), true);
  assert.match(String(guidance.notes), /compatibility surface/i);
  assert.match(String(guidance.notes), /claw plan create/i);
});

test("initProject gitignore ignores project-override.json by default", () => {
  const root = createEmptyFixture("init-project-override-gitignore");

  initProject({
    cwd: root,
    projectName: "Override Ignore",
  });

  assert.equal(
    fs.readFileSync(path.join(root, ".gitignore"), "utf-8"),
    "# claw-kit\n.claw/*\n!.claw/project.json\n!.claw/truth/\n!.claw/truth/**\n.claw/project-override.json\n",
  );
});

test("truth ingest writes only under .claw/truth", () => {
  const root = createFixture("truth-ingest");

  const result = ingestTruth({
    cwd: root,
    target: "features/test-feature.md",
    content: "# Feature\n\nCanonical truth.\n",
  });

  assert.ok(result.targetPath.startsWith(path.join(root, ".claw", "truth")));
  assert.equal(readTextFile(result.targetPath), "# Feature\n\nCanonical truth.\n");
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
          enabled: true,
          externalDocPaths: ["docs/", 123],
          embedding: {
            provider: "openai",
            model: "text-embedding-3-small",
            remote: {
              apiKeyEnvVar: "OPENAI_API_KEY",
            },
          },
        },
      },
      null,
      2,
    ),
    "utf-8",
  );

  const result = ensureProjectProtocol(root);
  const projectConfig = JSON.parse(fs.readFileSync(result.projectJsonPath, "utf-8")) as {
    version: string;
    id: string;
    name: string;
    maxTasksToKeep: number;
    autoUpdate: boolean;
    externalTruthSkill: string | null;
    externalAdrSkill: string | null;
    contextPaths: string[];
    goalMode: boolean;
    truthDispatch: "per_task" | "final_only";
    memory: {
      enabled: boolean;
      externalDocPaths: string[];
      embedding: {
        provider: string;
        model: string;
        remote: {
          apiKeyEnvVar: string;
        };
      } | null;
    };
    gitnexus: boolean;
  };

  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.ok(result.issueCountBefore > 0);
  assert.equal(projectConfig.version, "0.1.72");
  assert.equal(projectConfig.id, "fix-me");
  assert.equal(projectConfig.name, "Fix Me");
  assert.equal(projectConfig.maxTasksToKeep, 99);
  assert.equal(projectConfig.autoUpdate, true);
  assert.equal(projectConfig.externalTruthSkill, null);
  assert.equal(projectConfig.externalAdrSkill, null);
  assert.deepEqual(projectConfig.contextPaths, []);
  assert.equal(projectConfig.goalMode, true);
  assert.equal(projectConfig.truthDispatch, "final_only");
  assert.equal(projectConfig.memory.enabled, true);
  assert.deepEqual(projectConfig.memory.externalDocPaths, ["docs/"]);
  assert.deepEqual(projectConfig.memory.embedding, {
    provider: "openai",
    model: "text-embedding-3-small",
    remote: {
      apiKeyEnvVar: "OPENAI_API_KEY",
    },
  });
  assert.equal(projectConfig.gitnexus, false);
});

test("ensureProjectProtocol removes legacy default local modelCacheDir so runtime shared cache becomes implicit", () => {
  const root = createFixture("project-check-legacy-model-cache");
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify(
      {
        version: "0.1.60",
        id: "legacy-cache",
        name: "Legacy Cache",
        maxTasksToKeep: 99,
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
            model: "Snowflake/snowflake-arctic-embed-m-v2.0",
            local: {
              modelCacheDir: ".claw/models",
            },
          },
        },
        gitnexus: false,
      },
      null,
      2,
    ),
    "utf-8",
  );

  const result = ensureProjectProtocol(root);
  const projectConfig = JSON.parse(fs.readFileSync(result.projectJsonPath, "utf-8")) as {
    goalMode: boolean;
    truthDispatch: "per_task" | "final_only";
    memory: {
      embedding: {
        provider: string;
        model: string;
        local?: {
          modelCacheDir?: string;
        };
      };
    };
  };

  assert.equal(result.changed, true);
  assert.equal(projectConfig.goalMode, true);
  assert.equal(projectConfig.truthDispatch, "per_task");
  assert.deepEqual(projectConfig.memory.embedding, {
    provider: "local",
    model: "Snowflake/snowflake-arctic-embed-m-v2.0",
  });
});

test("ensureProjectProtocol migrates legacy task metadata and flattens subplans into session-bound plan paths", () => {
  const root = createFixture("legacy-task-layout-migration");
  const taskDir = path.join(root, ".claw", "tasks", "demo-task");
  const plansDir = path.join(taskDir, "plans");
  fs.mkdirSync(plansDir, { recursive: true });
  fs.writeFileSync(
    path.join(taskDir, "plan.json"),
    JSON.stringify({
      title: "Parent",
      status: "process.active",
      goal: { text: "Parent goal" },
      tasks: [{ id: 1, title: "Child", status: "in_progress", execution: { type: "subplan", subplan: "plans/child.json", planPath: "plans/child.json" } }],
    }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(plansDir, "child.json"),
    JSON.stringify({
      title: "Child",
      status: "process.active",
      parentPlan: "plan.json",
      parentTaskId: 1,
      goal: { text: "Child goal" },
      tasks: [],
    }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(taskDir, "meta.json"),
    JSON.stringify({
      name: "demo-task",
      projectId: "demo",
      description: "",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      subagents: [],
      activePlan: "plans/child.json",
      ownerSessionKey: "thread-demo",
    }),
    "utf-8",
  );

  const result = ensureProjectProtocol(root);
  const project = resolveProjectContext(root);
  const parent = JSON.parse(fs.readFileSync(path.join(taskDir, "plan.json"), "utf-8")) as PlanDocument;

  assert.equal(result.changed, true);
  assert.equal(fs.existsSync(path.join(taskDir, "meta.json")), false);
  assert.equal(fs.existsSync(plansDir), false);
  assert.equal(fs.existsSync(path.join(root, ".claw", "runtime", "task-layout-v2.complete")), true);
  assert.equal(fs.existsSync(path.join(taskDir, "child.json")), true);
  assert.equal(parent.tasks[0]?.execution?.subplan, "child.json");
  assert.equal(parent.tasks[0]?.execution?.planPath, "child.json");
  assert.equal(resolveSessionBoundPlan(project, "thread-demo"), path.join(taskDir, "child.json"));
  assert.equal(
    (JSON.parse(fs.readFileSync(path.join(root, ".claw", "runtime", "session-bindings.json"), "utf-8")) as { bindings: Record<string, string> }).bindings["thread-demo"],
    "tasks/demo-task/child.json",
  );
  assert.equal(ensureProjectProtocol(root).changed, false);
});

test("ensureProjectProtocol rejects a flat subplan name collision instead of overwriting", () => {
  const root = createFixture("legacy-task-layout-collision");
  const taskDir = path.join(root, ".claw", "tasks", "demo-task");
  const plansDir = path.join(taskDir, "plans");
  fs.mkdirSync(plansDir, { recursive: true });
  fs.writeFileSync(path.join(taskDir, "plan.json"), JSON.stringify({ title: "Parent", status: "process.active", goal: { text: "Parent" }, tasks: [] }), "utf-8");
  fs.writeFileSync(path.join(taskDir, "child.json"), JSON.stringify({ title: "Existing", status: "process.active", goal: { text: "Existing" }, tasks: [] }), "utf-8");
  fs.writeFileSync(path.join(plansDir, "child.json"), JSON.stringify({ title: "Legacy", status: "process.active", goal: { text: "Legacy" }, tasks: [] }), "utf-8");

  assert.throws(
    () => ensureProjectProtocol(root),
    (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "PLAN_ALREADY_EXISTS"),
  );
  assert.equal(JSON.parse(fs.readFileSync(path.join(taskDir, "child.json"), "utf-8")).title, "Existing");
});

test("enforceTaskRetention archives completed task and prunes archive by completedAt", async () => {
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
      completedAt: "2026-01-01T00:00:00.000Z",
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
      completedAt: "2026-02-01T00:00:00.000Z",
      goal: { text: "Archive newer task" },
      tasks: [],
      retrospective: { summary: "Newer complete." },
    },
  });

  const project = resolveContext(root).project;
  const nowMs = Date.parse("2026-03-01T00:00:00.000Z");
  const first = enforceTaskRetention(project, "older-task", nowMs);

  assert.equal(first.archivedCurrentTask?.taskName, "older-task");
  assert.equal(fs.existsSync(path.join(root, ".claw", "tasks", "older-task")), false);
  assert.equal(first.prunedArchivedTasks[0]?.taskName, "older-task");
  assert.equal(fs.existsSync(first.archivedCurrentTask?.archivedTaskDir ?? ""), false);

  const second = enforceTaskRetention(project, "newer-task", nowMs);

  assert.equal(second.archivedCurrentTask, undefined);
  assert.deepEqual(second.prunedArchivedTasks, []);
  assert.equal(fs.existsSync(path.join(root, ".claw", "archive", "tasks", "newer-task")), true);
});

test("enforceTaskRetention prunes completed tasks with non-ascii archive names", async () => {
  const root = createFixture("task-retention-nonascii");
  initProject({
    cwd: root,
    projectName: "Retention Non ASCII Project",
    maxTasksToKeep: 1,
    force: true,
  });
  await writePlan({
    cwd: root,
    taskName: "同步最新远端并刷新本地-Codex-插件与-CLI",
    title: "Older task",
    goalText: "Archive older task",
    content: {
      title: "Older task",
      status: "end.completed",
      completedAt: "2026-01-01T00:00:00.000Z",
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
      completedAt: "2026-02-01T00:00:00.000Z",
      goal: { text: "Archive newer task" },
      tasks: [],
      retrospective: { summary: "Newer complete." },
    },
  });

  const result = enforceTaskRetention(
    resolveContext(root).project,
    "newer-task",
    Date.parse("2026-03-01T00:00:00.000Z"),
  );

  assert.equal(result.archivedCurrentTask?.taskName, "newer-task");
  assert.equal(result.prunedArchivedTasks[0]?.taskName, "同步最新远端并刷新本地-Codex-插件与-CLI");
  assert.equal(fs.existsSync(path.join(root, ".claw", "archive", "tasks", "同步最新远端并刷新本地-Codex-插件与-CLI")), false);
  assert.equal(fs.existsSync(path.join(root, ".claw", "archive", "tasks", "newer-task")), true);
});

test("enforceTaskRetention uses only completedAt age for active task archive eligibility", async () => {
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
      status: "process.active",
      completedAt: "2026-01-01T00:00:00.000Z",
      goal: { text: "Archive legacy completed task" },
      tasks: [],
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
      completedAt: "2026-03-01T00:00:00.000Z",
      goal: { text: "Archive current completed task" },
      tasks: [],
      retrospective: { summary: "Current complete." },
    },
  });
  await writePlan({
    cwd: root,
    taskName: "missing-completed-at",
    title: "Missing completedAt",
    goalText: "Remain unarchived without completedAt",
    content: {
      title: "Missing completedAt",
      status: "end.completed",
      goal: { text: "Remain unarchived without completedAt" },
      tasks: [],
      retrospective: { summary: "Complete without timestamp." },
    },
  });

  const project = resolveContext(root).project;
  const result = enforceTaskRetention(project, "current-completed", Date.parse("2026-03-01T00:59:59.999Z"));

  assert.equal(result.archivedCurrentTask, undefined);
  assert.equal(fs.existsSync(path.join(root, ".claw", "tasks", "legacy-completed")), false);
  assert.equal(fs.existsSync(path.join(root, ".claw", "tasks", "current-completed")), true);
  assert.equal(fs.existsSync(path.join(root, ".claw", "archive", "tasks", "legacy-completed")), true);
  assert.equal(fs.existsSync(path.join(root, ".claw", "archive", "tasks", "current-completed")), false);
  assert.equal(fs.existsSync(path.join(root, ".claw", "tasks", "missing-completed-at")), true);

  const boundary = enforceTaskRetention(project, "current-completed", Date.parse("2026-03-01T01:00:00.000Z"));
  assert.equal(boundary.archivedCurrentTask?.taskName, "current-completed");
  assert.equal(fs.existsSync(path.join(root, ".claw", "archive", "tasks", "current-completed")), true);
  assert.equal(fs.existsSync(path.join(root, ".claw", "tasks", "missing-completed-at")), true);
});

test("concurrent plan creates fail fast with PLAN_WRITE_CONFLICT", async () => {
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

test("concurrent plan edits serialize and apply against the latest plan state", async () => {
  const root = createFixture("plan-edit-serialization");
  await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Serialize overlapping edits",
    content: {
      title: "Demo task",
      status: "process.active",
      goal: { text: "Serialize overlapping edits" },
      tasks: [
        { id: 1, title: "First task", status: "pending" },
        { id: 2, title: "Second task", status: "pending" },
      ],
    },
  });

  const [firstResult, secondResult] = await Promise.all([
    editPlan({
      cwd: root,
      taskName: "demo-task",
      taskId: 1,
      taskStatus: "done",
    }),
    editPlan({
      cwd: root,
      taskName: "demo-task",
      taskId: 2,
      taskStatus: "done",
    }),
  ]);

  assert.deepEqual(firstResult.changedTaskIds, [1]);
  assert.deepEqual(secondResult.changedTaskIds, [2]);

  const finalPlan = showPlan({
    cwd: root,
    taskName: "demo-task",
  }).plan;
  assert.deepEqual(
    finalPlan.tasks.map((task) => ({ id: task.id, status: task.status })),
    [
      { id: 1, status: "done" },
      { id: 2, status: "done" },
    ],
  );
});

test("serialized access waits for queue lock contention instead of failing fast", async () => {
  const root = createFixture("serialized-access-queue-lock-contention");
  const targetPath = path.join(root, ".claw", "tasks", "demo-task", "plan.json");
  const queueLockPath = `${targetPath}.queue.json.lock`;

  fs.mkdirSync(path.dirname(queueLockPath), { recursive: true });
  fs.writeFileSync(queueLockPath, "", "utf-8");

  const releaseTimer = setTimeout(() => {
    if (fs.existsSync(queueLockPath)) {
      fs.unlinkSync(queueLockPath);
    }
  }, 50);

  try {
    const result = await withSerializedAccess(
      targetPath,
      async () => "ok",
      { pollMs: 10, timeoutMs: 500 },
    );

    assert.equal(result, "ok");
  } finally {
    clearTimeout(releaseTimer);
    if (fs.existsSync(queueLockPath)) {
      fs.unlinkSync(queueLockPath);
    }
  }
});

test("plan edit rejects combining patch.tasks with task status updates", async () => {
  const root = createFixture("plan-edit-mixed-task-update");
  await writePlan({
    cwd: root,
    taskName: "demo-task",
    title: "Demo task",
    goalText: "Reject mixed task edits",
    content: {
      title: "Demo task",
      status: "process.active",
      goal: { text: "Reject mixed task edits" },
      tasks: [{ id: 1, title: "Only task", status: "pending" }],
    },
  });

  await assert.rejects(
    () =>
      editPlan({
        cwd: root,
        taskName: "demo-task",
        patch: {
          tasks: [{ id: 2, title: "Replacement task", status: "pending" }],
        },
        taskId: 1,
        taskStatus: "done",
      }),
    /patch\.tasks cannot be combined with taskId\/taskStatus updates/,
  );
});

test("ensureUtf8Bom prefixes markdown text exactly once", () => {
  const original = "# ADR\n\n中文正文。\n";
  const once = ensureUtf8Bom(original);
  const twice = ensureUtf8Bom(once);

  assert.equal(once.charCodeAt(0), 0xfeff);
  assert.equal(twice, once);
});

test("truth ingest writes markdown with UTF-8 BOM for Windows PowerShell compatibility", () => {
  const root = createFixture("truth-bom");

  const result = ingestTruth({
    cwd: root,
    target: "adr/test.md",
    content: "# 标题\n\n中文正文。\n",
  });

  const raw = fs.readFileSync(result.targetPath);
  assert.equal(raw[0], 0xef);
  assert.equal(raw[1], 0xbb);
  assert.equal(raw[2], 0xbf);
});
