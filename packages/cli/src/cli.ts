#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import {
  buildDirectWorkflowGuidance,
  checkProjectProtocol,
  ClawError,
  buildPlanWorkflowGuidance,
  buildMemoryIndex,
  buildSessionStartDefaultPrompt,
  buildSessionStartRecoveredPrompt,
  editPlan,
  ensureProjectProtocol,
  enforceTaskRetention,
  ingestTruth,
  initProject,
  getTemplateTaskDoneChoices,
  resolvePlanTemplateFile,
  resolveProjectContext,
  resolveSessionBoundPlan,
  resolveContext,
  resolveSeedPlanTemplate,
  searchMemory,
  showPlan,
  createSubplan,
  switchTask,
  unbindSession,
  writePlan,
  type InitProjectInput,
  type InheritedFrom,
  type LeaveState,
  type MemoryScope,
  type PlanDocument,
  type PlanTask,
  type PlanViewModel,
  type ProjectConfig,
  type WorkflowGuidance,
} from "@veewo/claw-core";

const CLI_VERSION = readCliVersion();

type HelpOption = { flag: string; detail: string };

type HelpEntry = {
  usage: string[];
  description: string;
  summary?: string;
  options?: HelpOption[];
};

type HelpNode = HelpEntry & {
  subcommands?: Record<string, HelpEntry>;
};

const TOP_LEVEL_COMMANDS: { name: string; summary: string }[] = [
  { name: "init [options]", summary: "Initialize and normalize the .claw project surface." },
  { name: "context [--task <name>]", summary: "Resolve project context, auto-initializing or correcting .claw state." },
  { name: "check", summary: "Check and auto-correct .claw project protocol fields." },
  { name: "plan <subcommand> [options]", summary: "Plan lifecycle: create, edit, show, done." },
  { name: "template <subcommand> [options]", summary: "Plan template helpers such as validation." },
  { name: "task <subcommand> [options]", summary: "Task lifecycle helpers inside an existing plan." },
  { name: "subplan create [options]", summary: "Create a subplan nested under a parent task item." },
  { name: "switch-task --from <task> --to <task>", summary: "Switch the active task, carrying inherited context." },
  { name: "search [<query>] [options]", summary: "Recall project memory, truth, ADR, and declared docs." },
  { name: "truth ingest [options]", summary: "Ingest a truth document under .claw/truth." },
  { name: "hook <event-name>", summary: "Emit host hook output (e.g. SessionStart)." },
];

const COMMAND_HELP: Record<string, HelpNode> = {
  init: {
    usage: ["{script} init [options]"],
    description:
      "Initialize and normalize the .claw project surface in the current directory, writing project.json, memory.md, and .gitignore.",
    options: [
      { flag: "--id <project-id>", detail: "Project id (derived from --name if omitted)." },
      { flag: "--name <project-name>", detail: "Human-readable project name." },
      { flag: "--context-path <file>", detail: "Extra context path to track (repeatable)." },
      { flag: "--ext-path <path>", detail: "External doc path to index (repeatable)." },
      { flag: "--external-truth-skill <skill>", detail: "Skill id for external truth-writer dispatch." },
      { flag: "--external-adr-skill <skill>", detail: "Skill id for external adr-writer dispatch." },
      { flag: "--planning true|false", detail: "Enable planning-aware default template behavior (default true)." },
      { flag: "--external-planning-skill <skill>", detail: "Skill id for an external planning skill." },
      { flag: "--gitnexus true|false", detail: "Enable GitNexus integration (default false)." },
      { flag: "--max-tasks-to-keep <n>", detail: "Max active tasks before archival pruning (default 99)." },
      { flag: "--force", detail: "Overwrite an existing .claw project." },
    ],
  },
  context: {
    usage: ["{script} context [--task <name>]"],
    description:
      "Resolve and return the current project context, auto-initializing or auto-correcting .claw state when needed. Used by host startup recovery.",
    options: [
      { flag: "--task <name>", detail: "Resolve context scoped to a specific task." },
    ],
  },
  check: {
    usage: ["{script} check"],
    description:
      "Check the .claw project protocol and auto-correct any missing or malformed fields in project.json. Returns issues found and the paths that were fixed.",
  },
  plan: {
    usage: ["{script} plan <subcommand> [options]"],
    description: "Plan lifecycle commands for a task scope.",
    subcommands: {
      create: {
        usage: [
          "{script} plan create \"<title>\" [--goal <text>]",
          "{script} plan create --title <text> [--goal <text>] [--template <name>]",
        ],
        description:
          "Create the task scope and initial plan from a template. Uses explicit `--template` first, otherwise the project's configured `defaultPlanTemplate`, and finally falls back to the built-in `default`; planning-enabled projects start in process.discussing with the default planning bridge tasks, while planning-disabled projects start directly in process.active with one executable task.",
        summary: "Create the task scope and initial plan.",
        options: [
          { flag: "--title <text>", detail: "Task title (required unless a positional title is given)." },
          { flag: "--goal <text>", detail: "Optional goal text." },
          { flag: "--template <name>", detail: "Optional plan template name. Overrides the project's configured default template." },
        ],
      },
      edit: {
        usage: ["{script} plan edit --task <name> [options]"],
        description:
          "Edit an existing plan: update status, append tasks, apply merge-patch updates, add references, rules, and key decisions.",
        summary: "Edit a plan: status, tasks, references, rules, key decisions.",
        options: [
          { flag: "--task <name>", detail: "(required) Task name to edit." },
          { flag: "--plan <relative-path>", detail: "Plan file relative to the task dir (defaults to the active plan)." },
          { flag: "--plan-status <status>", detail: "Set plan status (e.g. process.active, process.wait)." },
          { flag: "--task-id <id>", detail: "Target a specific task by id for status updates." },
          { flag: "--task-status <status>", detail: "Set the task status (e.g. pending, in_progress, done)." },
          { flag: "--task-choice <choice-id>", detail: "Record the route choice when a task is marked done through a route-aware template." },
          { flag: "--append-tasks <json-file>", detail: "Append tasks from a JSON array file." },
          { flag: "--patch <json-file>", detail: "Apply a JSON merge-patch object from a file. Objects merge recursively, null deletes fields, arrays replace the whole field." },
          { flag: "--rule <text>", detail: "Append a rule (repeatable)." },
          { flag: "--key-decision <text>", detail: "Append a key decision (repeatable)." },
          { flag: "--reference-path <path>", detail: "Add a reference (requires --reference-why)." },
          { flag: "--reference-why <why>", detail: "Why the reference matters (requires --reference-path)." },
          { flag: "--summary <text>", detail: "Optional change summary." },
        ],
      },
      show: {
        usage: ["{script} plan show --task <name> [--plan <relative-path>]"],
        description:
          "Show the current plan (status, goal, tasks, references) for a task, including archived plans.",
        summary: "Show the current plan for a task.",
        options: [
          { flag: "--task <name>", detail: "(required) Task name to show." },
          { flag: "--plan <relative-path>", detail: "Plan file relative to the task dir." },
        ],
      },
      done: {
        usage: ["{script} plan done --task <name> [--summary <text>] [options]"],
        description:
          "Close out a plan: write a retrospective, mark status end.completed with completedAt, retain it for at least one hour, sweep older completed tasks into the archive, and queue the async completion refresh.",
        summary: "Close out a plan with a retrospective and queue completion refresh.",
        options: [
          { flag: "--task <name>", detail: "(required) Task name to close out." },
          { flag: "--plan <relative-path>", detail: "Plan file relative to the task dir." },
          { flag: "--summary <text>", detail: "Retrospective summary (required unless a patch provides retrospective.summary)." },
          { flag: "--change-summary <text>", detail: "Optional change summary." },
          { flag: "--patch <json-file>", detail: "Apply a JSON merge-patch object (for example one that sets retrospective.summary)." },
        ],
      },
    },
  },
  template: {
    usage: ["{script} template <subcommand> [options]"],
    description: "Helpers for inspecting and validating plan templates.",
    subcommands: {
      validate: {
        usage: [
          "{script} template validate --template <name>",
          "{script} template validate --file <path>",
          "{script} template validate <name>",
        ],
        description:
          "Validate through the same template resolver used by plan create and subplan create. Use `--template` for built-in, project, package, or skill-local templates, or `--file` to validate a specific template file directly.",
        summary: "Validate a plan template.",
        options: [
          { flag: "--template <name>", detail: "Template id resolved from built-ins, project templates, packages, and skill-local templates." },
          { flag: "--file <path>", detail: "Explicit template file path to validate." },
        ],
      },
    },
  },
  task: {
    usage: ["{script} task <subcommand> [options]"],
    description: "Task-focused helpers layered on top of plan edits.",
    subcommands: {
      done: {
        usage: ["{script} task done --task <name> --id <number> [--choice <choice-id>] [--plan <relative-path>]"],
        description:
          "Mark a task item as done. Route-aware templates may require `--choice`, and the selected choice is persisted as `task.choiceId` in the plan state.",
        summary: "Mark a task item as done, optionally recording a routing choice.",
        options: [
          { flag: "--task <name>", detail: "(required) Task name to edit." },
          { flag: "--id <number>", detail: "(required) Task item id to mark done." },
          { flag: "--choice <choice-id>", detail: "Route choice id required by templates that define guidance.onDone.choices." },
          { flag: "--plan <relative-path>", detail: "Plan file relative to the task dir (defaults to the active plan)." },
        ],
      },
    },
  },
  subplan: {
    usage: ["{script} subplan <subcommand> [options]"],
    description: "Subplan lifecycle commands nested under a parent task.",
    subcommands: {
      create: {
        usage: ["{script} subplan create --parent <task-name> --task-id <number> [--template <name>]"],
        description:
          "Create a flat subplan file under the task directory. Uses explicit `--template` first, otherwise the project's configured `defaultPlanTemplate`, and finally falls back to the built-in `default`. The current session binding switches to the subplan and returns to its parent when the subplan ends.",
        summary: "Create a subplan under a parent task's task item.",
        options: [
          { flag: "--parent <task-name>", detail: "(required) Parent task name." },
          { flag: "--task-id <number>", detail: "(required) Parent task item id to split into a subplan." },
          { flag: "--template <name>", detail: "Optional plan template name. Overrides the project's configured default template." },
        ],
      },
    },
  },
  "switch-task": {
    usage: ["{script} switch-task --from <task> --to <task> [options]"],
    description:
      "Switch the active task from one to another, carrying inherited context and recording the leave state.",
    options: [
      { flag: "--from <task>", detail: "(required) Current task to leave." },
      { flag: "--to <task>", detail: "(required) Task to switch to." },
      { flag: "--reason <reason>", detail: "Leave reason (recorded in leave state)." },
      { flag: "--mode <mode>", detail: "Inheritance mode for context carried over." },
      { flag: "--history-limit <n>", detail: "Max history items to carry." },
    ],
  },
  search: {
    usage: ["{script} search [<query>] [--limit <n>]", "{script} search index --refresh"],
    description:
      "Project-scoped recall over .claw memory, truth, ADR, and declared markdown docs. Use a positional query or --query. Task-local scope (--task/--scope) is rejected; put task materials in plan.references instead.",
    options: [
      { flag: "--query <text>", detail: "Search query (or pass the query positionally)." },
      { flag: "--limit <n>", detail: "Max number of results." },
    ],
    subcommands: {
      index: {
        usage: ["{script} search index --refresh"],
        description:
          "Build or rebuild the project vector index from markdown memory paths. Required before the first project-scoped search.",
        summary: "Build or rebuild the project vector index from markdown memory paths.",
        options: [
          { flag: "--refresh", detail: "(required) Rebuild the project vector index." },
        ],
      },
    },
  },
  truth: {
    usage: ["{script} truth <subcommand> [options]"],
    description: "Truth document ingestion under .claw/truth.",
    subcommands: {
      ingest: {
        usage: [
          "{script} truth ingest --target <relative-path> (--input <file> | --content <text>) [--append]",
        ],
        description: "Ingest a truth document under .claw/truth at the given relative target path.",
        summary: "Ingest a truth document from a file or inline content.",
        options: [
          { flag: "--target <relative-path>", detail: "(required) Path under .claw/truth (e.g. features/foo.md)." },
          { flag: "--input <file>", detail: "Read content from a file (mutually exclusive with --content)." },
          { flag: "--content <text>", detail: "Inline content (mutually exclusive with --input)." },
          { flag: "--append", detail: "Append to an existing truth file instead of overwriting." },
        ],
      },
    },
  },
  hook: {
    usage: ["{script} hook <event-name>"],
    description:
      "Emit host hook output. `claw hook SessionStart` reads a JSON payload from stdin and emits the SessionStart additionalContext for .claw projects; stays quiet outside .claw projects. Other events are logged to ~/.codex/claw-kit-hook.log.",
    options: [
      { flag: "<event-name>", detail: "(required) Hook event name (e.g. SessionStart)." },
    ],
  },
  "internal-completion-refresh": {
    usage: ["{script} internal-completion-refresh --cwd <dir> --task <name> --status-file <path>"],
    description:
      "Internal: runs the background completion refresh (memory reindex + optional gitnexus refresh) and writes status to --status-file. Spawned detached by plan done / direct; not intended for direct use.",
    options: [
      { flag: "--cwd <dir>", detail: "(required) Project root." },
      { flag: "--task <name>", detail: "(required) Task name." },
      { flag: "--status-file <path>", detail: "(required) Status file path to update." },
    ],
  },
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args.shift();

  if (command === "--help" || command === "-h") {
    printTopLevelUsage();
    return;
  }
  if (command === "--version" || command === "-v") {
    process.stdout.write(`${CLI_VERSION}\n`);
    return;
  }

  if (
    command &&
    command !== "help" &&
    !command.startsWith("-") &&
    args.some((a) => a === "--help" || a === "-h")
  ) {
    printHelp(resolveHelpTopic(command, args));
    return;
  }

  try {
    switch (command) {
      case "init":
        const initInput: InitProjectInput = {
          cwd: process.cwd(),
          version: CLI_VERSION,
          projectId: readOptionalFlag(args, "--id"),
          projectName: readOptionalFlag(args, "--name"),
          maxTasksToKeep: readOptionalNumber(args, "--max-tasks-to-keep"),
          externalTruthSkill: readOptionalFlag(args, "--external-truth-skill") ?? null,
          externalAdrSkill: readOptionalFlag(args, "--external-adr-skill") ?? null,
          planning: readBooleanValueFlag(args, "--planning"),
          externalPlanningSkill: readOptionalFlag(args, "--external-planning-skill") ?? null,
          contextPaths: readRepeatedFlag(args, "--context-path"),
          externalDocPaths: readRepeatedFlag(args, "--ext-path"),
          gitnexusEnabled: readBooleanValueFlag(args, "--gitnexus") ?? false,
          force: readBooleanFlag(args, "--force"),
        };
        printJson(
          initProject(initInput),
        );
        return;
      case "context":
        printJson(await runContextCommand(args));
        return;
      case "check":
        const checkResult = ensureProjectProtocol(process.cwd());
        printJson({
          command: "check",
          ok: checkResult.ok,
          changed: checkResult.changed,
          projectRoot: checkResult.projectRoot,
          projectJsonPath: checkResult.projectJsonPath,
          issueCountBefore: checkResult.issueCountBefore,
          fixedPaths: checkResult.fixedPaths,
        });
        return;
      case "plan":
        await runPlan(args);
        return;
      case "template":
        await runTemplate(args);
        return;
      case "task":
        await runTask(args);
        return;
      case "subplan":
        await runSubplan(args);
        return;
      case "switch-task":
        printJson(
          switchTask({
            cwd: process.cwd(),
            fromTask: readRequiredFlag(args, "--from"),
            toTask: readRequiredFlag(args, "--to"),
            reason: readOptionalFlag(args, "--reason") as LeaveState["reason"] | undefined,
            mode: readOptionalFlag(args, "--mode") as InheritedFrom["mode"] | undefined,
            historyLimit: readOptionalNumber(args, "--history-limit"),
          }),
        );
        return;
      case "search":
        runSearch(args);
        return;
      case "direct":
        runDirect(args);
        return;
      case "truth":
        runTruth(args);
        return;
      case "hook":
        await runHook(args);
        return;
      case "help":
        printHelp(args);
        return;
      case "internal-completion-refresh":
        runInternalCompletionRefresh(args);
        return;
      default:
        printTopLevelUsage();
        process.exitCode = 1;
    }
  } catch (error) {
    handleError(error);
  }
}

