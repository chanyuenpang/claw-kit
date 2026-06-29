# Project Plan Template Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project-owned plan templates under `.claw/templates` and allow `.claw/project.json` plus `.claw/project-override.json` to choose the default template name for `claw plan create` and `claw subplan create`.

**Architecture:** Extend the core template loader so it resolves templates from either the built-in registry or the fixed project directory `.claw/templates`, then thread a new `defaultPlanTemplate` project config field through context normalization, protocol repair, and plan creation. Keep CLI surface area stable by retaining `--template`, changing only how the effective default is chosen and documented.

**Tech Stack:** TypeScript, Node.js ESM/CJS module loading, Node test runner, existing `@veewo/claw-core` and CLI packages

---

### Task 1: Add failing core tests for project template resolution

**Files:**
- Modify: `D:\Users\chany\Documents\claw-kit\packages\core\test\core.test.ts`
- Reference: `D:\Users\chany\Documents\claw-kit\packages\core\src\plan.ts`
- Reference: `D:\Users\chany\Documents\claw-kit\packages\core\src\plan-templates.ts`

- [ ] **Step 1: Write the failing test for project JSON template loading**

```ts
test("writePlan loads a project JSON template from .claw/templates", async () => {
  const root = createFixture("plan-template-project-json");
  initProject({ cwd: root, projectName: "Project Json Template", planning: true, force: true });
  fs.mkdirSync(path.join(root, ".claw", "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "templates", "team-default.json"),
    `${JSON.stringify({
      id: "team-default",
      aliases: ["team"],
      planningEnabledStatus: "process.discussing",
      planningDisabledStatus: "process.active",
      planningTask: {
        title: "Draft requirements with the team template",
        detail: "Use {{planningSkill}} to turn the request into executable tasks.",
      },
      activationTask: {
        title: "Activate the team template plan",
        detail: "Move this plan into process.active after refinement.",
        goalModeDetail: "If Goal Mode is enabled for this project, start Goal Mode.",
      },
    }, null, 2)}\n`,
    "utf-8",
  );

  const result = await writePlan({
    cwd: root,
    title: "Use project JSON template",
    templateName: "team-default",
  });

  assert.equal(result.plan.tasks[0]?.title, "Draft requirements with the team template");
  assert.equal(result.plan.tasks[1]?.title, "Activate the team template plan");
});
```

- [ ] **Step 2: Run the focused core test to verify it fails**

Run: `npm test --workspace @veewo/claw-core -- --test-name-pattern "project JSON template"`

Expected: FAIL because `resolveSeedPlanTemplate()` only knows the built-in `default` template.

- [ ] **Step 3: Write the failing test for project JS template loading and bad export shape**

```ts
test("writePlan loads a project JS template from .claw/templates", async () => {
  const root = createFixture("plan-template-project-js");
  initProject({ cwd: root, projectName: "Project Js Template", planning: true, force: true });
  fs.mkdirSync(path.join(root, ".claw", "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "templates", "team-js-template.mjs"),
    `export default {
  id: "team-js-template",
  aliases: ["team-js"],
  planningEnabledStatus: "process.discussing",
  planningDisabledStatus: "process.active",
  planningTask: {
    title: "Plan with the JS template",
    detail: "Use {{planningSkill}} to build the plan.",
  },
  activationTask: {
    title: "Activate the JS template",
    detail: "Move to process.active after planning.",
    goalModeDetail: "If Goal Mode is enabled for this project, start Goal Mode.",
  },
};
`,
    "utf-8",
  );

  const result = await writePlan({
    cwd: root,
    title: "Use project JS template",
    templateName: "team-js-template",
  });

  assert.equal(result.plan.tasks[0]?.title, "Plan with the JS template");
});

test("writePlan rejects an invalid project template export shape", async () => {
  const root = createFixture("plan-template-project-invalid");
  initProject({ cwd: root, projectName: "Invalid Project Template", planning: true, force: true });
  fs.mkdirSync(path.join(root, ".claw", "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "templates", "broken-template.js"),
    `module.exports = { nope: true };\n`,
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
```

- [ ] **Step 4: Run the focused core test to verify both failures**

Run: `npm test --workspace @veewo/claw-core -- --test-name-pattern "project JS template|invalid project template"`

