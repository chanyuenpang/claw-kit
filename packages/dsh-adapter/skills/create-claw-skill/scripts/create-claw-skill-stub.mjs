#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = parseArgs(process.argv.slice(2));
const skillName = requireArg(args, "skill-name");
const templateId = args["template-id"] ?? skillName;
const targetWork = args["target-work"] ?? `complete <target-work> with ${skillName}`;
const fallbackDoc = args["fallback-doc"] ?? "FALLBACK.md";
const outputDir = args["out"];
const templateVersion = await resolveTemplateVersion();

const files = {
  "SKILL.md": buildSkillEntry({ skillName, templateId, fallbackDoc }),
  "TEMPLATE.json": buildTemplate({ skillName, templateId, targetWork, templateVersion }),
  "CONTENT-COVERAGE.md": buildCoverage({ skillName, templateId, targetWork, fallbackDoc }),
  [fallbackDoc]: buildFallback({ skillName }),
};

if (args.help) {
  printHelp();
  process.exit(0);
}

if (outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  await Promise.all(
    Object.entries(files).map(([fileName, content]) =>
      fs.writeFile(path.join(outputDir, fileName), content, "utf8"),
    ),
  );
  console.log(`Created claw skill stub in ${outputDir}`);
} else {
  for (const [fileName, content] of Object.entries(files)) {
    console.log(`--- ${fileName} ---`);
    console.log(content.trimEnd());
    console.log();
  }
}

function parseArgs(argv) {
  const parsed = {};
  const allowed = new Set(["help", "skill-name", "template-id", "target-work", "fallback-doc", "out"]);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${token}`);
    }
    const key = token.slice(2);
    if (!allowed.has(key)) {
      throw new Error(`Unknown option: --${key}`);
    }
    if (key === "help") {
      parsed.help = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

function requireArg(parsed, key) {
  const value = parsed[key];
  if (!value?.trim()) {
    printHelp();
    throw new Error(`Missing required --${key}`);
  }
  return value.trim();
}

function printHelp() {
  console.log(`Usage:
node scripts/create-claw-skill-stub.mjs --skill-name <name> [options]

Options:
  --template-id <id>       Template id advertised by the skill entry. Defaults to skill name.
  --target-work <text>     Template goal wording. Defaults from skill name.
  --fallback-doc <file>    Adjacent plan-independent fallback. Defaults to FALLBACK.md.
  --out <dir>              Write generated files into this directory. Omit to print to stdout.
`);
}

function buildSkillEntry({ skillName, templateId, fallbackDoc }) {
  return `---
name: ${skillName}
description: TODO: describe when to use this claw skill.
---
# ${skillName}

TODO: Replace this sentence with the skill's concise purpose.

## Route By Task Ownership

Resolve \`<skill-dir>\` as the directory containing this loaded \`SKILL.md\`.

- Whole task: when this skill fully owns the current task, use \`claw plan create --template-file "<skill-dir>/TEMPLATE.json" --title "${skillName}"\`.
- Independent stage: when this skill fully owns one stage of a broader plan, use \`claw subplan create --parent <parent-task-name> --task-id <id> --template-file "<skill-dir>/TEMPLATE.json"\`. On hosts with Goal Mode, consume the returned goal handoff so the active parent goal completes before the child plan creates its own goal; never overwrite the parent goal. A batch is a repeated-stage case: invoke this skill once as a subplan for each stage.
- Mixed stage: when this skill only contributes part of a stage that mixes multiple skills, do not create its template plan. Read \`${fallbackDoc}\` and apply the relevant fallback guidance inside the owning workflow.
- Unavailable claw tooling: when the claw CLI or this template is unavailable, read \`${fallbackDoc}\` and run the direct workflow.

After plan or subplan creation, follow the returned \`workflowGuidance\`.

## References

- Fallback: \`${fallbackDoc}\`
- Content coverage: \`CONTENT-COVERAGE.md\`
- Template: \`TEMPLATE.json\`
- Optional skill-local references: add files under \`references/\` only when the source skill needs extra material that does not fit cleanly in \`SKILL.md\` or \`TEMPLATE.json\`
`;
}