async function runPlan(args: string[]): Promise<void> {
  const subcommand = args.shift();
  switch (subcommand) {
    case "create":
      rejectFlags(args, ["--task", "--plan", "--content", "--status", "--plan-status", "--parent-task-id", "--description"]);
      const explicitTitle = readOptionalFlag(args, "--title");
      const explicitTemplate = readOptionalFlag(args, "--template");
      const title = explicitTitle ?? readOptionalPositionalArg(args);
      const templateName = explicitTemplate;
      if (!title) {
        throw new ClawError(
          "PROJECT_CONFIG_INVALID",
          "plan create requires a title. Use `claw plan create \"<title>\"` or `claw plan create --title \"<title>\"`.",
        );
      }
      const result = await writePlan({
        cwd: process.cwd(),
        templateName,
        title,
        goalText: readOptionalFlag(args, "--goal"),
        ownerSessionKey: resolveOwnerSessionKey() ?? undefined,
        host: process.env.CLAW_HOST ?? undefined,
      });
      assertNoRemainingArgs(args, "plan create");
      printJson(compactPlanCommandResult("plan.create", result));
      return;
    case "edit": {
      const patchPath = readOptionalFlag(args, "--patch");
      const appendTasksPath = readOptionalFlag(args, "--append-tasks");
      const referencePath = readOptionalFlag(args, "--reference-path");
      const referenceWhy = readOptionalFlag(args, "--reference-why");
      const mergedPatch = mergeEditPatchFlags(
        patchPath ? readJson<Partial<PlanDocument>>(patchPath) : undefined,
        readRepeatedFlag(args, "--rule"),
        readRepeatedFlag(args, "--key-decision"),
        referencePath,
        referenceWhy,
      );
      const result = await editPlan({
        cwd: process.cwd(),
        taskName: readRequiredFlag(args, "--task"),
        planFile: readOptionalFlag(args, "--plan"),
        changeSummary: readOptionalFlag(args, "--summary"),
        patch: mergedPatch,
        planStatus: readOptionalFlag(args, "--plan-status"),
        taskId: readOptionalNumber(args, "--task-id"),
        taskStatus: readOptionalFlag(args, "--task-status") as PlanTask["status"] | undefined,
        taskChoiceId: readOptionalFlag(args, "--task-choice"),
        appendTasks: appendTasksPath ? readJson<PlanTask[]>(appendTasksPath) : undefined,
        host: process.env.CLAW_HOST ?? undefined,
        ownerSessionKey: resolveOwnerSessionKey() ?? undefined,
      });
      printJson(compactPlanCommandResult("plan.edit", result));
      return;
    }
    case "done": {
      const patchPath = readOptionalFlag(args, "--patch");
      const summary = readOptionalFlag(args, "--summary");
      const patch = patchPath ? readJson<Partial<PlanDocument>>(patchPath) : undefined;
      const mergedPatch = mergeDonePatch(patch, summary);
      if (!mergedPatch?.retrospective?.summary?.trim()) {
        throw new ClawError(
          "PROJECT_CONFIG_INVALID",
          "plan done requires --summary or a patch file containing retrospective.summary.",
        );
      }
      ensureGitNexusReadyForPlanDone(process.cwd());
      const result = await editPlan({
        cwd: process.cwd(),
        taskName: readRequiredFlag(args, "--task"),
        planFile: readOptionalFlag(args, "--plan"),
        changeSummary: readOptionalFlag(args, "--change-summary"),
        patch: mergedPatch,
        planStatus: "end.completed",
        host: process.env.CLAW_HOST ?? undefined,
        ownerSessionKey: resolveOwnerSessionKey() ?? undefined,
      });
      const completionRefresh = queueCompletionRefresh({
        cwd: process.cwd(),
        taskName: result.taskName,
      });
      printJson(compactPlanCommandResult("plan.done", result, completionRefresh));
      return;
    }
    case "show": {
      const result = showPlan({
        cwd: process.cwd(),
        taskName: readRequiredFlag(args, "--task"),
        planFile: readOptionalFlag(args, "--plan"),
      });
      printJson({
        ok: true,
        command: "plan.show",
        taskName: result.taskName,
        planFile: result.planFile,
        planPath: result.planPath,
        ...(result.archived ? { archived: true } : {}),
        planStatus: result.plan.status,
        planView: result.planView,
      });
      return;
    }
    default:
      throw new ClawError("PROJECT_CONFIG_INVALID", `Unknown plan subcommand "${subcommand ?? ""}".`);
  }
}

