#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const skillName = requireArg(args, "skill-name");
const templateId = args["template-id"] ?? skillName;
const targetWork = args["target-work"] ?? `complete <target-work> with ${skillName}`;
const fallbackDoc = args["fallback-doc"] ?? "FALLBACK.md";
const outputDir = args["out"];

const files = {
  "SKILL.md": buildSkillEntry({ skillName, templateId, targetWork, fallbackDoc }),
  "TEMPLATE.json": buildTemplate({ skillName, templateId, targetWork }),
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
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${token}`);
    }
    const key = token.slice(2);
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
  --target-work <text>     Batch/mixed target-work wording.
  --fallback-doc <file>    Adjacent fallback document. Defaults to FALLBACK.md.
  --out <dir>              Write generated files into this directory. Omit to print to stdout.
`);
}

function buildSkillEntry({ skillName, templateId, targetWork, fallbackDoc }) {
  return `---
name: ${skillName}
description: TODO: describe when to use this claw skill.
---
# ${skillName}

TODO: Replace this sentence with the skill's concise purpose.

## No-.claw Fallback

If the current workspace does not contain a \`.claw\` directory, read \`${fallbackDoc}\` directly and follow the fallback instructions.

## Entry Routing

- Direct single-target request: use \`claw plan create --template ${templateId} --title "${skillName}"\`.
- Active parent-plan task: use \`claw subplan create --parent <parent-task-name> --task-id <id> --template ${templateId}\` when execution reaches a task that explicitly asks to use this skill.
- Batch or mixed request: create a normal root claw plan first. Split the work into one task per target or coherent skill-shaped unit. Each target task should run this skill as an execution-time subplan, not perform the target work directly from the root plan.

Recommended batch task title:

\`Run a ${skillName} subplan, complete ${targetWork}\`

Recommended batch task detail:

\`Goal: run the ${skillName} subplan to complete ${targetWork}. This task is satisfied by creating and completing that target subplan. First run claw subplan create --parent <root-task-name> --task-id <id> --template ${templateId}, then follow the returned workflowGuidance inside that subplan until it completes. Record the subplan result in the root plan before marking this task done.\`

## References

- Fallback: \`${fallbackDoc}\`
- Content coverage: \`CONTENT-COVERAGE.md\`
- Template: \`TEMPLATE.json\`
- Optional skill-local references: add files under \`references/\` only when the source skill needs extra material that does not fit cleanly in \`SKILL.md\` or \`TEMPLATE.json\`
`;
}

function buildTemplate({ skillName, templateId, targetWork }) {
  return `${JSON.stringify({
    id: templateId,
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
        title: "Confirm route and inputs",
        detail: "Identify the concrete target, required inputs, and whether the route rules plus SKILL.md supplement are enough or whether optional skill-local references are needed.",
        status: "pending",
        guidance: {
          onDone: {
            default: {
              mergeMode: "override",
              summary: "Inputs are clear; continue with the core workflow.",
              nextsteps: [
                "Keep route rules and repeated high-signal reminders in SKILL.md.",
                "Use template tasks, guidance, rules, and references for structured execution information.",
                "Use the fallback document for full original wording when needed.",
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
      "Keep structured execution information in template tasks, guidance, rules, and references.",
      "Keep route rules and non-template supplements in SKILL.md, and use skill-local references only when needed.",
      "Do not claim completion until the verification task is done.",
    ],
  }, null, 2)}\n`;
}

function buildCoverage({ skillName, templateId, targetWork, fallbackDoc }) {
  return `# ${skillName} content coverage

## Source to converted-home mapping

- Trigger and routing rules: TODO.
- Direct entry: \`SKILL.md\` routes to \`claw plan create --template ${templateId}\`.
- Skill-local template: \`TEMPLATE.json\` with id \`${templateId}\`.
- Batch/mixed entry: \`SKILL.md\` includes the standard subplan route for ${targetWork}.
- Ordered workflow steps: TODO.
- Branch conditions: TODO.
- Tool constraints and helper files: TODO.
- Non-template supplement material kept in \`SKILL.md\`: TODO.
- Optional skill-local references: TODO if the source needs them.
- Verification gates: TODO.
- Long-form source wording: \`${fallbackDoc}\`.

## Coverage checklist

- [ ] Important source triggers are represented.
- [ ] Important workflow steps are represented.
- [ ] Important branch behavior is represented.
- [ ] Required tools, commands, helper files, and links are represented.
- [ ] Information that does not fit template structure stays in \`SKILL.md\` or optional skill-local references.
- [ ] Verification requirements are represented.
- [ ] Anything too long for the template is preserved in \`SKILL.md\`, optional skill-local references, or fallback.
`;
}

function buildFallback({ skillName }) {
  return `# ${skillName} fallback

TODO: Preserve the original skill text or a direct non-claw version of the skill here.
`;
}