Expected: FAIL because there is no project template file loader or shape validation yet.

- [ ] **Step 5: Commit**

```bash
git add packages/core/test/core.test.ts
git commit -m "test: cover project plan template loading"
```

### Task 2: Add failing config and CLI tests for default template selection

**Files:**
- Modify: `D:\Users\chany\Documents\claw-kit\packages\core\test\core.test.ts`
- Modify: `D:\Users\chany\Documents\claw-kit\packages\cli\test\cli.test.ts`
- Reference: `D:\Users\chany\Documents\claw-kit\packages\core\src\context.ts`
- Reference: `D:\Users\chany\Documents\claw-kit\packages\cli\src\cli.ts`

- [ ] **Step 1: Write the failing core test for merged `defaultPlanTemplate`**

```ts
test("resolveContext deep-merges defaultPlanTemplate from project-override.json", () => {
  const root = createFixture("project-override-default-template");
  fs.mkdirSync(path.join(root, ".claw"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    `${JSON.stringify({
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
        embedding: { provider: "local", model: "Snowflake/snowflake-arctic-embed-m-v2.0" },
      },
      gitnexus: false,
    }, null, 2)}\n`,
    "utf-8",
  );
  fs.writeFileSync(
    path.join(root, ".claw", "project-override.json"),
    `${JSON.stringify({ defaultPlanTemplate: "personal-default" }, null, 2)}\n`,
    "utf-8",
  );

  const result = resolveContext(root);
  assert.equal(result.project.projectConfig?.defaultPlanTemplate, "personal-default");
});
```

- [ ] **Step 2: Run the focused core config test to verify it fails**

Run: `npm test --workspace @veewo/claw-core -- --test-name-pattern "defaultPlanTemplate"`

Expected: FAIL because `ProjectConfig` normalization does not know the new field.

- [ ] **Step 3: Write the failing CLI tests for project default template and explicit override**

```ts
test("cli plan create uses project-config defaultPlanTemplate when --template is omitted", () => {
  const root = createFixture("cli-plan-default-template");
  runClaw(["init", "--name", "CLI Plan Default Template"], root);
  fs.mkdirSync(path.join(root, ".claw", "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "templates", "team-default.json"),
    `${JSON.stringify({
      id: "team-default",
      aliases: [],
      planningEnabledStatus: "process.discussing",
      planningDisabledStatus: "process.active",
      planningTask: { title: "Project default planning task", detail: "Use {{planningSkill}} to refine this task." },
      activationTask: {
        title: "Project default activation task",
        detail: "Move to process.active after planning.",
        goalModeDetail: "If Goal Mode is enabled for this project, start Goal Mode.",
      },
    }, null, 2)}\n`,
    "utf-8",
  );

  const projectJsonPath = path.join(root, ".claw", "project.json");
  const projectConfig = JSON.parse(fs.readFileSync(projectJsonPath, "utf-8")) as JsonRecord;
  projectConfig.defaultPlanTemplate = "team-default";
  fs.writeFileSync(projectJsonPath, `${JSON.stringify(projectConfig, null, 2)}\n`, "utf-8");

  const result = runClaw(["plan", "create", "Uses configured template"], root);
  const tasks = ((result.plan as JsonRecord).tasks as JsonValue[]) ?? [];
  assert.equal(String((tasks[0] as JsonRecord).title), "Project default planning task");
});

test("cli plan create lets explicit --template override defaultPlanTemplate", () => {
  const root = createFixture("cli-plan-explicit-template-wins");
  runClaw(["init", "--name", "CLI Plan Explicit Template Wins"], root);
  fs.mkdirSync(path.join(root, ".claw", "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "templates", "config-default.json"),
    `${JSON.stringify({
      id: "config-default",
      aliases: [],
      planningEnabledStatus: "process.discussing",
      planningDisabledStatus: "process.active",
      planningTask: { title: "Config default planning task", detail: "Use {{planningSkill}} from config." },
      activationTask: {
        title: "Config default activation task",
        detail: "Move to process.active from config.",
        goalModeDetail: "If Goal Mode is enabled for this project, start Goal Mode.",
      },
    }, null, 2)}\n`,
    "utf-8",
  );
  fs.writeFileSync(
    path.join(root, ".claw", "templates", "explicit.json"),
    `${JSON.stringify({
      id: "explicit",
      aliases: [],
      planningEnabledStatus: "process.discussing",
      planningDisabledStatus: "process.active",
      planningTask: { title: "Explicit planning task", detail: "Use {{planningSkill}} from explicit template." },
      activationTask: {
        title: "Explicit activation task",
        detail: "Move to process.active from explicit template.",
        goalModeDetail: "If Goal Mode is enabled for this project, start Goal Mode.",
      },
    }, null, 2)}\n`,
    "utf-8",
  );

  const projectJsonPath = path.join(root, ".claw", "project.json");
  const projectConfig = JSON.parse(fs.readFileSync(projectJsonPath, "utf-8")) as JsonRecord;
  projectConfig.defaultPlanTemplate = "config-default";
  fs.writeFileSync(projectJsonPath, `${JSON.stringify(projectConfig, null, 2)}\n`, "utf-8");

  const result = runClaw(["plan", "create", "Uses explicit template", "--template", "explicit"], root);
  const tasks = ((result.plan as JsonRecord).tasks as JsonValue[]) ?? [];
  assert.equal(String((tasks[0] as JsonRecord).title), "Explicit planning task");
});
```