async function runTemplate(args: string[]): Promise<void> {
  const subcommand = args.shift();
  switch (subcommand) {
    case "validate": {
      const templateName = readOptionalFlag(args, "--template") ?? readOptionalPositionalArg(args);
      const templateFile = readOptionalFlag(args, "--file");
      if (!templateName && !templateFile) {
        throw new ClawError(
          "PROJECT_CONFIG_INVALID",
          "template validate requires either `--template <name>` or `--file <path>`.",
        );
      }
      if (templateName && templateFile) {
        throw new ClawError(
          "PROJECT_CONFIG_INVALID",
          "template validate accepts either `--template` or `--file`, but not both.",
        );
      }
      assertNoRemainingArgs(args, "template validate");

      const project = resolveProjectContext(process.cwd());
      const template = templateFile
        ? await resolvePlanTemplateFile(path.resolve(process.cwd(), templateFile))
        : await resolveSeedPlanTemplate({
            projectRoot: project.projectRoot,
            templateName,
          });
      const choiceRequiredTasks = template.tasks.flatMap((task) => {
        const choiceIds = Object.keys(getTemplateTaskDoneChoices(template, task.id) ?? {});
        return choiceIds.length > 0 ? [{ taskId: task.id, choiceIds }] : [];
      });

      printJson({
        command: "template.validate",
        ok: true,
        templateId: template.id,
        source: template.source,
        ...(template.templatePath ? { templatePath: template.templatePath } : {}),
        status: template.status,
        taskCount: template.tasks.length,
        taskIds: template.tasks.map((task) => task.id),
        choiceRequiredTasks,
        ...(template.configOverride ? { configOverride: template.configOverride } : {}),
      });
      return;
    }
    default:
      throw new ClawError("PROJECT_CONFIG_INVALID", `Unknown template subcommand "${subcommand ?? ""}".`, {
        command: "template",
        subcommand,
      });
  }
}

async function runTask(args: string[]): Promise<void> {
  const subcommand = args.shift();
  switch (subcommand) {
    case "done": {
      const result = await editPlan({
        cwd: process.cwd(),
        taskName: readRequiredFlag(args, "--task"),
        planFile: readOptionalFlag(args, "--plan"),
        taskId: readRequiredNumber(args, "--id"),
        taskStatus: "done",
        taskChoiceId: readOptionalFlag(args, "--choice"),
        host: process.env.CLAW_HOST ?? undefined,
        ownerSessionKey: resolveOwnerSessionKey() ?? undefined,
      });
      assertNoRemainingArgs(args, "task done");
      printJson(compactPlanCommandResult("task.done", result));
      return;
    }
    default:
      throw new ClawError("PROJECT_CONFIG_INVALID", `Unknown task subcommand "${subcommand ?? ""}".`);
  }
}

function runSearch(args: string[]): void {
  const subcommand = args[0];
  if (subcommand === "index") {
    args.shift();
    const refresh = readBooleanFlag(args, "--refresh");
    if (!refresh) {
      throw new ClawError(
        "PROJECT_CONFIG_INVALID",
        "claw search index requires --refresh.",
      );
    }
    assertNoRemainingArgs(args, "search index");
    printJson({
      ok: true,
      command: "search.index.refresh",
      ...buildMemoryIndex({
        cwd: process.cwd(),
        scope: "project",
      }),
    });
    return;
  }
  if (args.includes("--scope") || args.includes("--task")) {
    throw new ClawError(
      "PROJECT_CONFIG_INVALID",
      "claw search is project-scoped only. Put task-specific materials in plan.references instead of using task-local search.",
    );
  }
  printJson({
    ok: true,
    command: "search",
    ...searchMemory({
      cwd: process.cwd(),
      limit: readOptionalNumber(args, "--limit"),
      query: readRequiredSearchQuery(args),
      scope: "project",
    }),
  });
}

function runDirect(args: string[]): void {
  assertNoRemainingArgs(args, "direct");
  const completionRefresh = queueCompletionRefresh({
    cwd: process.cwd(),
    taskName: "__direct__",
    includeTaskRetention: false,
    includeTaskMemory: false,
    statusLabel: "direct",
  });
  printJson(
    compactDirectCommandResult(
      "direct",
      buildDirectWorkflowGuidance({
        projectConfig: resolveProjectContext(process.cwd()).projectConfig,
        host: process.env.CLAW_HOST ?? undefined,
      }),
      completionRefresh,
    ),
  );
}

type JsonRecord = Record<string, unknown>;

async function runContextCommand(
  args: string[],
  cwd = process.cwd(),
  ownerSessionKey = resolveOwnerSessionKey(),
): Promise<Record<string, unknown>> {
  const taskName = readOptionalFlag(args, "--task");
  let initialized = false;
  let corrected = false;
  let fixedPaths: string[] = [];

  try {
    const ensureResult = ensureProjectProtocol(cwd);
    corrected = ensureResult.changed;
    fixedPaths = ensureResult.fixedPaths;
  } catch (error) {
    if (!(error instanceof ClawError) || error.code !== "CLAW_DIR_NOT_FOUND") {
      throw error;
    }
    initProject({ cwd, version: CLI_VERSION });
    initialized = true;
  }

  let resolved = resolveContext(cwd, taskName);
  const versionSync = syncProjectVersionWithCli(cwd, resolved.project);
  if (versionSync.projectVersionAligned) {
    corrected = true;
    if (!fixedPaths.includes("project.json")) {
      fixedPaths.push("project.json");
    }
    resolved = resolveContext(cwd, taskName);
  }
  const activeWorkflow =
    !taskName && ownerSessionKey
      ? await tryResolveActiveWorkflowSnapshot(cwd, ownerSessionKey)
      : null;

  return {
    ...resolved,
    ...(activeWorkflow ? { activeWorkflow } : {}),
    protocolCheck: checkProjectProtocol(cwd),
    startupRecovery: {
      initialized,
      corrected,
      fixedPaths,
      versionSync,
    },
  };
}

type ContextVersionSyncResult = {
  cliVersion: string;
  projectVersion: string | null;
  projectVersionAligned: boolean;
  cliVersionLagging: boolean;
  updateAvailable: boolean;
  autoUpdateEnabled: boolean;
  updateSkill: "claw-kit:update";
  latestPublishedVersion?: string | null;
  message?: string;
};

function syncProjectVersionWithCli(cwd: string, project: ReturnType<typeof resolveProjectContext>): ContextVersionSyncResult {
  const projectVersion = normalizeVersionString(project.projectConfig?.version);
  const autoUpdateEnabled = project.projectConfig?.autoUpdate === true;
  if (!projectVersion) {
    updateProjectJsonVersion(project.projectJsonPath, CLI_VERSION);
    return {
      cliVersion: CLI_VERSION,
      projectVersion: null,
      projectVersionAligned: true,
      cliVersionLagging: false,
      updateAvailable: false,
      autoUpdateEnabled,
      updateSkill: "claw-kit:update",
    };
  }

  const comparison = compareSemver(projectVersion, CLI_VERSION);
  if (comparison < 0) {
    updateProjectJsonVersion(project.projectJsonPath, CLI_VERSION);
    return {
      cliVersion: CLI_VERSION,
      projectVersion,
      projectVersionAligned: true,
      cliVersionLagging: false,
      updateAvailable: false,
      autoUpdateEnabled,
      updateSkill: "claw-kit:update",
    };
  }

  if (comparison === 0) {
    return {
      cliVersion: CLI_VERSION,
      projectVersion,
      projectVersionAligned: false,
      cliVersionLagging: false,
      updateAvailable: false,
      autoUpdateEnabled,
      updateSkill: "claw-kit:update",
    };
  }

  const latestPublishedVersion = resolveLatestPublishedClawVersion(cwd);
  const updateAvailable = !!latestPublishedVersion && compareSemver(latestPublishedVersion, CLI_VERSION) > 0;
  if (latestPublishedVersion && compareSemver(latestPublishedVersion, projectVersion) < 0) {
    return {
      cliVersion: CLI_VERSION,
      projectVersion,
      projectVersionAligned: false,
      cliVersionLagging: true,
      updateAvailable,
      autoUpdateEnabled,
      updateSkill: "claw-kit:update",
      latestPublishedVersion,
      message: `Project config version ${projectVersion} is newer than CLI ${CLI_VERSION}, and npm latest is only ${latestPublishedVersion}.`,
    };
  }

  return {
    cliVersion: CLI_VERSION,
    projectVersion,
    projectVersionAligned: false,
    cliVersionLagging: true,
    updateAvailable,
    autoUpdateEnabled,
    updateSkill: "claw-kit:update",
    latestPublishedVersion,
    message: updateAvailable
      ? `Published claw-kit ${latestPublishedVersion} is newer than local CLI ${CLI_VERSION}.`
      : `Project config version ${projectVersion} is newer than CLI ${CLI_VERSION}, but no newer published claw CLI was found.`,
  };
}