function buildTemplate({ skillName, templateId, targetWork, templateVersion }) {
  return `${JSON.stringify({
    id: templateId,
    version: templateVersion,
    title: skillName,
    status: "process.active",
    goal: {
      text: `Use ${skillName} to ${targetWork}.`,
    },
    requirements: {
      summary: `TODO: Summarize what ${skillName} should accomplish.`,
      openQuestions: [],
      acceptanceCriteria: [
        "TODO: Replace with the source skill's required outcome.",
        "The claw entry, template, optional references, and fallback preserve the source behavior.",
      ],
    },
    tasks: [
      {
        id: 1,
        title: "Inspect inputs and define the workflow",
        detail: "Identify the concrete target, required inputs, ordered workflow, constraints, real control-flow branches, and verification. Do not ask for a route choice when source evidence can determine the shape.",
        status: "pending",
        guidance: {
          onDone: {
            default: {
              mergeMode: "override",
              summary: "Inputs are clear; continue with the core workflow.",
              nextsteps: [
                "Keep task-ownership routing and repeated high-signal reminders in SKILL.md.",
                "Use template tasks, guidance, rules, and references for structured execution information.",
                "Use the fallback document for full plan-independent behavior when needed.",
              ],
              nextTaskId: 2,
            },
          },
        },
      },
      {
        id: 2,
        title: "Run the core skill workflow",
        detail: "TODO: Replace with the source skill's core workflow steps. Keep structured workflow control in the template and keep only non-template supplement material in SKILL.md or optional skill-local references.",
        status: "pending",
        guidance: {
          onDone: {
            default: {
              mergeMode: "override",
              summary: "Core workflow completed; verify coverage and outcome.",
              nextsteps: [
                "Check the result against CONTENT-COVERAGE.md.",
                "Confirm important source behavior was not skipped or stranded outside SKILL.md, TEMPLATE.json, optional references, or fallback.",
              ],
              nextTaskId: 3,
            },
          },
        },
      },
      {
        id: 3,
        title: "Verify and close out",
        detail: "Run the source skill's verification checks, summarize the result, and record any risks or omitted source details.",
        status: "pending",
      },
    ],
    references: [
      {
        path: "CONTENT-COVERAGE.md",
        why: "Maps important source information to the converted claw skill surfaces.",
      },
    ],
    rules: [
      "Follow returned workflowGuidance before advancing.",
      "Keep the top-level TEMPLATE.json version equal to the current claw CLI version; when upgrading an older or unversioned template, inspect and optimize the whole package before advancing it.",
      "This executable template starts in process.active and does not need guidance.onPlanStart; add it only when a real discussion task deliberately bundles delivery into execution through the optional claw plan start shorthand.",
      "Keep structured execution information in template tasks, guidance, rules, and references.",
      "Keep task-ownership routing and non-template supplements in SKILL.md, and use skill-local references only when needed.",
      "Use choices only when the selected value changes the immediate downstream task or route.",
      "When choices exist, completionChoices is the only valid-id list and commandHints contains one claw task done --id <id> --choice <choice> template; do not repeat ids in nextsteps, and keep choiceId only as the persisted plan field.",
      "Do not claim completion until the verification task is done.",
    ],
  }, null, 2)}\n`;
}

function buildCoverage({ skillName, templateId, targetWork, fallbackDoc }) {
  return `# ${skillName} content coverage

## Source to converted-home mapping

- Trigger and task-ownership routing rules: TODO.
- Whole-task entry: \`SKILL.md\` routes to the adjacent \`TEMPLATE.json\` through \`--template-file\`.
- Stage entry: \`SKILL.md\` routes an independently owned stage, including each batch stage, to a subplan.
- Mixed-stage entry: \`SKILL.md\` routes partial capability use to the fallback without creating this template.
- Unavailable-tooling entry: \`SKILL.md\` routes to the same fallback when the claw CLI or template is unavailable.
- Skill-local template: \`TEMPLATE.json\` with id \`${templateId}\`.
- Template compatibility: top-level \`version\` is generated from the current claw package version; older or unversioned templates require a full create-claw-skill review before upgrade.
- Intended work: ${targetWork}.
- Lifecycle handoff: TODO; keep the default active start, or document why a real discussion delivery task adopts optional \`guidance.onPlanStart\`.
- Ordered workflow steps: TODO.
- Branch conditions: TODO.
- Tool constraints and helper files: TODO.
- Non-template supplement material kept in \`SKILL.md\`: TODO.
- Optional skill-local references: TODO if the source needs them.
- Verification gates: TODO.
- Plan-independent fallback behavior: \`${fallbackDoc}\`.

## Coverage checklist

- [ ] Important source triggers are represented.
- [ ] Important workflow steps are represented.
- [ ] Important branch behavior is represented.
- [ ] Required tools, commands, helper files, and links are represented.
- [ ] Information that does not fit template structure stays in \`SKILL.md\` or optional skill-local references.
- [ ] Verification requirements are represented.
- [ ] TEMPLATE.json declares the current claw CLI version after the package has been inspected and optimized.
- [ ] Anything too long for the template is preserved in \`SKILL.md\`, optional skill-local references, or the fallback document.
`;
}

function buildFallback({ skillName }) {
  return `# ${skillName} fallback

TODO: Preserve the original skill text or a direct, plan-independent version here. Use this fallback when the skill contributes only part of a mixed stage, or when the claw CLI/template is unavailable.
`;
}

async function resolveTemplateVersion() {
  let currentDir = path.dirname(fileURLToPath(import.meta.url));
  while (true) {
    for (const relativePath of ["package.json", path.join(".codex-plugin", "plugin.json")]) {
      try {
        const manifest = JSON.parse(await fs.readFile(path.join(currentDir, relativePath), "utf8"));
        const version = typeof manifest.version === "string" ? manifest.version.match(/^\d+\.\d+\.\d+/u)?.[0] : null;
        if (version) {
          return version;
        }
      } catch (error) {
        if (error?.code !== "ENOENT") {
          throw error;
        }
      }
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error("Unable to resolve the current claw CLI version for TEMPLATE.json.");
    }
    currentDir = parentDir;
  }
}