- [ ] **Step 4: Run the focused CLI tests to verify they fail**

Run: `npm test --workspace @veewo/claw -- --test-name-pattern "defaultPlanTemplate|explicit template"`

Expected: FAIL because the CLI currently passes through only the explicit flag and the core does not read a configured default.

- [ ] **Step 5: Commit**

```bash
git add packages/core/test/core.test.ts packages/cli/test/cli.test.ts
git commit -m "test: cover configured default plan templates"
```

### Task 3: Implement project template loading in core

**Files:**
- Modify: `D:\Users\chany\Documents\claw-kit\packages\core\src\plan-templates.ts`
- Modify: `D:\Users\chany\Documents\claw-kit\packages\core\src\templates\plans\default.ts`
- Modify: `D:\Users\chany\Documents\claw-kit\packages\core\src\plan.ts`
- Test: `D:\Users\chany\Documents\claw-kit\packages\core\test\core.test.ts`

- [ ] **Step 1: Add a minimal loader contract that can inspect project `.claw/templates`**

```ts
type ResolveSeedPlanTemplateInput = {
  projectRoot?: string;
  templateName?: string | null;
};

export async function resolveSeedPlanTemplate(input: ResolveSeedPlanTemplateInput): Promise<SeedPlanTemplate> {
  const normalized = input.templateName?.trim().toLowerCase() || "default";
  const projectMatch = input.projectRoot ? await loadProjectSeedTemplate(input.projectRoot, normalized) : null;
  if (projectMatch) {
    return projectMatch;
  }
  const builtinMatch = PLAN_TEMPLATES.find((template) =>
    template.id.toLowerCase() === normalized || template.aliases.some((alias) => alias.toLowerCase() === normalized),
  );
  if (builtinMatch) {
    return builtinMatch;
  }
  throw new ClawError("PROJECT_CONFIG_INVALID", `Unknown plan template "${input.templateName ?? normalized}".`, {
    templateName: input.templateName ?? normalized,
  });
}
```

- [ ] **Step 2: Implement project file loading for `.json`, `.js`, `.mjs`, and `.cjs`**