function runTruth(args: string[]): void {
  const subcommand = args.shift();
  switch (subcommand) {
    case "ingest": {
      const inputPath = readOptionalFlag(args, "--input");
      const content = inputPath ? fs.readFileSync(inputPath, "utf-8") : readRequiredFlag(args, "--content");
      printJson(
        ingestTruth({
          cwd: process.cwd(),
          target: readRequiredFlag(args, "--target"),
          content,
          append: readBooleanFlag(args, "--append"),
        }),
      );
      return;
    }
    default:
      throw new ClawError("PROJECT_CONFIG_INVALID", `Unknown truth subcommand "${subcommand ?? ""}".`);
  }
}

async function runHook(args: string[]): Promise<void> {
  const eventName = args.shift();
  if (!eventName) {
    throw new ClawError("PROJECT_CONFIG_INVALID", "claw hook requires an event name.");
  }
  if (eventName === "SessionStart") {
    await runSessionStartHook();
    return;
  }
  const project = tryResolveHookProject(process.cwd());
  if (!project) {
    printJson({
      ok: true,
      command: "hook",
      eventName,
      skipped: true,
      reason: "cwd is not inside a .claw project",
    });
    return;
  }
  const logPath = path.join(process.env.USERPROFILE ?? process.env.HOME ?? process.cwd(), ".codex", "claw-kit-hook.log");
  const record = {
    timestamp: new Date().toISOString(),
    eventName,
    cwd: process.cwd(),
    projectRoot: project.projectRoot,
    clawDir: project.clawDir,
    projectId: project.projectId,
    projectName: project.projectName,
    argv: args,
  };
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`, "utf-8");
  printJson({
    ok: true,
    command: "hook",
    eventName,
    skipped: false,
    projectRoot: project.projectRoot,
    clawDir: project.clawDir,
    logPath,
  });
}

async function runSessionStartHook(): Promise<void> {
  const payload = await readStdinJson();
  const hookCwd = resolveHookCwd(payload);
  const ownerSessionKey = resolveOwnerSessionKey(payload);

  if (!hookCwd || !containsClawDir(hookCwd)) {
    return;
  }

  try {
    const context = await runContextCommand([], hookCwd, ownerSessionKey);
    const additionalContext = buildSessionStartAdditionalContext(context, hookCwd);

    if (!additionalContext) {
      return;
    }

    process.stdout.write(
      `${JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext,
        },
      })}\n`,
    );
  } catch {
    return;
  }
}

function tryResolveHookProject(cwd: string): ReturnType<typeof resolveProjectContext> | null {
  try {
    return resolveProjectContext(cwd);
  } catch (error) {
    if (error instanceof ClawError && error.code === "CLAW_DIR_NOT_FOUND") {
      return null;
    }
    throw error;
  }
}

function resolveHookCwd(payload: unknown): string | null {
  if (payload && typeof payload === "object" && typeof (payload as { cwd?: unknown }).cwd === "string") {
    const cwd = (payload as { cwd: string }).cwd.trim();
    return cwd ? cwd : null;
  }
  const cwd = process.cwd().trim();
  return cwd ? cwd : null;
}

function containsClawDir(cwd: string): boolean {
  try {
    const startDir = path.resolve(cwd);
    const tempDir = safeResolveTempDir();
    let current = startDir;
    while (true) {
      if (fs.existsSync(path.join(current, ".claw")) && shouldTreatHookClawDirAsProjectRoot(current, startDir, tempDir)) {
        return true;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        return false;
      }
      current = parent;
    }
  } catch {
    return false;
  }
}

function shouldTreatHookClawDirAsProjectRoot(
  candidateRoot: string,
  startDir: string,
  tempDir: string | null,
): boolean {
  const candidate = path.resolve(candidateRoot);
  const start = path.resolve(startDir);
  if (tempDir && isWithinDir(start, tempDir) && candidate !== tempDir && isWithinDir(tempDir, candidate)) {
    return false;
  }
  return true;
}

function isWithinDir(target: string, root: string): boolean {
  return target === root || target.startsWith(`${root}${path.sep}`);
}

function safeResolveTempDir(): string | null {
  try {
    return path.resolve(os.tmpdir());
  } catch {
    return null;
  }
}

function buildSessionStartAdditionalContext(context: Record<string, unknown>, sessionCwd: string): string | null {
  const versionSyncPrompt = buildVersionSyncPrompt(context);
  const activeWorkflow = context.activeWorkflow as JsonRecord | undefined;
  if (activeWorkflow) {
    return buildRecoveredWorkflowAdditionalContext(activeWorkflow, versionSyncPrompt);
  }

  const project = context.project as JsonRecord | undefined;
  if (!project) {
    return null;
  }

  const projectName = typeof project.projectName === "string" && project.projectName.trim()
    ? project.projectName.trim()
    : typeof project.projectId === "string" && project.projectId.trim()
      ? project.projectId.trim()
      : path.basename(String(project.projectRoot ?? sessionCwd ?? "project"));
  const projectRoot = typeof project.projectRoot === "string" ? project.projectRoot : sessionCwd;
  const projectId = typeof project.projectId === "string" ? project.projectId : projectName;
  const clawDir = typeof project.clawDir === "string" ? project.clawDir : path.join(projectRoot, ".claw");
  const protocolOk = (context.protocolCheck as JsonRecord | undefined)?.ok === true ? "ok" : "needs attention";
  const prompt = buildSessionStartDefaultPrompt({ projectName, projectId, clawDir, protocolOk });
  if (!versionSyncPrompt) {
    return prompt;
  }
  return versionSyncPrompt.placement === "prefix"
    ? `${versionSyncPrompt.lines.join("\n")}\n${prompt}`
    : `${prompt}\n${versionSyncPrompt.lines.join("\n")}`;
}

function buildRecoveredWorkflowAdditionalContext(
  activeWorkflow: JsonRecord,
  versionSyncPrompt: { placement: "prefix" | "suffix"; lines: string[] } | null,
): string {
  const taskName = String(activeWorkflow.taskName ?? "");
  const planFile = String(activeWorkflow.planFile ?? "plan.json");
  const planStatus = String(activeWorkflow.planStatus ?? "");
  const planSummary = String(activeWorkflow.planSummary ?? "");
  const planContent = activeWorkflow.planContent as JsonRecord | undefined;
  const workflowGuidance = activeWorkflow.workflowGuidance as JsonRecord | undefined;
  const nextsteps = toStringList(workflowGuidance?.nextsteps);
  const recommendedCommands = toStringList(workflowGuidance?.recommendedCommands);
  const delegateSubagents = toDelegateNames(workflowGuidance?.delegateSubagents);
  const notes = typeof workflowGuidance?.notes === "string" ? workflowGuidance.notes.trim() : "";
  const askUser = summarizeAskUser(workflowGuidance?.askUser as JsonRecord | undefined);
  const goalMode = summarizeGoalMode(workflowGuidance?.goalMode as JsonRecord | undefined);
  const planContentLines = planContent ? summarizeRecoveredPlanContent(planContent) : [];

  const prompt = buildSessionStartRecoveredPrompt({
    taskName,
    planFile,
    planStatus,
    planSummary,
    nextsteps,
    recommendedCommands,
    delegateSubagents,
    notes,
    askUser: askUser ?? "",
    goalMode: goalMode ?? "",
    planContentLines,
  });
  if (!versionSyncPrompt) {
    return prompt;
  }
  return versionSyncPrompt.placement === "prefix"
    ? `${versionSyncPrompt.lines.join("\n")}\n${prompt}`
    : `${prompt}\n${versionSyncPrompt.lines.join("\n")}`;
}

function buildVersionSyncPrompt(
  context: Record<string, unknown>,
): { placement: "prefix" | "suffix"; lines: string[] } | null {
  const startupRecovery = asJsonRecord(context.startupRecovery);
  const versionSync = asJsonRecord(startupRecovery?.versionSync);
  if (!versionSync) {
    return null;
  }

  const cliVersion = typeof versionSync.cliVersion === "string" ? versionSync.cliVersion.trim() : "";
  const projectVersion = typeof versionSync.projectVersion === "string" ? versionSync.projectVersion.trim() : "";
  const latestPublishedVersion = typeof versionSync.latestPublishedVersion === "string"
    ? versionSync.latestPublishedVersion.trim()
    : "";
  const message = typeof versionSync.message === "string" ? versionSync.message.trim() : "";
  const autoUpdateEnabled = versionSync.autoUpdateEnabled === true;
  const updateAvailable = versionSync.updateAvailable === true;
  const updateSkill = typeof versionSync.updateSkill === "string" ? versionSync.updateSkill.trim() : "claw-kit:update";

  if (versionSync.cliVersionLagging !== true) {
    return null;
  }

  if (autoUpdateEnabled && updateAvailable && cliVersion && latestPublishedVersion) {
    return {
      placement: "suffix",
      lines: [
        `Before anything else, a newer claw-kit version was detected: local CLI ${cliVersion}, published latest ${latestPublishedVersion}.`,
        `First action: use ${updateSkill} to update the claw-kit CLI and the current host plugin surface before continuing any other work.`,
      ],
    };
  }

  if (message) {
    return {
      placement: "suffix",
      lines: [`Startup note: ${message}`],
    };
  }
  if (cliVersion && projectVersion && latestPublishedVersion) {
    return {
      placement: "suffix",
      lines: [
        `Startup note: project version ${projectVersion} is newer than CLI ${cliVersion}, and npm latest is ${latestPublishedVersion}.`,
      ],
    };
  }
  if (cliVersion && projectVersion) {
    return {
      placement: "suffix",
      lines: [`Startup note: project version ${projectVersion} is newer than CLI ${cliVersion}.`],
    };
  }

  return null;
}

function summarizeRecoveredPlanContent(planContent: JsonRecord): string[] {
  const lines: string[] = [];
  const goalText =
    planContent.goal &&
      typeof planContent.goal === "object" &&
      typeof (planContent.goal as { text?: unknown }).text === "string"
      ? (planContent.goal as { text: string }).text.trim()
      : "";
  if (goalText) {
    lines.push(`- goal: ${goalText}`);
  }

  const tasks = Array.isArray(planContent.tasks) ? planContent.tasks : [];
  if (tasks.length > 0) {
    lines.push("- tasks:");
    for (const task of tasks) {
      if (!task || typeof task !== "object") {
        continue;
      }
      const id = typeof (task as { id?: unknown }).id === "number" ? (task as { id: number }).id : "?";
      const title = typeof (task as { title?: unknown }).title === "string" ? (task as { title: string }).title.trim() : "";
      const status = typeof (task as { status?: unknown }).status === "string"
        ? (task as { status: string }).status.trim()
        : "unknown";
      if (title) {
        lines.push(`  - #${id} [${status}] ${title}`);
      }
    }
  }

  const references = Array.isArray(planContent.references) ? planContent.references : [];
  if (references.length > 0) {
    lines.push("- references:");
    for (const reference of references.slice(0, 5)) {
      if (!reference || typeof reference !== "object") {
        continue;
      }
      const refPath = typeof (reference as { path?: unknown }).path === "string"
        ? (reference as { path: string }).path.trim()
        : "";
      const why = typeof (reference as { why?: unknown }).why === "string"
        ? (reference as { why: string }).why.trim()
        : "";
      if (refPath) {
        lines.push(`  - ${refPath}${why ? ` :: ${why}` : ""}`);
      }
    }
  }

  return lines.length > 0 ? lines : ["- plan content present in activeWorkflow.planContent JSON."];
}

async function tryResolveActiveWorkflowSnapshot(
  cwd: string,
  ownerSessionKey: string,
): Promise<{
  taskName: string;
  planFile: string;
  planPath: string;
  planStatus: string;
  planSummary: string;
  planContent: PlanDocument;
  workflowGuidance: WorkflowGuidance;
} | null> {
  const project = resolveProjectContext(cwd);
  const planPath = resolveSessionBoundPlan(project, ownerSessionKey);
  if (!planPath) {
    return null;
  }

  try {
    const relativePlanPath = path.relative(project.tasksDir, planPath);
    const segments = relativePlanPath.split(path.sep);
    const taskName = segments.shift();
    const planFile = segments.join("/");
    if (!taskName || !planFile) {
      unbindSession(project, ownerSessionKey);
      return null;
    }
    const result = showPlan({
      cwd,
      taskName,
      planFile,
    });
    if (result.plan.status.startsWith("end.")) {
      unbindSession(project, ownerSessionKey);
      return null;
    }

    return {
      taskName: result.taskName,
      planFile: result.planFile,
      planPath: result.planPath,
      planStatus: result.plan.status,
      planSummary: result.planView.collapsedSummary,
      planContent: result.plan,
      workflowGuidance: await buildPlanWorkflowGuidance({
        taskName: result.taskName,
        planFile: result.planFile,
        plan: result.plan,
        projectRoot: project.projectRoot,
        projectConfig: project.projectConfig,
      }),
    };
  } catch {
    unbindSession(project, ownerSessionKey);
    return null;
  }
}

async function runSubplan(args: string[]): Promise<void> {
  const subcommand = args.shift();
  switch (subcommand) {
    case "create": {
      const result = await createSubplan({
        cwd: process.cwd(),
        parentTaskName: readRequiredFlag(args, "--parent"),
        parentTaskId: readOptionalNumber(args, "--task-id") ?? failMissingNumericFlag("--task-id"),
        templateName: readOptionalFlag(args, "--template") ?? undefined,
        ownerSessionKey: resolveOwnerSessionKey() ?? undefined,
      });
      assertNoRemainingArgs(args, "subplan create");
      printJson(compactPlanCommandResult("subplan.create", result));
      return;
    }
    default:
      throw new ClawError("PROJECT_CONFIG_INVALID", `Unknown subplan subcommand "${subcommand ?? ""}".`);
  }
}

function resolveOwnerSessionKey(payload?: unknown): string | null {
  const envCandidates = [
    process.env.CODEX_THREAD_ID,
    process.env.CODEX_SESSION_ID,
  ];
  for (const candidate of envCandidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  const payloadSessionId =
    payload && typeof payload === "object" && typeof (payload as { session_id?: unknown }).session_id === "string"
      ? (payload as { session_id: string }).session_id.trim()
      : "";
  if (payloadSessionId) {
    return payloadSessionId;
  }
  return null;
}

function toStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim())
    : [];
}

function toDelegateNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (entry && typeof entry === "object" && typeof (entry as { name?: unknown }).name === "string"
      ? (entry as { name: string }).name.trim()
      : ""))
    .filter((entry): entry is string => Boolean(entry));
}

function summarizeAskUser(value: JsonRecord | undefined): string | null {
  if (!value || typeof value.reason !== "string" || !value.reason.trim()) {
    return null;
  }
  return value.reason.trim();
}

function summarizeGoalMode(value: JsonRecord | undefined): string | null {
  if (!value || typeof value.recommendedObjective !== "string" || !value.recommendedObjective.trim()) {
    return null;
  }
  return value.recommendedObjective.trim();
}