```ts
async function loadProjectSeedTemplate(projectRoot: string, normalizedTemplateName: string): Promise<SeedPlanTemplate | null> {
  const templatesDir = path.join(projectRoot, ".claw", "templates");
  const candidatePaths = [
    path.join(templatesDir, `${normalizedTemplateName}.json`),
    path.join(templatesDir, `${normalizedTemplateName}.js`),
    path.join(templatesDir, `${normalizedTemplateName}.mjs`),
    path.join(templatesDir, `${normalizedTemplateName}.cjs`),
  ].filter((candidate) => fs.existsSync(candidate));

  if (candidatePaths.length === 0) {
    return null;
  }
  if (candidatePaths.length > 1) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Multiple project plan templates matched "${normalizedTemplateName}".`, {
      templateName: normalizedTemplateName,
      candidatePaths,
    });
  }

  const templatePath = candidatePaths[0]!;
  const raw = templatePath.endsWith(".json")
    ? JSON.parse(fs.readFileSync(templatePath, "utf-8"))
    : await import(pathToFileURL(templatePath).href).then((module) => module.default ?? module);

  return validateSeedPlanTemplate(raw, templatePath);
}
```

- [ ] **Step 3: Add shape validation and keep rendering unchanged**

```ts
function validateSeedPlanTemplate(raw: unknown, templatePath: string): SeedPlanTemplate {
  const candidate = raw as Partial<SeedPlanTemplate>;
  if (
    !candidate ||
    typeof candidate !== "object" ||
    typeof candidate.id !== "string" ||
    !Array.isArray(candidate.aliases) ||
    typeof candidate.planningTask?.title !== "string" ||
    typeof candidate.planningTask?.detail !== "string" ||
    typeof candidate.activationTask?.title !== "string" ||
    typeof candidate.activationTask?.detail !== "string" ||
    typeof candidate.activationTask?.goalModeDetail !== "string"
  ) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Invalid plan template at ${templatePath}.`, {
      templatePath,
    });
  }
  return candidate as SeedPlanTemplate;
}
```

- [ ] **Step 4: Thread the async loader through `writePlan()`**

```ts
const template = await resolveSeedPlanTemplate({
  projectRoot: project.projectRoot,
  templateName,
});
```

And update `createSeedPlan()` plus any caller signatures so plan creation awaits template resolution without changing final plan shape.

- [ ] **Step 5: Run the focused core tests to verify they pass**

Run: `npm test --workspace @veewo/claw-core -- --test-name-pattern "project JSON template|project JS template|invalid project template"`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/plan-templates.ts packages/core/src/plan.ts packages/core/test/core.test.ts
git commit -m "feat: load project plan templates"
```

### Task 4: Implement `defaultPlanTemplate` config support

**Files:**
- Modify: `D:\Users\chany\Documents\claw-kit\packages\core\src\types.ts`
- Modify: `D:\Users\chany\Documents\claw-kit\packages\core\src\context.ts`
- Modify: `D:\Users\chany\Documents\claw-kit\packages\core\src\project-check.ts`
- Modify: `D:\Users\chany\Documents\claw-kit\packages\core\src\init.ts`
- Test: `D:\Users\chany\Documents\claw-kit\packages\core\test\core.test.ts`

- [ ] **Step 1: Add the config field to the core types**

```ts
export type ProjectConfig = {
  id?: string;
  name?: string;
  maxTasksToKeep?: number;
  planning?: boolean;
  goalMode?: boolean;
  truthDispatch?: "per_task" | "final_only";
  externalPlanningSkill?: string | null;
  externalTruthSkill?: string | null;
  externalAdrSkill?: string | null;
  defaultPlanTemplate?: string | null;
  contextPaths?: string[];
  memory?: {
```

- [ ] **Step 2: Normalize and merge the new field in runtime context**

```ts
function normalizeOptionalTemplateName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
```

Then wire it into both `normalizeProjectConfig()` implementations in `context.ts` and `project-check.ts`.

- [ ] **Step 3: Make protocol repair preserve an explicit `defaultPlanTemplate` field**

```ts
requireNullableString(config, "defaultPlanTemplate", issues);
```

And include:

```ts
defaultPlanTemplate: normalizeOptionalTemplateName(source?.defaultPlanTemplate),
```

in normalized output so `claw check` and `claw context` keep the field canonical.

- [ ] **Step 4: Let `createSeedPlan()` choose the effective template name from config**

```ts
const effectiveTemplateName = templateName?.trim() || projectConfig?.defaultPlanTemplate?.trim() || "default";
```

Then call the new loader with that effective name and the project root.

- [ ] **Step 5: Run the focused core and CLI tests to verify they pass**

Run: `npm test --workspace @veewo/claw-core -- --test-name-pattern "defaultPlanTemplate"`

Run: `npm test --workspace @veewo/claw -- --test-name-pattern "defaultPlanTemplate|explicit template"`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/context.ts packages/core/src/project-check.ts packages/core/src/init.ts packages/core/src/plan.ts packages/core/test/core.test.ts packages/cli/test/cli.test.ts
git commit -m "feat: support configured default plan templates"
```

### Task 5: Update CLI help and docs

**Files:**
- Modify: `D:\Users\chany\Documents\claw-kit\packages\cli\src\cli.ts`
- Modify: `D:\Users\chany\Documents\claw-kit\README.md`
- Modify: `D:\Users\chany\Documents\claw-kit\packages\cli\README.md`
- Modify: `D:\Users\chany\Documents\claw-kit\docs\project-json-reference.md`

- [ ] **Step 1: Update CLI help text to describe configured defaults**

```ts
description:
  "Create the task scope and initial plan from a template. Uses the explicit --template value when provided, otherwise the project's configured defaultPlanTemplate, and finally falls back to the built-in `default` template.",
options: [
  { flag: "--template <name>", detail: "Optional plan template name. Overrides the project's configured default template." },
],
```

Apply the same wording to `subplan create`.

- [ ] **Step 2: Document `.claw/templates` in the root README**

```md
Projects can define reusable plan templates directly under `.claw/templates`.
Supported formats are `.json`, `.js`, `.mjs`, and `.cjs`.
Use `defaultPlanTemplate` in `.claw/project.json` for a shared team default, or in `.claw/project-override.json` for a personal runtime override.
```

- [ ] **Step 3: Update CLI README and project config reference with examples**

```json
{
  "defaultPlanTemplate": "team-default"
}
```

```js
export default {
  id: "team-default",
  aliases: [],
  planningEnabledStatus: "process.discussing",
  planningDisabledStatus: "process.active",
  planningTask: {
    title: "Use the team planning flow",
    detail: "Use {{planningSkill}} to refine the request into executable work.",
  },
  activationTask: {
    title: "Enter process.active",
    detail: "After planning, move into process.active and continue execution.",
    goalModeDetail: "If Goal Mode is enabled for this project, start Goal Mode.",
  },
};
```

- [ ] **Step 4: Run a quick docs sanity grep**

Run: `rg -n "defaultPlanTemplate|\\.claw/templates|--template" README.md packages/cli/README.md docs/project-json-reference.md packages/cli/src/cli.ts`

Expected: matching lines in all four files with no stale “default is always default” wording.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/cli.ts README.md packages/cli/README.md docs/project-json-reference.md
git commit -m "docs: explain project plan templates"
```

### Task 6: Run final verification and close out

**Files:**
- Verify: `D:\Users\chany\Documents\claw-kit\packages\core\test\core.test.ts`
- Verify: `D:\Users\chany\Documents\claw-kit\packages\cli\test\cli.test.ts`
- Verify: `D:\Users\chany\Documents\claw-kit\docs\superpowers\specs\2026-06-29-project-plan-template-design.md`
- Verify: `D:\Users\chany\Documents\claw-kit\docs\superpowers\plans\2026-06-29-project-plan-template-implementation.md`

- [ ] **Step 1: Run the full targeted test slices together**

Run: `npm test --workspace @veewo/claw-core -- --test-name-pattern "project JSON template|project JS template|invalid project template|defaultPlanTemplate"`

Run: `npm test --workspace @veewo/claw -- --test-name-pattern "defaultPlanTemplate|explicit template"`

Expected: PASS in both workspaces.

- [ ] **Step 2: Run package builds for touched surfaces**

Run: `npm run build -w @veewo/claw-core`

Run: `npm run build -w @veewo/claw`

Expected: PASS with updated types and async template loading compiled cleanly.

- [ ] **Step 3: Review the final diff for scope discipline**

Run: `git diff -- packages/core/src packages/core/test packages/cli/src packages/cli/test README.md packages/cli/README.md docs/project-json-reference.md docs/superpowers/specs/2026-06-29-project-plan-template-design.md docs/superpowers/plans/2026-06-29-project-plan-template-implementation.md`

Expected: only template loading, config, tests, and docs changes for this round.

- [ ] **Step 4: Prepare closeout notes**

```md
- Added fixed-directory project plan templates under `.claw/templates`
- Added `defaultPlanTemplate` to canonical project config and override merge behavior
- Verified JSON and JS templates plus explicit CLI override precedence
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src packages/core/test packages/cli/src packages/cli/test README.md packages/cli/README.md docs/project-json-reference.md docs/superpowers/specs/2026-06-29-project-plan-template-design.md docs/superpowers/plans/2026-06-29-project-plan-template-implementation.md
git commit -m "feat: support project-owned plan templates"
```