async function readStdinJson(): Promise<unknown> {
  const chunks: string[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
  }
  const raw = chunks.join("").trim();
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readJson<T>(filePath: string): T {
  return JSON.parse(stripBom(fs.readFileSync(path.resolve(filePath), "utf-8"))) as T;
}

function stripBom(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

function compactPlanCommandResult(
  command: "plan.create" | "plan.edit" | "plan.done" | "task.done" | "subplan.create",
  result: {
    taskName: string;
    planFile: string;
    planPath: string;
    planStatus: string;
    workflowGuidance: WorkflowGuidance;
    plan?: unknown;
    planView: PlanViewModel;
    planReview?: {
      score: number;
      issues: unknown[];
      suggestions: string[];
      completionPolicy: string;
    };
    previousPlanStatus?: string;
    emittedEvents?: string[];
    changedTaskIds?: number[];
    appendedTaskIds?: number[];
  },
  completionRefresh?: CompletionRefreshResult,
  ): Record<string, unknown> {
    const archivedPlanPath =
      completionRefresh?.taskRetention.archivedCurrentTask?.taskName === result.taskName &&
      completionRefresh.taskRetention.archivedCurrentTask.archivedPlanPath
        ? completionRefresh.taskRetention.archivedCurrentTask.archivedPlanPath
        : undefined;
    const resolvedPlanPath = archivedPlanPath ?? result.planPath;

    return {
      ok: true,
      command,
      planPath: resolvedPlanPath,
      ...(archivedPlanPath ? { archivedPlanPath } : {}),
      planStatus: result.planStatus,
      ...(result.previousPlanStatus ? { previousPlanStatus: result.previousPlanStatus } : {}),
      ...(result.emittedEvents?.length ? { emittedEvents: result.emittedEvents } : {}),
      ...(result.changedTaskIds?.length ? { changedTaskIds: result.changedTaskIds } : {}),
      ...(result.appendedTaskIds?.length ? { appendedTaskIds: result.appendedTaskIds } : {}),
      nextsteps: result.workflowGuidance.nextsteps,
      ...(result.workflowGuidance.nextTask ? { nextTask: result.workflowGuidance.nextTask } : {}),
      ...(result.workflowGuidance.delegateSubagents?.length
        ? { delegateSubagents: result.workflowGuidance.delegateSubagents }
        : {}),
      ...(result.workflowGuidance.notes?.trim() ? { notes: result.workflowGuidance.notes } : {}),
      ...(result.workflowGuidance.recommendedCommands?.length
        ? { recommendedCommands: result.workflowGuidance.recommendedCommands }
        : {}),
      ...(result.workflowGuidance.askUser ? { askUser: result.workflowGuidance.askUser } : {}),
      ...(result.workflowGuidance.goalMode ? { goalMode: result.workflowGuidance.goalMode } : {}),
      ...(result.workflowGuidance.goalTool ? { goalTool: result.workflowGuidance.goalTool } : {}),
      ...((command === "plan.create" || command === "subplan.create") && result.plan ? { plan: result.plan } : {}),
      ...(result.planReview
        ? {
            planReview: {
              score: result.planReview.score,
              issueCount: result.planReview.issues.length,
              suggestions: result.planReview.suggestions,
              completionPolicy: result.planReview.completionPolicy,
            },
          }
        : {}),
      planSummary: result.planView.collapsedSummary,
    };
}

function compactDirectCommandResult(
  command: "direct",
  workflowGuidance: WorkflowGuidance,
  completionRefresh: CompletionRefreshResult,
): Record<string, unknown> {
  return {
    ok: true,
    command,
    summary: workflowGuidance.summary,
    nextsteps: workflowGuidance.nextsteps,
    ...(workflowGuidance.delegateSubagents?.length
      ? { delegateSubagents: workflowGuidance.delegateSubagents }
      : {}),
    ...(workflowGuidance.notes?.trim() ? { notes: workflowGuidance.notes } : {}),
    ...(workflowGuidance.recommendedCommands?.length
      ? { recommendedCommands: workflowGuidance.recommendedCommands }
      : {}),
  };
}

function mergeEditPatchFlags(
  patch: Partial<PlanDocument> | undefined,
  rules: string[],
  keyDecisions: string[],
  referencePath?: string,
  referenceWhy?: string,
): Partial<PlanDocument> | undefined {
  if ((referencePath && !referenceWhy) || (!referencePath && referenceWhy)) {
    throw new ClawError(
      "PROJECT_CONFIG_INVALID",
      "--reference-path and --reference-why must be provided together.",
    );
  }
  const merged = patch ? structuredClone(patch) : {};
  if (rules.length > 0) {
    merged.rules = [...(merged.rules ?? []), ...rules];
  }
  if (keyDecisions.length > 0) {
    merged.keyDecisions = [...(merged.keyDecisions ?? []), ...keyDecisions];
  }
  if (referencePath && referenceWhy) {
    merged.references = [...(merged.references ?? []), { path: referencePath, why: referenceWhy }];
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function failMissingNumericFlag(flag: string): never {
  throw new ClawError("PROJECT_CONFIG_INVALID", `Missing required flag ${flag}.`, { flag });
}

function mergeDonePatch(
  patch: Partial<PlanDocument> | undefined,
  summary: string | undefined,
): Partial<PlanDocument> | undefined {
  if (!patch && !summary) {
    return undefined;
  }
  const merged = patch ? structuredClone(patch) : {};
  if (summary) {
    merged.retrospective = {
      ...(merged.retrospective ?? {}),
      summary,
    };
  }
  return merged;
}

type CompletionRefreshResult = {
  taskRetention: ReturnType<typeof enforceTaskRetention>;
  asyncRefresh: {
    queued: true;
    startedAt: string;
    statusFile: string;
    operations: CompletionRefreshOperation[];
  };
};

type CompletionRefreshOperation = "memory.reindex.project" | "memory.reindex.task" | "gitnexus.refresh";

type CompletionRefreshStatus = {
  ok: true;
  queued: true;
  startedAt: string;
  cwd: string;
  taskName: string;
  operations: CompletionRefreshOperation[];
} | {
  ok: true;
  running: true;
  startedAt: string;
  cwd: string;
  taskName: string;
  operations: CompletionRefreshOperation[];
} | {
  ok: true;
  startedAt: string;
  finishedAt: string;
  cwd: string;
  taskName: string;
  memory: {
    project: ReturnType<typeof buildMemoryIndex>;
    task?: ReturnType<typeof buildMemoryIndex>;
  };
  gitnexus?: GitNexusRefreshResult;
} | {
  ok: false;
  startedAt: string;
  finishedAt: string;
  cwd: string;
  taskName: string;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

type GitNexusRefreshResult = {
  enabled: true;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
} | {
  enabled: false;
  reason: string;
};

function queueCompletionRefresh(input: {
  cwd: string;
  taskName: string;
  includeTaskRetention?: boolean;
  includeTaskMemory?: boolean;
  statusLabel?: string;
}): CompletionRefreshResult {
  const project = resolveProjectContext(input.cwd);
  const includeTaskRetention = input.includeTaskRetention ?? true;
  const includeTaskMemory = input.includeTaskMemory ?? includeTaskRetention;
  const taskRetention = includeTaskRetention
    ? enforceTaskRetention(project, input.taskName)
    : {
        enabled: false,
        maxTasksToKeep: project.projectConfig?.maxTasksToKeep ?? 99,
        prunedArchivedTasks: [],
      };
  const startedAt = new Date().toISOString();
  const statusFile = createCompletionRefreshStatusFile(project.clawDir, input.statusLabel ?? input.taskName, startedAt);
  const operations: CompletionRefreshResult["asyncRefresh"]["operations"] = ["memory.reindex.project"];
  if (includeTaskMemory && !taskRetention.archivedCurrentTask) {
    operations.push("memory.reindex.task");
  }
  if (project.projectConfig?.gitnexus === true) {
    operations.push("gitnexus.refresh");
  }

  fs.mkdirSync(path.dirname(statusFile), { recursive: true });
  fs.writeFileSync(
    statusFile,
    JSON.stringify(
      {
        ok: true,
        queued: true,
        startedAt,
        cwd: input.cwd,
        taskName: input.taskName,
        operations,
      },
      null,
      2,
    ),
    "utf-8",
  );

  launchCompletionRefreshWorker({
    cwd: input.cwd,
    taskName: input.taskName,
    statusFile,
  });

  return {
    taskRetention,
    asyncRefresh: {
      queued: true,
      startedAt,
      statusFile,
      operations,
    },
  };
}

function resolveCliEntryPath(): string {
  const entry = process.argv[1];
  if (!entry) {
    throw new ClawError("PROJECT_CONFIG_INVALID", "Unable to resolve the current claw CLI entry path.");
  }
  return entry;
}

function launchCompletionRefreshWorker(input: {
  cwd: string;
  taskName: string;
  statusFile: string;
}): void {
  if (process.platform === "win32") {
    const launcherScript = [
      "$node = $env:CLAW_COMPLETION_NODE",
      "$entry = $env:CLAW_COMPLETION_ENTRY",
      "$cwd = $env:CLAW_COMPLETION_CWD",
      "$task = $env:CLAW_COMPLETION_TASK",
      "$status = $env:CLAW_COMPLETION_STATUS",
      "Start-Process -FilePath $node -ArgumentList @($entry, 'internal-completion-refresh', '--cwd', $cwd, '--task', $task, '--status-file', $status) -WorkingDirectory $cwd -WindowStyle Hidden",
    ].join("; ");
    const launcher = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-Command", launcherScript],
      {
        cwd: input.cwd,
        stdio: "ignore",
        windowsHide: true,
        env: {
          ...process.env,
          CLAW_COMPLETION_NODE: process.execPath,
          CLAW_COMPLETION_ENTRY: resolveCliEntryPath(),
          CLAW_COMPLETION_CWD: input.cwd,
          CLAW_COMPLETION_TASK: input.taskName,
          CLAW_COMPLETION_STATUS: input.statusFile,
        },
      },
    );
    if (launcher.error) {
      throw new ClawError(
        "PROJECT_CONFIG_INVALID",
        "Unable to launch background completion refresh.",
        {
          cwd: input.cwd,
          message: launcher.error.message,
        },
      );
    }
    if ((launcher.status ?? 0) !== 0) {
      throw new ClawError(
        "PROJECT_CONFIG_INVALID",
        "Background completion refresh launcher exited unexpectedly.",
        {
          cwd: input.cwd,
          exitCode: launcher.status ?? 0,
        },
      );
    }
    return;
  }

  const child = spawn(
    process.execPath,
    [
      resolveCliEntryPath(),
      "internal-completion-refresh",
      "--cwd",
      input.cwd,
      "--task",
      input.taskName,
      "--status-file",
      input.statusFile,
    ],
    {
      cwd: input.cwd,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    },
  );
  child.unref();
}

function runInternalCompletionRefresh(args: string[]): void {
  const cwd = readRequiredFlag(args, "--cwd");
  const taskName = readRequiredFlag(args, "--task");
  const statusFile = readRequiredFlag(args, "--status-file");
  const startedAt = new Date().toISOString();
  const queuedStatus = readJson<CompletionRefreshStatus>(statusFile);
  const operations: CompletionRefreshOperation[] =
    "operations" in queuedStatus && Array.isArray(queuedStatus.operations)
      ? queuedStatus.operations as CompletionRefreshOperation[]
      : ["memory.reindex.project"];

  try {
    fs.writeFileSync(
      statusFile,
      `${JSON.stringify(
        {
          ok: true,
          running: true,
          startedAt,
          cwd,
          taskName,
          operations,
        } satisfies CompletionRefreshStatus,
        null,
        2,
      )}\n`,
      "utf-8",
    );
    const projectMemory = buildMemoryIndex({
      cwd,
      scope: "project",
    });
  const taskMemory = operations.includes("memory.reindex.task")
    ? tryBuildTaskMemoryIndex(cwd, taskName)
    : undefined;
    const status: CompletionRefreshStatus = {
      ok: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      cwd,
      taskName,
      memory: {
        project: projectMemory,
        ...(taskMemory ? { task: taskMemory } : {}),
      },
      gitnexus: refreshGitNexusIfEnabled(cwd, resolveProjectContext(cwd).projectConfig),
    };
    fs.writeFileSync(statusFile, `${JSON.stringify(status, null, 2)}\n`, "utf-8");
  } catch (error) {
    const payload: CompletionRefreshStatus = {
      ok: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      cwd,
      taskName,
      error: error instanceof ClawError
        ? {
            code: error.code,
            message: error.message,
            ...(error.details ? { details: error.details } : {}),
          }
        : {
            code: "COMPLETION_REFRESH_FAILED",
            message: error instanceof Error ? error.message : "Unknown completion refresh failure.",
          },
    };
    fs.writeFileSync(statusFile, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
    process.exitCode = 1;
  }
}

function tryBuildTaskMemoryIndex(cwd: string, taskName: string): ReturnType<typeof buildMemoryIndex> | undefined {
  try {
    return buildMemoryIndex({
      cwd,
      scope: "task",
      taskName,
    });
  } catch (error) {
    if (error instanceof ClawError && error.code === "TASK_NOT_FOUND") {
      return undefined;
    }
    throw error;
  }
}

function createCompletionRefreshStatusFile(clawDir: string, taskName: string, startedAt: string): string {
  const stamp = startedAt.replace(/[:.]/g, "-");
  const safeTaskName = taskName.replace(/[^a-zA-Z0-9._-]+/g, "-");
  return path.join(clawDir, "logs", "completion-refresh", `${stamp}-${safeTaskName}.json`);
}

function compactCompletionRefresh(completionRefresh: CompletionRefreshResult): Record<string, unknown> {
  return {
    taskRetention: {
      enabled: completionRefresh.taskRetention.enabled,
      maxTasksToKeep: completionRefresh.taskRetention.maxTasksToKeep,
      archivedCurrentTask: completionRefresh.taskRetention.archivedCurrentTask
        ? {
            taskName: completionRefresh.taskRetention.archivedCurrentTask.taskName,
            archivedTaskDir: completionRefresh.taskRetention.archivedCurrentTask.archivedTaskDir,
            archivedPlanPath: completionRefresh.taskRetention.archivedCurrentTask.archivedPlanPath,
          }
        : null,
      prunedArchivedTasks: completionRefresh.taskRetention.prunedArchivedTasks.map((task: {
        taskName: string;
        archivedTaskDir: string;
      }) => ({
        taskName: task.taskName,
        archivedTaskDir: task.archivedTaskDir,
      })),
    },
    asyncRefresh: {
      queued: completionRefresh.asyncRefresh.queued,
      startedAt: completionRefresh.asyncRefresh.startedAt,
      statusFile: completionRefresh.asyncRefresh.statusFile,
      operations: completionRefresh.asyncRefresh.operations,
    },
  };
}

function refreshGitNexusIfEnabled(
  cwd: string,
  projectConfig: ProjectConfig | null,
): GitNexusRefreshResult {
  const enabled = projectConfig?.gitnexus === true;

  if (!enabled) {
    return {
      enabled: false,
      reason: "gitnexus is not enabled in .claw/project.json",
    };
  }

  return runGitNexusAnalyze(cwd);
}

function shouldFallbackToPlainAnalyze(result: {
  status: number | null;
  stdout?: string | null;
  stderr?: string | null;
}): boolean {
  if (result.status === 0) {
    return false;
  }
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return output.includes("--no-ai-context");
}

function ensureGitNexusReadyForPlanDone(cwd: string): void {
  const project = resolveProjectContext(cwd);
  if (project.projectConfig?.gitnexus !== true) {
    return;
  }

  ensureGitNexusInstalled(project.projectRoot);
  seedGitNexusEmbeddingCache(project.projectRoot, project.projectConfig);
  ensureGitNexusEmbeddingsEnabled(project.projectRoot);
}

function ensureGitNexusInstalled(cwd: string): void {
  if (isGitNexusAvailable(cwd)) {
    return;
  }

  const install = runCommand("npm", ["install", "-g", "@veewo/gitnexus"], cwd);
  if (commandFailed(install)) {
    throw new ClawError("PROJECT_CONFIG_INVALID", "GitNexus is enabled but automatic installation failed.", {
      cwd,
      command: "npm install -g @veewo/gitnexus",
      exitCode: install.status ?? 0,
      stdout: install.stdout ?? "",
      stderr: install.stderr ?? "",
      ...(install.error ? { message: install.error.message } : {}),
    });
  }

  const setup = runCommand("gitnexus", ["setup", "--cli-spec", "@veewo/gitnexus"], cwd);
  if (commandFailed(setup)) {
    throw new ClawError("PROJECT_CONFIG_INVALID", "GitNexus installed, but automatic setup failed.", {
      cwd,
      command: "gitnexus setup --cli-spec @veewo/gitnexus",
      exitCode: setup.status ?? 0,
      stdout: setup.stdout ?? "",
      stderr: setup.stderr ?? "",
      ...(setup.error ? { message: setup.error.message } : {}),
    });
  }

  if (!isGitNexusAvailable(cwd)) {
    throw new ClawError("PROJECT_CONFIG_INVALID", "GitNexus installation completed, but the CLI is still unavailable on PATH.", {
      cwd,
      command: "gitnexus",
    });
  }
}

function ensureGitNexusEmbeddingsEnabled(cwd: string): void {
  if (readGitNexusEmbeddingsEnabled(cwd)) {
    return;
  }
  runGitNexusAnalyze(cwd, { embeddings: true });
}

function readGitNexusEmbeddingsEnabled(cwd: string): boolean {
  const metaPath = path.join(cwd, ".gitnexus", "meta.json");
  if (!fs.existsSync(metaPath)) {
    return false;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as {
      analyzeOptions?: { embeddings?: boolean };
    };
    return parsed.analyzeOptions?.embeddings === true;
  } catch {
    return false;
  }
}

function runGitNexusAnalyze(
  cwd: string,
  options: {
    embeddings?: boolean;
  } = {},
): GitNexusRefreshResult {
  const primaryArgs = ["analyze", ...(options.embeddings ? ["--embeddings"] : []), "--no-ai-context"];
  const primary = runCommand("gitnexus", primaryArgs, cwd);
  if (primary.error) {
    throw new ClawError("PROJECT_CONFIG_INVALID", "gitnexus analyze failed.", {
      cwd,
      command: `gitnexus ${primaryArgs.join(" ")}`,
      message: primary.error.message,
    });
  }

  if (!commandFailed(primary)) {
    return {
      enabled: true,
      command: `gitnexus ${primaryArgs.join(" ")}`,
      exitCode: primary.status ?? 0,
      stdout: primary.stdout ?? "",
      stderr: primary.stderr ?? "",
    };
  }

  if (!shouldFallbackToPlainAnalyze(primary)) {
    throw new ClawError("PROJECT_CONFIG_INVALID", "gitnexus analyze failed.", {
      cwd,
      command: `gitnexus ${primaryArgs.join(" ")}`,
      exitCode: primary.status ?? 0,
      stdout: primary.stdout ?? "",
      stderr: primary.stderr ?? "",
    });
  }

  const fallbackArgs = ["analyze", ...(options.embeddings ? ["--embeddings"] : [])];
  const fallback = runCommand("gitnexus", fallbackArgs, cwd);
  if (commandFailed(fallback)) {
    throw new ClawError("PROJECT_CONFIG_INVALID", "gitnexus analyze fallback failed.", {
      cwd,
      command: `gitnexus ${fallbackArgs.join(" ")}`,
      exitCode: fallback.status ?? 0,
      stdout: fallback.stdout ?? "",
      stderr: fallback.stderr ?? "",
      ...(fallback.error ? { message: fallback.error.message } : {}),
    });
  }
  return {
    enabled: true,
    command: `gitnexus ${fallbackArgs.join(" ")}`,
    exitCode: fallback.status ?? 0,
    stdout: fallback.stdout ?? "",
    stderr: fallback.stderr ?? "",
  };
}

function seedGitNexusEmbeddingCache(cwd: string, projectConfig: ProjectConfig | null): void {
  const packageRoot = resolveGitNexusPackageRoot(cwd);
  if (!packageRoot) {
    return;
  }

  const modelId = process.env.CLAW_TEST_GITNEXUS_EMBEDDING_MODEL_ID?.trim() || "Snowflake/snowflake-arctic-embed-xs";
  const sourceRoot = resolveClawEmbeddingCacheRoot(cwd, projectConfig);
  const sourceModelDir = path.join(sourceRoot, ...modelId.split("/"));
  if (!fs.existsSync(sourceModelDir)) {
    return;
  }

  const targetModelDir = path.join(
    packageRoot,
    "node_modules",
    "@huggingface",
    "transformers",
    ".cache",
    ...modelId.split("/"),
  );

  if (fs.existsSync(targetModelDir)) {
    return;
  }

  try {
    fs.mkdirSync(path.dirname(targetModelDir), { recursive: true });
    fs.cpSync(sourceModelDir, targetModelDir, { recursive: true });
  } catch {
    // Best-effort cache seeding only.
  }
}

function resolveClawEmbeddingCacheRoot(cwd: string, projectConfig: ProjectConfig | null): string {
  const configured = projectConfig?.memory?.embedding?.local?.modelCacheDir?.trim();
  if (configured) {
    return path.resolve(cwd, configured);
  }
  const localAppData = process.env.LOCALAPPDATA?.trim();
  if (process.platform === "win32") {
    return localAppData
      ? path.join(localAppData, "claw", "models")
      : path.join(os.homedir(), "AppData", "Local", "claw", "models");
  }
  return path.join(os.homedir(), ".cache", "claw", "models");
}

function resolveGitNexusPackageRoot(cwd: string): string | null {
  const overridden = process.env.CLAW_TEST_GITNEXUS_PACKAGE_ROOT?.trim();
  if (overridden) {
    return path.resolve(overridden);
  }

  const commandPath = resolveCommandOnPath("gitnexus");
  if (commandPath) {
    const siblingPackageRoot = path.join(path.dirname(commandPath), "node_modules", "@veewo", "gitnexus");
    if (fs.existsSync(siblingPackageRoot)) {
      return siblingPackageRoot;
    }
  }

  const npmRoot = runCommand("npm", ["root", "-g"], cwd);
  if (commandFailed(npmRoot)) {
    return null;
  }
  const rootPath = (npmRoot.stdout ?? "").trim();
  if (!rootPath) {
    return null;
  }
  const packageRoot = path.join(rootPath, "@veewo", "gitnexus");
  return fs.existsSync(packageRoot) ? packageRoot : null;
}

function isGitNexusAvailable(cwd: string): boolean {
  if (!resolveCommandOnPath("gitnexus")) {
    return false;
  }
  const result = runCommand("gitnexus", ["--help"], cwd);
  if (result.error) {
    return false;
  }
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (/not recognized as an internal or external command/i.test(output)) {
    return false;
  }
  if (/command not found/i.test(output)) {
    return false;
  }
  return true;
}

function resolveCommandOnPath(command: string): string | null {
  const pathEntries = (process.env.PATH ?? "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const extensions = process.platform === "win32"
    ? (process.env.PATHEXT?.split(";").filter(Boolean) ?? [".COM", ".EXE", ".BAT", ".CMD"])
    : [""];

  for (const entry of pathEntries) {
    if (process.platform === "win32") {
      for (const extension of extensions) {
        const candidate = path.join(entry, `${command}${extension.toLowerCase()}`);
        if (fs.existsSync(candidate)) {
          return candidate;
        }
        const upperCandidate = path.join(entry, `${command}${extension.toUpperCase()}`);
        if (fs.existsSync(upperCandidate)) {
          return upperCandidate;
        }
      }
      const bareCandidate = path.join(entry, command);
      if (fs.existsSync(bareCandidate)) {
        return bareCandidate;
      }
      continue;
    }

    const candidate = path.join(entry, command);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function runCommand(command: string, args: string[], cwd: string) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf-8",
    shell: process.platform === "win32",
    windowsHide: true,
  });
}

function commandFailed(result: {
  status: number | null;
  error?: Error;
}): boolean {
  if (result.error) {
    return true;
  }
  return (result.status ?? 0) !== 0;
}

function asJsonRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : undefined;
}

function resolveLatestPublishedClawVersion(cwd: string): string | null {
  const result = runCommand("npm", ["view", "@veewo/claw", "version"], cwd);
  if (commandFailed(result)) {
    return null;
  }
  return normalizeVersionString(result.stdout ?? "");
}

function updateProjectJsonVersion(projectJsonPath: string, version: string): void {
  const raw = fs.readFileSync(projectJsonPath, "utf-8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  parsed.version = version;
  fs.writeFileSync(projectJsonPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf-8");
}

function compareSemver(left: string, right: string): number {
  const leftParts = parseSemver(left);
  const rightParts = parseSemver(right);
  if (!leftParts || !rightParts) {
    return left.localeCompare(right);
  }
  for (let index = 0; index < 3; index += 1) {
    const delta = leftParts[index] - rightParts[index];
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
}

function parseSemver(version: string): [number, number, number] | null {
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  return [
    Number.parseInt(match[1] ?? "", 10),
    Number.parseInt(match[2] ?? "", 10),
    Number.parseInt(match[3] ?? "", 10),
  ];
}

function normalizeVersionString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readOptionalFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Missing value for ${flag}.`, { flag });
  }
  args.splice(index, 2);
  return value;
}

function readRequiredFlag(args: string[], flag: string): string {
  const value = readOptionalFlag(args, flag);
  if (!value) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Missing required flag ${flag}.`, { flag });
  }
  return value;
}

function readOptionalPositionalArg(args: string[]): string | undefined {
  if (args.length === 0) {
    return undefined;
  }
  if (args[0]?.startsWith("--")) {
    return undefined;
  }
  return args.shift();
}

function readRequiredSearchQuery(args: string[]): string {
  const query = readOptionalFlag(args, "--query");
  if (query) {
    return query;
  }

  const unknownFlags = args.filter((arg) => arg.startsWith("--"));
  if (unknownFlags.length > 0) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Unknown arguments for search: ${args.join(" ")}`, {
      command: "search",
      remainingArgs: args,
    });
  }

  if (args.length === 0) {
    throw new ClawError("PROJECT_CONFIG_INVALID", "Missing required flag --query.", { flag: "--query" });
  }

  const positionalQuery = args.join(" ").trim();
  args.splice(0, args.length);
  return positionalQuery;
}

function readRepeatedFlag(args: string[], flag: string): string[] {
  const values: string[] = [];
  while (true) {
    const value = readOptionalFlag(args, flag);
    if (value === undefined) {
      return values;
    }
    values.push(value);
  }
}

function readOptionalNumber(args: string[], flag: string): number | undefined {
  const raw = readOptionalFlag(args, flag);
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Expected numeric value for ${flag}.`, { flag, value: raw });
  }
  return value;
}

function readRequiredNumber(args: string[], flag: string): number {
  const value = readOptionalNumber(args, flag);
  if (value === undefined) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Missing required flag ${flag}.`, { flag });
  }
  return value;
}

function readBooleanValueFlag(args: string[], flag: string): boolean | undefined {
  const raw = readOptionalFlag(args, flag);
  if (raw === undefined) {
    return undefined;
  }
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  throw new ClawError("PROJECT_CONFIG_INVALID", `Expected true or false for ${flag}.`, {
    flag,
    value: raw,
  });
}

function readBooleanFlag(args: string[], flag: string): boolean {
  const index = args.indexOf(flag);
  if (index === -1) {
    return false;
  }
  args.splice(index, 1);
  return true;
}

function rejectFlags(args: string[], flags: string[]): void {
  for (const flag of flags) {
    if (args.includes(flag)) {
      throw new ClawError("PROJECT_CONFIG_INVALID", `${flag} is not supported for this command.`, { flag });
    }
  }
}

function assertNoRemainingArgs(args: string[], command: string): void {
  if (args.length === 0) {
    return;
  }
  throw new ClawError("PROJECT_CONFIG_INVALID", `Unknown arguments for ${command}: ${args.join(" ")}`, {
    command,
    remainingArgs: args,
  });
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function handleError(error: unknown): void {
  if (error instanceof ClawError) {
    process.stderr.write(
      `${JSON.stringify(
        {
          error: {
            code: error.code,
            message: error.message,
            ...(error.details ? { details: error.details } : {}),
          },
        },
        null,
        2,
      )}\n`,
    );
    process.exitCode = 1;
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    `${JSON.stringify(
      {
        error: {
          code: "UNEXPECTED_ERROR",
          message,
        },
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
}

function resolveScriptName(): string {
  return path.basename(process.argv[1] ?? "claw");
}

function renderUsage(usage: string[]): string[] {
  const scriptName = resolveScriptName();
  return ["Usage:", ...usage.map((line) => `  ${line.replace(/\{script\}/g, scriptName)}`)];
}

function renderOptions(options: HelpOption[] | undefined): string[] {
  if (!options || options.length === 0) {
    return [];
  }
  const flagWidth = Math.max(...options.map((o) => o.flag.length));
  return ["", "Options:", ...options.map((o) => `  ${o.flag.padEnd(flagWidth)}  ${o.detail}`)];
}

function printTopLevelUsage(): void {
  const scriptName = resolveScriptName();
  const nameWidth = Math.max(...TOP_LEVEL_COMMANDS.map((c) => c.name.length));
  const lines: string[] = [
    `Usage: ${scriptName} <command> [options]`,
    "",
    "claw is the CLI for the .claw workflow: project planning, recall, truth ingestion, and closeout.",
    "",
    "Commands:",
    ...TOP_LEVEL_COMMANDS.map((c) => `  ${c.name.padEnd(nameWidth)}  ${c.summary}`),
    "",
    "Global flags:",
    "  -h, --help     Show help (use `claw help <command>` for command details).",
    "  -v, --version  Print the CLI version.",
    "",
    "Run `claw help <command>` or `claw help <command> <subcommand>` for detailed help.",
  ];
  process.stderr.write(lines.join("\n"));
  process.stderr.write("\n");
}

function printSimpleHelp(label: string, entry: HelpEntry): void {
  const lines: string[] = [
    ...renderUsage(entry.usage),
    "",
    entry.description,
    ...renderOptions(entry.options),
  ];
  process.stderr.write(lines.join("\n"));
  process.stderr.write("\n");
}

function printGroupHelp(label: string, node: HelpNode): void {
  const lines: string[] = [
    ...renderUsage(node.usage),
    "",
    node.description,
    ...renderOptions(node.options),
  ];

  if (node.subcommands) {
    const subNames = Object.keys(node.subcommands);
    const labelWidth = Math.max(...subNames.map((n) => `${label} ${n}`.length));
    lines.push("", "Subcommands:");
    for (const subName of subNames) {
      const subEntry = node.subcommands[subName];
      const summary = subEntry.summary ?? firstSentence(subEntry.description);
      lines.push(`  ${`${label} ${subName}`.padEnd(labelWidth)}  ${summary}`);
    }
    lines.push("", `Run \`claw help ${label} <subcommand>\` for details.`);
  }

  process.stderr.write(lines.join("\n"));
  process.stderr.write("\n");
}

function firstSentence(text: string): string {
  const match = text.match(/^[^.]*\./);
  return match ? match[0].trim() : text;
}

function resolveHelpTopic(command: string, args: string[]): string[] {
  const topic = [command];
  const node = COMMAND_HELP[command];
  if (node?.subcommands) {
    if (command === "search") {
      if (args[0] === "index") {
        topic.push("index");
      }
    } else if (args[0] && !args[0].startsWith("-")) {
      topic.push(args[0]);
    }
  }
  return topic;
}

function printHelp(topic: string[]): void {
  if (topic.length === 0) {
    printTopLevelUsage();
    return;
  }

  const [cmd, sub, ...rest] = topic;
  const node = COMMAND_HELP[cmd];
  if (!node) {
    process.stderr.write(`Unknown help topic: ${topic.join(" ")}\n`);
    printTopLevelUsage();
    process.exitCode = 1;
    return;
  }

  if (sub === undefined) {
    if (node.subcommands) {
      printGroupHelp(cmd, node);
    } else {
      printSimpleHelp(cmd, node);
    }
    return;
  }

  if (rest.length > 0) {
    process.stderr.write(`Unknown help topic: ${topic.join(" ")}\n`);
    printTopLevelUsage();
    process.exitCode = 1;
    return;
  }

  const subEntry = node.subcommands?.[sub];
  if (subEntry) {
    printSimpleHelp(`${cmd} ${sub}`, subEntry);
    return;
  }

  if (node.subcommands) {
    process.stderr.write(`Unknown ${cmd} subcommand: ${sub}\n`);
    printGroupHelp(cmd, node);
  } else {
    process.stderr.write(`Unknown help topic: ${topic.join(" ")}\n`);
    printTopLevelUsage();
  }
  process.exitCode = 1;
}

function readCliVersion(): string {
  const packageJsonPath = new URL("../package.json", import.meta.url);
  const raw = fs.readFileSync(packageJsonPath, "utf-8");
  const parsed = JSON.parse(raw) as { version?: unknown };
  if (typeof parsed.version !== "string" || parsed.version.trim().length === 0) {
    throw new Error("packages/cli/package.json is missing a valid version string.");
  }
  return parsed.version;
}

void main();
