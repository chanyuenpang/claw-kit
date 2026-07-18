#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
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
  resolveWorkflowProjectContext,
  resolveSessionWorkflowContext,
  deleteSessionWorkflow,
  sweepExpiredSessionWorkflows,
  resolveSessionBoundPlan,
  resolveContext,
  resolveSeedPlanTemplate,
  searchMemory,
  showPlan,
  createSubplan,
  switchTask,
  tryCaptureKnowledgeStop,
  claimKnowledgeFinalizationJob,
  listRetryableKnowledgeFinalizationJobs,
  normalizeTruthMarkdownEncoding,
  tryCleanupKnowledgeFinalizationReport,
  writeKnowledgeFinalizationJob,
  unbindSession,
  writePlan,
  type InitProjectInput,
  type InheritedFrom,
  type LeaveState,
  type MemoryScope,
  type PlanDocument,
  type PlanEvent,
  type PlanFieldUpdates,
  type PlanMutationOperation,
  type PlanTask,
  type PlanViewModel,
  type ProjectConfig,
  type ProjectContext,
  type WorkflowGuidance,
  type KnowledgeFinalizationJob,
} from "@veewo/claw-core";
import { buildCodexDriverEnvelope } from "./codex-driver.js";
import { checkCodexRuntime, resolveCodexSdkEntryPath } from "./codex-runtime.js";
import { extractLatestFinalAssistantMessage } from "./codex-transcript.js";
import { consumeBufferedHookInput } from "./knowledge-hook-preflight.js";
import { resolveInvocationHost, withoutInvocationHost, type ClawHost } from "./invocation-host.js";
import { runOpencodeKnowledgeWriter } from "./opencode-runner.js";

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
  { name: "session clean [--expired]", summary: "Remove current or expired session workflow state." },
  { name: "check", summary: "Check and auto-correct .claw project protocol fields." },
  { name: "plan <subcommand> [options]", summary: "Plan lifecycle: create, start, edit, remove, wait, resume, show, done." },
  { name: "codex driver", summary: "Return the versioned code-mode driver used by the Codex adapter." },
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
      { flag: "--external-writer-skill <skill>", detail: "Skill id override for the combined knowledge-writer pass." },
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
  session: {
    usage: ["{script} session clean", "{script} session clean --expired"],
    description: "Clean ephemeral session-scoped workflow state without touching a project .claw directory.",
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
          "{script} plan create \"<title>\" [--goal <text>] [--scope session]",
          "{script} plan create --title <text> [--goal <text>] [--template <name> | --template-file <path>] [--scope session]",
        ],
        description:
          "Create the task scope and initial plan from a template. Outside a .claw project, explicit `--template` automatically uses session scope while plain plan creation keeps the project-initializing behavior. Template resolution uses explicit `--template` first, otherwise the project's configured `defaultPlanTemplate`, and finally the built-in `default`; planning-enabled projects start in process.discussing with the default planning bridge tasks, while planning-disabled projects start directly in process.active with one executable task.",
        summary: "Create the task scope and initial plan.",
        options: [
          { flag: "--title <text>", detail: "Task title (required unless a positional title is given)." },
          { flag: "--goal <text>", detail: "Optional goal text." },
          { flag: "--scope session", detail: "Use ephemeral per-session storage and disable project knowledge side effects." },
          { flag: "--template <name>", detail: "Optional plan template name. Overrides the project default and auto-selects session scope when no .claw project exists." },
          { flag: "--template-file <path>", detail: "Exact plan template file. Mutually exclusive with --template and auto-selects session scope when no .claw project exists." },
        ],
      },
      edit: {
        usage: ["{script} plan edit [options]"],
        description: "Apply plan field and status edits in argument order to the session-bound current plan.",
        summary: "Edit plan fields in an ordered chain; repeat collection options to append multiple values.",
        options: [
          { flag: "--status <status>", detail: "Advanced: set the plan status directly." },
          { flag: "--goal <text>", detail: "Set goal.text." },
          { flag: "--requirements <text>", detail: "Set the requirements summary." },
          { flag: "--question <text>", detail: "Add an open question (repeatable)." },
          { flag: "--acceptance <text>", detail: "Add an acceptance criterion (repeatable)." },
          { flag: "--summary <text>", detail: "Set the plan summary." },
          { flag: "--rule <text>", detail: "Append a rule (repeatable)." },
          { flag: "--key-decision <text>", detail: "Append a key decision (repeatable)." },
          { flag: "--reference <path>", detail: "Add a reference; follow it immediately with --why (repeatable)." },
          { flag: "--why <text>", detail: "Explain the immediately preceding --reference." },
          { flag: "--task-name <name>", detail: "Advanced: override the session-bound task scope." },
          { flag: "--plan-file <relative-path>", detail: "Advanced: override the session-bound plan file." },
        ],
      },
      remove: {
        usage: ["{script} plan remove [options]"],
        description: "Remove exact values from array fields on the session-bound current plan.",
        summary: "Remove questions, acceptance criteria, rules, decisions, or references.",
        options: [
          { flag: "--question <text>", detail: "Remove an open question by exact text (repeatable)." },
          { flag: "--acceptance <text>", detail: "Remove an acceptance criterion by exact text (repeatable)." },
          { flag: "--rule <text>", detail: "Remove a rule by exact text (repeatable)." },
          { flag: "--key-decision <text>", detail: "Remove a key decision by exact text (repeatable)." },
          { flag: "--reference <path>", detail: "Remove references matching a path (repeatable)." },
          { flag: "--task-name <name>", detail: "Advanced: override the session-bound task scope." },
          { flag: "--plan-file <relative-path>", detail: "Advanced: override the session-bound plan file." },
        ],
      },
      wait: {
        usage: ["{script} plan wait"],
        description: "Pause active execution by moving the plan to process.wait.",
        summary: "Pause active execution.",
        options: [
          { flag: "--task-name <name>", detail: "Advanced: override the session-bound task scope." },
          { flag: "--plan-file <relative-path>", detail: "Advanced: override the session-bound plan file." },
        ],
      },
      resume: {
        usage: ["{script} plan resume"],
        description: "Resume paused execution by moving the plan to process.active.",
        summary: "Resume paused execution.",
        options: [
          { flag: "--task-name <name>", detail: "Advanced: override the session-bound task scope." },
          { flag: "--plan-file <relative-path>", detail: "Advanced: override the session-bound plan file." },
        ],
      },
      start: {
        usage: ["{script} plan start --requirements <text> --add-task <title> [--detail <text>] [options]"],
        description:
          "Atomically apply refined plan content, append business tasks, complete the default planning/activation bridge, and enter process.active in one serialized mutation.",
        summary: "Atomically refine and activate a default planning plan.",
        options: [
          { flag: "--goal <text>", detail: "Set goal.text." },
          { flag: "--requirements <text>", detail: "Set the requirements summary." },
          { flag: "--question <text>", detail: "Add an open question (repeatable)." },
          { flag: "--acceptance <text>", detail: "Add an acceptance criterion (repeatable)." },
          { flag: "--add-task <title>", detail: "Add a business task; optionally follow it immediately with --detail (repeatable)." },
          { flag: "--detail <text>", detail: "Describe the immediately preceding --add-task." },
          { flag: "--rule <text>", detail: "Append a rule (repeatable)." },
          { flag: "--key-decision <text>", detail: "Append a key decision (repeatable)." },
          { flag: "--reference <path>", detail: "Add a reference; follow it immediately with --why (repeatable)." },
          { flag: "--why <text>", detail: "Explain the immediately preceding --reference." },
          { flag: "--task-name <name>", detail: "Advanced: override the session-bound task scope." },
          { flag: "--plan-file <relative-path>", detail: "Advanced: override the session-bound plan file." },
        ],
      },
      show: {
        usage: ["{script} plan show"],
        description: "Show the session-bound current plan, including archived plans through an explicit override.",
        summary: "Show the current plan for a task.",
        options: [
          { flag: "--task-name <name>", detail: "Advanced: override the session-bound task scope." },
          { flag: "--plan-file <relative-path>", detail: "Advanced: override the session-bound plan file." },
        ],
      },
      done: {
        usage: ["{script} plan done --retrospective <text> [options]"],
        description:
          "Close out a plan: write a retrospective, mark status end.completed with completedAt, retain it for at least one hour, sweep older completed tasks into the archive, and queue the async completion refresh.",
        summary: "Close out a plan with a retrospective and queue completion refresh.",
        options: [
          { flag: "--retrospective <text>", detail: "Retrospective summary (required)." },
          { flag: "--key-decision <text>", detail: "Append a durable key decision when one exists (repeatable)." },
          { flag: "--what-worked <text>", detail: "Append a retrospective success (repeatable)." },
          { flag: "--issue <text>", detail: "Append a retrospective issue (repeatable)." },
          { flag: "--follow-up <text>", detail: "Append a retrospective follow-up (repeatable)." },
          { flag: "--task-name <name>", detail: "Advanced: override the session-bound task scope." },
          { flag: "--plan-file <relative-path>", detail: "Advanced: override the session-bound plan file." },
        ],
      },
    },
  },
  codex: {
    usage: ["{script} codex <subcommand>"],
    description: "Codex adapter runtime helpers.",
    subcommands: {
      driver: {
        usage: ["{script} codex driver"],
        description: "Return the versioned JavaScript driver source used by the short code-mode bootstrap.",
        summary: "Return the versioned code-mode driver source.",
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
    description: "Add, edit, remove, or complete task items on the session-bound current plan.",
    subcommands: {
      add: {
        usage: ["{script} task add --title <text> [--detail <text>] [--title <text> [--detail <text>] ...]"],
        description: "Add one or more pending task items to the current plan in argument order.",
        summary: "Add task items with repeated --title groups.",
        options: [
          { flag: "--title <text>", detail: "Task title (required)." },
          { flag: "--detail <text>", detail: "Optional task detail." },
          { flag: "--task-name <name>", detail: "Advanced: override the session-bound task scope." },
          { flag: "--plan-file <relative-path>", detail: "Advanced: override the session-bound plan file." },
        ],
      },
      edit: {
        usage: ["{script} task edit --id <number> [options] [--id <number> [options] ...]"],
        description: "Update one or more task items on the current plan in argument order.",
        summary: "Edit task items with repeated --id groups.",
        options: [
          { flag: "--id <number>", detail: "Task item id (required)." },
          { flag: "--title <text>", detail: "Set the task title." },
          { flag: "--detail <text>", detail: "Set the task detail." },
          { flag: "--status <status>", detail: "Set pending, in_progress, subagent_running, done, or blocked." },
          { flag: "--choice <choice-id>", detail: "Record a route choice when status becomes done." },
          { flag: "--task-name <name>", detail: "Advanced: override the session-bound task scope." },
          { flag: "--plan-file <relative-path>", detail: "Advanced: override the session-bound plan file." },
        ],
      },
      remove: {
        usage: ["{script} task remove --id <number> [--id <number> ...]"],
        description: "Remove one or more task items from the current plan in argument order.",
        summary: "Remove task items with repeated --id values.",
        options: [
          { flag: "--id <number>", detail: "Task item id (required)." },
          { flag: "--task-name <name>", detail: "Advanced: override the session-bound task scope." },
          { flag: "--plan-file <relative-path>", detail: "Advanced: override the session-bound plan file." },
        ],
      },
      done: {
        usage: ["{script} task done --id <number> [--choice <choice-id>] [--id <number> [--choice <choice-id>] ...]"],
        description:
          "Mark one or more task items as done in argument order. Route-aware templates may require `--choice`, and each selected choice is persisted as `task.choiceId` in the plan state.",
        summary: "Complete task items with repeated --id groups, optionally recording routing choices.",
        options: [
          { flag: "--id <number>", detail: "(required) Task item id to mark done." },
          { flag: "--choice <choice-id>", detail: "Route choice id required by templates that define guidance.onDone.choices." },
          { flag: "--task-name <name>", detail: "Advanced: override the session-bound task scope." },
          { flag: "--plan-file <relative-path>", detail: "Advanced: override the session-bound plan file." },
        ],
      },
    },
  },
  subplan: {
    usage: ["{script} subplan <subcommand> [options]"],
    description: "Subplan lifecycle commands nested under a parent task.",
    subcommands: {
      create: {
        usage: ["{script} subplan create --parent <task-name> --task-id <number> [--template <name> | --template-file <path>]"],
        description:
          "Create a flat subplan file under the task directory. Uses explicit `--template` first, otherwise the project's configured `defaultPlanTemplate`, and finally falls back to the built-in `default`. The current session binding switches to the subplan and returns to its parent when the subplan ends.",
        summary: "Create a subplan under a parent task's task item.",
        options: [
          { flag: "--parent <task-name>", detail: "(required) Parent task name." },
          { flag: "--task-id <number>", detail: "(required) Parent task item id to split into a subplan." },
          { flag: "--template <name>", detail: "Optional plan template name. Overrides the project's configured default template." },
          { flag: "--template-file <path>", detail: "Exact plan template file. Mutually exclusive with --template." },
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
      "Emit host hook output. `auto-claw` maps to SessionStart recovery and `auto-doc` maps to Stop report capture; fixed platform event names remain accepted as compatibility aliases.",
    options: [
      { flag: "<event-name>", detail: "(required) Hook command name (`auto-claw`, `auto-doc`, SessionStart, or Stop)." },
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
  "internal-knowledge-finalize": {
    usage: ["{script} internal-knowledge-finalize --job <path>"],
    description: "Internal: runs one queued knowledge deposition job through the host-aware finalization runner (Codex SDK for codex host, opencode run for opencode host).",
    options: [{ flag: "--job <path>", detail: "(required) Finalization job JSON path." }],
  },
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const explicitHost = readOptionalFlag(args, "--host");
  let effectiveHost: ClawHost | undefined;
  try {
    effectiveHost = resolveInvocationHost(explicitHost, process.env.CLAW_HOST);
  } catch (error) {
    handleError(error);
    return;
  }
  const command = args.shift();

  if (command === "--help" || command === "-h") {
    printTopLevelUsage();
    return;
  }
  if (command === "--version" || command === "-v") {
    process.stdout.write(`${CLI_VERSION}\n`);
    return;
  }

  if (command === "search" && args.length === 1 && args[0] === "help") {
    printHelp(["search"]);
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
          externalWriterSkill: readOptionalFlag(args, "--external-writer-skill") ?? null,
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
        printJson(buildPublicContextOutput(await runContextCommand(args, process.cwd(), resolveOwnerSessionKey(), effectiveHost)));
        return;
      case "session":
        runSession(args);
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
        await runPlan(args, effectiveHost);
        return;
      case "codex":
        runCodex(args);
        return;
      case "template":
        await runTemplate(args);
        return;
      case "task":
        await runTask(args, effectiveHost);
        return;
      case "subplan":
        await runSubplan(args, effectiveHost);
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
        runDirect(args, effectiveHost);
        return;
      case "truth":
        runTruth(args);
        return;
      case "hook":
        await runHook(args, effectiveHost);
        return;
      case "help":
        printHelp(args);
        return;
      case "internal-completion-refresh":
        runInternalCompletionRefresh(args);
        return;
      case "internal-knowledge-finalize":
        await runInternalKnowledgeFinalize(args);
        return;
      default:
        printTopLevelUsage();
        process.exitCode = 1;
    }
  } catch (error) {
    handleError(error);
  }
}

function runCodex(args: string[]): void {
  const subcommand = args.shift();
  if (subcommand !== "driver") {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Unknown codex subcommand "${subcommand ?? ""}".`);
  }
  assertNoRemainingArgs(args, "codex driver");
  printJson(buildCodexDriverEnvelope(CLI_VERSION));
}

function runSession(args: string[]): void {
  const subcommand = args.shift();
  if (subcommand !== "clean") {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Unknown session subcommand "${subcommand ?? ""}".`);
  }
  const expired = readBooleanFlag(args, "--expired");
  assertNoRemainingArgs(args, "session clean");
  if (expired) {
    const removed = sweepExpiredSessionWorkflows();
    printJson({ ok: true, command: "session.clean", expired: true, removedCount: removed.length, removed });
    return;
  }
  const ownerSessionKey = resolveOwnerSessionKey();
  if (!ownerSessionKey) {
    throw new ClawError("PROJECT_CONFIG_INVALID", "session clean requires a platform session id.");
  }
  printJson({
    ok: true,
    command: "session.clean",
    removed: deleteSessionWorkflow(ownerSessionKey),
  });
}

async function runPlan(args: string[], effectiveHost: ClawHost | undefined): Promise<void> {
  const subcommand = args.shift();
  switch (subcommand) {
    case "create":
      rejectFlags(args, ["--task", "--plan", "--content", "--status", "--parent-task-id", "--description"]);
      const explicitTitle = readOptionalFlag(args, "--title");
      const explicitTemplate = readOptionalFlag(args, "--template");
      const explicitTemplateFile = readOptionalFlag(args, "--template-file");
      if (explicitTemplate && explicitTemplateFile) {
        throw new ClawError("PROJECT_CONFIG_INVALID", "--template and --template-file are mutually exclusive.");
      }
      const scope = readWorkflowScope(args);
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
        scope,
        templateName,
        templateFile: explicitTemplateFile ? path.resolve(process.cwd(), explicitTemplateFile) : undefined,
        title,
        goalText: readOptionalFlag(args, "--goal"),
        ownerSessionKey: resolveOwnerSessionKey() ?? undefined,
        host: effectiveHost,
      });
      assertNoRemainingArgs(args, "plan create");
      printJson(compactPlanCommandResult("plan.create", result, effectiveHost));
      return;
    case "edit": {
      const target = readPlanMutationTarget(args);
      const operations = readOrderedPlanEditOperations(args);
      if (operations.length === 0) {
        throw new ClawError("PROJECT_CONFIG_INVALID", "plan edit requires at least one plan field or --status.");
      }
      const result = await editPlan({
        cwd: process.cwd(),
        ...target,
        operations,
        commandSource: "plan.edit",
        host: effectiveHost,
        ownerSessionKey: resolveOwnerSessionKey() ?? undefined,
      });
      printJson(compactPlanCommandResult("plan.edit", result, effectiveHost));
      if (result.operationChain?.status === "partial") process.exitCode = 1;
      return;
    }
    case "remove": {
      const updates = readPlanRemovalUpdates(args);
      if (!updates) {
        throw new ClawError(
          "PROJECT_CONFIG_INVALID",
          "plan remove requires at least one --question, --acceptance, --rule, --key-decision, or --reference.",
        );
      }
      const target = readPlanMutationTarget(args);
      assertNoRemainingArgs(args, "plan remove");
      const result = await editPlan({
        cwd: process.cwd(),
        ...target,
        updates,
        commandSource: "plan.edit",
        host: effectiveHost,
        ownerSessionKey: resolveOwnerSessionKey() ?? undefined,
      });
      printJson(compactPlanCommandResult("plan.remove", result, effectiveHost));
      return;
    }
    case "wait":
      await runPlanStatusAlias(args, "process.wait", "plan.wait", effectiveHost);
      return;
    case "resume":
      await runPlanStatusAlias(args, "process.active", "plan.resume", effectiveHost);
      return;
    case "start": {
      const updates = readPlanFieldUpdates(args);
      const appendTasks = readExplicitAddedTasks(args);
      if (!updates && appendTasks.length === 0) {
        throw new ClawError(
          "PROJECT_CONFIG_INVALID",
          "plan start requires explicit plan fields or at least one --add-task.",
        );
      }
      const target = readPlanMutationTarget(args);
      assertNoRemainingArgs(args, "plan start");
      const result = await editPlan({
        cwd: process.cwd(),
        ...target,
        updates,
        appendTasks,
        planStatus: "process.active",
        completeLifecycleBridge: true,
        commandSource: "plan.start",
        host: effectiveHost,
        ownerSessionKey: resolveOwnerSessionKey() ?? undefined,
      });
      printJson(compactPlanCommandResult("plan.start", result, effectiveHost));
      return;
    }
    case "done": {
      const retrospective = readOptionalFlag(args, "--retrospective");
      if (!retrospective?.trim()) {
        throw new ClawError(
          "PROJECT_CONFIG_INVALID",
          "plan done requires --retrospective.",
        );
      }
      const updates: PlanFieldUpdates = {
        retrospectiveSummary: retrospective,
        keyDecisions: readRepeatedFlag(args, "--key-decision"),
        whatWorked: readRepeatedFlag(args, "--what-worked"),
        issues: readRepeatedFlag(args, "--issue"),
        followUps: readRepeatedFlag(args, "--follow-up"),
      };
      const target = readPlanMutationTarget(args);
      assertNoRemainingArgs(args, "plan done");
      const ownerSessionKey = resolveOwnerSessionKey() ?? undefined;
      const workflowProject = resolveWorkflowProjectContext(process.cwd(), ownerSessionKey);
      const gitNexusPreflightAnalyzed = workflowProject.scope === "project"
        ? ensureGitNexusReadyForPlanDone(process.cwd())
        : false;
      const result = await editPlan({
        cwd: process.cwd(),
        ...target,
        updates,
        planStatus: "end.completed",
        commandSource: "plan.done",
        host: effectiveHost,
        ownerSessionKey,
      });
      const completionRefresh = workflowProject.scope === "project"
        ? queueCompletionRefresh({
            cwd: process.cwd(),
            taskName: result.taskName,
            skipGitNexusRefresh: gitNexusPreflightAnalyzed,
          })
        : undefined;
      printJson(compactPlanCommandResult("plan.done", result, effectiveHost, completionRefresh));
      return;
    }
    case "show": {
      const target = readPlanMutationTarget(args);
      assertNoRemainingArgs(args, "plan show");
      const result = showPlan({
        cwd: process.cwd(),
        ...target,
        ownerSessionKey: resolveOwnerSessionKey() ?? undefined,
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

async function runPlanStatusAlias(
  args: string[],
  planStatus: "process.wait" | "process.active",
  command: "plan.wait" | "plan.resume",
  effectiveHost: ClawHost | undefined,
): Promise<void> {
  const result = await editPlan({
    cwd: process.cwd(),
    ...readPlanMutationTarget(args),
    planStatus,
    commandSource: "plan.edit",
    host: effectiveHost,
    ownerSessionKey: resolveOwnerSessionKey() ?? undefined,
  });
  assertNoRemainingArgs(args, command);
  printJson(compactPlanCommandResult(command, result, effectiveHost));
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
        ...(template.scope ? { scope: template.scope } : {}),
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

async function runTask(args: string[], effectiveHost: ClawHost | undefined): Promise<void> {
  const subcommand = args.shift();
  switch (subcommand) {
    case "add": {
      const target = readPlanMutationTarget(args);
      const operations = readOrderedTaskAddOperations(args);
      const result = await editPlan({
        cwd: process.cwd(),
        ...target,
        operations,
        commandSource: "plan.edit",
        host: effectiveHost,
        ownerSessionKey: resolveOwnerSessionKey() ?? undefined,
      });
      printJson(compactPlanCommandResult("task.add", result, effectiveHost));
      if (result.operationChain?.status === "partial") process.exitCode = 1;
      return;
    }
    case "edit": {
      const target = readPlanMutationTarget(args);
      const operations = readOrderedTaskEditOperations(args);
      const result = await editPlan({
        cwd: process.cwd(),
        ...target,
        operations,
        commandSource: "plan.edit",
        host: effectiveHost,
        ownerSessionKey: resolveOwnerSessionKey() ?? undefined,
      });
      printJson(compactPlanCommandResult("task.edit", result, effectiveHost));
      if (result.operationChain?.status === "partial") process.exitCode = 1;
      return;
    }
    case "remove": {
      const target = readPlanMutationTarget(args);
      const operations = readOrderedTaskRemoveOperations(args);
      const result = await editPlan({
        cwd: process.cwd(),
        ...target,
        operations,
        commandSource: "plan.edit",
        host: effectiveHost,
        ownerSessionKey: resolveOwnerSessionKey() ?? undefined,
      });
      printJson(compactPlanCommandResult("task.remove", result, effectiveHost));
      if (result.operationChain?.status === "partial") process.exitCode = 1;
      return;
    }
    case "done": {
      const target = readPlanMutationTarget(args);
      const operations = readOrderedTaskDoneOperations(args);
      const result = await editPlan({
        cwd: process.cwd(),
        ...target,
        operations,
        host: effectiveHost,
        ownerSessionKey: resolveOwnerSessionKey() ?? undefined,
      });
      printJson(compactPlanCommandResult("task.done", result, effectiveHost));
      if (result.operationChain?.status === "partial") process.exitCode = 1;
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

function runDirect(args: string[], effectiveHost: ClawHost | undefined): void {
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
        host: effectiveHost,
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
  effectiveHost?: ClawHost,
): Promise<Record<string, unknown>> {
  const taskName = readOptionalFlag(args, "--task");
  let initialized = false;
  let corrected = false;
  let fixedPaths: string[] = [];

  const sessionProject = resolveSessionWorkflowContext(ownerSessionKey ?? undefined);
  if (sessionProject) {
    const activeWorkflow = !taskName && ownerSessionKey
      ? await tryResolveActiveWorkflowSnapshot(cwd, ownerSessionKey, effectiveHost)
      : null;
    const codexRuntime = effectiveHost === "codex" ? checkCodexRuntime() : null;
    const codexRuntimeError = codexRuntime && !codexRuntime.ok
      ? buildCodexRuntimeError(codexRuntime.detail)
      : null;
    return {
      project: sessionProject,
      ...(activeWorkflow ? { activeWorkflow } : {}),
      ...(codexRuntimeError ? { error: codexRuntimeError } : {}),
    };
  }

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
  if (versionSync.projectVersionUpdated) {
    corrected = true;
    if (!fixedPaths.includes("project.json")) {
      fixedPaths.push("project.json");
    }
    resolved = resolveContext(cwd, taskName);
  }
  const activeWorkflow =
    !taskName && ownerSessionKey
      ? await tryResolveActiveWorkflowSnapshot(cwd, ownerSessionKey, effectiveHost)
      : null;
  const codexRuntime = effectiveHost === "codex" ? checkCodexRuntime() : null;
  const codexRuntimeError = codexRuntime && !codexRuntime.ok
    ? buildCodexRuntimeError(codexRuntime.detail)
    : null;

  return {
    ...resolved,
    ...(activeWorkflow ? { activeWorkflow } : {}),
    ...(codexRuntimeError ? { error: codexRuntimeError } : {}),
    protocolCheck: checkProjectProtocol(cwd),
    startupRecovery: {
      initialized,
      corrected,
      fixedPaths,
      versionSync: {
        cliVersion: versionSync.cliVersion,
        projectVersion: versionSync.projectVersion,
        projectVersionAligned: versionSync.projectVersionAligned,
        cliVersionLagging: versionSync.cliVersionLagging,
        updateAvailable: versionSync.updateAvailable,
        autoUpdateEnabled: versionSync.autoUpdateEnabled,
        updateSkill: versionSync.updateSkill,
        ...(versionSync.latestPublishedVersion !== undefined
          ? { latestPublishedVersion: versionSync.latestPublishedVersion }
          : {}),
        ...(versionSync.message !== undefined ? { message: versionSync.message } : {}),
      },
    },
  };
}

function buildPublicContextOutput(context: Record<string, unknown>): Record<string, unknown> {
  const project = asJsonRecord(context.project);
  const output: JsonRecord = {};
  if (project) {
    output.project = {
      ...(project.scope === "session" ? { scope: "session" } : {}),
      projectRoot: project.projectRoot,
      clawDir: project.clawDir,
      projectId: project.projectId,
      ...(typeof project.projectName === "string" && project.projectName.trim()
        ? { projectName: project.projectName }
        : {}),
    };
  }

  if (context.task !== undefined) {
    output.task = context.task;
  }
  if (context.activeWorkflow !== undefined) {
    output.activeWorkflow = context.activeWorkflow;
  } else {
    output.session = {
      boundPlan: false,
      note: "No plan is bound to this session yet. Ask the user for the task scope, or run `claw plan create` when ready to start one.",
    };
  }
  if (context.error !== undefined) {
    output.error = context.error;
  }

  const protocolCheck = asJsonRecord(context.protocolCheck);
  if (protocolCheck && protocolCheck.ok !== true) {
    output.protocolCheck = protocolCheck;
  }

  const startupRecovery = asJsonRecord(context.startupRecovery);
  const compactRecovery: JsonRecord = {};
  if (startupRecovery?.initialized === true) {
    compactRecovery.initialized = true;
  }
  if (startupRecovery?.corrected === true) {
    compactRecovery.corrected = true;
  }
  const fixedPaths = Array.isArray(startupRecovery?.fixedPaths)
    ? startupRecovery.fixedPaths.filter((entry): entry is string => typeof entry === "string" && !!entry.trim())
    : [];
  if (fixedPaths.length > 0) {
    compactRecovery.fixedPaths = fixedPaths;
  }
  const versionSync = asJsonRecord(startupRecovery?.versionSync);
  if (versionSync && shouldExposeVersionSync(versionSync)) {
    compactRecovery.versionSync = versionSync;
  }
  if (Object.keys(compactRecovery).length > 0) {
    output.startupRecovery = compactRecovery;
  }

  const searchGuidance = buildContextSearchGuidance(context);
  if (searchGuidance) {
    output.searchGuidance = searchGuidance;
  }
  return output;
}

function shouldExposeVersionSync(versionSync: JsonRecord): boolean {
  return versionSync.projectVersionAligned !== true
    || versionSync.cliVersionLagging === true
    || versionSync.updateAvailable === true
    || versionSync.projectVersion !== versionSync.cliVersion;
}

function buildContextSearchGuidance(context: Record<string, unknown>): string | null {
  const project = asJsonRecord(context.project);
  const projectConfig = asJsonRecord(project?.projectConfig);
  const memory = asJsonRecord(projectConfig?.memory);
  const embeddingEnabled = memory?.enabled === true && asJsonRecord(memory.embedding) !== null;
  const gitnexusEnabled = projectConfig?.gitnexus === true;

  if (embeddingEnabled && gitnexusEnabled) {
    return "When useful, use `claw search` to narrow the document search scope and GitNexus to narrow the code search scope, then use the default search to locate exact files or symbols.";
  }
  if (embeddingEnabled) {
    return "When useful, use `claw search` to narrow the document search scope, then use the default search to locate exact files or symbols.";
  }
  if (gitnexusEnabled) {
    return "When useful, use GitNexus to narrow the code search scope, then use the default search to locate exact files or symbols.";
  }
  return null;
}

function buildCodexRuntimeError(detail: string | undefined): JsonRecord {
  return {
    code: "CODEX_SDK_RUNTIME_MISSING",
    message: "The Codex SDK runtime required by claw-kit is missing or invalid.",
    detail: detail || "The versioned Codex SDK runtime did not pass verification.",
    prompt: "Tell the user that the Codex SDK runtime required for automatic Truth and ADR finalization is missing or invalid. Ask for permission to investigate and repair the dependency. Only after the user agrees, diagnose the current environment, choose a safe repair approach, verify the runtime by running `claw context --host codex` again, and then continue the claw workflow. Do not repeat a failed repair action blindly.",
    requiresUserConsent: true,
  };
}

type ContextVersionSyncResult = {
  cliVersion: string;
  projectVersion: string | null;
  projectVersionAligned: boolean;
  projectVersionUpdated: boolean;
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
      projectVersionUpdated: true,
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
      projectVersionUpdated: true,
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
      projectVersionAligned: true,
      projectVersionUpdated: false,
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
      projectVersionUpdated: false,
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
    projectVersionUpdated: false,
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

async function runHook(args: string[], effectiveHost: ClawHost | undefined): Promise<void> {
  const eventName = args.shift();
  if (!eventName) {
    throw new ClawError("PROJECT_CONFIG_INVALID", "claw hook requires an event name.");
  }
  if (eventName === "SessionStart" || eventName === "auto-claw") {
    await runSessionStartHook(effectiveHost);
    return;
  }
  if (eventName === "Stop" || eventName === "auto-doc") {
    await runStopHook(effectiveHost);
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

async function runStopHook(effectiveHost: ClawHost | undefined): Promise<void> {
  if (process.env.CLAW_KNOWLEDGE_FINALIZER === "1") {
    return;
  }
  const payload = await readStdinJson();
  const hookCwd = resolveHookCwd(payload);
  const sessionId = resolveOwnerSessionKey(payload);
  const turnId = readHookString(payload, "turn_id");
  const transcriptPath = readHookString(payload, "transcript_path");
  const payloadMessage = readHookString(payload, "message");
  if (!hookCwd || !sessionId || !turnId || !containsClawDir(hookCwd)) {
    return;
  }
  try {
    const project = resolveProjectContext(hookCwd);
    // Codex passes a transcript_path; opencode and other hosts without a file
    // transcript pass the final assistant message inline. Either source is valid.
    const message = payloadMessage ?? (transcriptPath ? extractLatestFinalAssistantMessage(transcriptPath) : null);
    if (!message) {
      return;
    }
    const result = tryCaptureKnowledgeStop({
      project,
      sessionId,
      turnId,
      message,
      host: effectiveHost,
    });
    if (result.ok && result.jobPath && process.env.CLAW_KNOWLEDGE_FINALIZER_DISABLE_LAUNCH !== "1") {
      launchKnowledgeFinalizationWorker(result.jobPath, project.projectRoot);
    }
  } catch {
    // Knowledge capture is a fail-open sidecar and must never block Stop.
  }
}

async function runInternalKnowledgeFinalize(args: string[]): Promise<void> {
  const jobPath = readRequiredFlag(args, "--job");
  const running = claimKnowledgeFinalizationJob(jobPath);
  if (!running) {
    return;
  }
  try {
    const project = resolveProjectContext(running.projectRoot);
    const writerRun = await runKnowledgeWriterForJob(running);
    const truthEncoding = normalizeTruthMarkdownEncoding(project);
    queueCompletionRefresh({
      cwd: running.projectRoot,
      taskName: running.taskName,
      includeTaskRetention: false,
      includeTaskMemory: false,
      statusLabel: `knowledge-${running.finalizeId.slice(0, 12)}`,
      skipGitNexusRefresh: true,
    });
    writeKnowledgeFinalizationJob(jobPath, {
      ...running,
      status: "succeeded",
      finishedAt: new Date().toISOString(),
      ...(writerRun.threadId ? { sdkThreadId: writerRun.threadId } : {}),
      finalResponse: writerRun.finalResponse,
      truthEncoding,
    });
    tryCleanupKnowledgeFinalizationReport(project, running.reportPath);
  } catch (error) {
    const failed: KnowledgeFinalizationJob = {
      ...running,
      status: "failed",
      finishedAt: new Date().toISOString(),
      error: { message: error instanceof Error ? error.message : String(error) },
    };
    writeKnowledgeFinalizationJob(jobPath, failed);
    if (failed.attempts < 3 && process.env.CLAW_KNOWLEDGE_FINALIZER_DISABLE_RETRY !== "1") {
      launchKnowledgeFinalizationWorker(jobPath, failed.projectRoot);
    }
  }
}

type KnowledgeWriterRunResult = {
  finalResponse: string;
  threadId?: string;
};

/**
 * Pick the host-aware finalization runner. The opencode host never assumes a Codex SDK
 * runtime is installed and runs the writer through `opencode run`; the Codex host and
 * legacy jobs without a host field keep using the versioned Codex SDK runtime.
 */
async function runKnowledgeWriterForJob(running: KnowledgeFinalizationJob): Promise<KnowledgeWriterRunResult> {
  if (running.host === "opencode") {
    const result = runOpencodeKnowledgeWriter({
      prompt: buildKnowledgeWriterPrompt(running),
      projectRoot: running.projectRoot,
      writer: running.writer ?? null,
    });
    assertCompletedKnowledgeWriterSession(result.threadId ?? null);
    return {
      finalResponse: result.finalResponse,
      ...(result.threadId ? { threadId: result.threadId } : {}),
    };
  }
  if (running.host !== undefined && running.host !== null && running.host !== "codex") {
    throw new Error(`Unsupported knowledge finalization job host "${String(running.host)}".`);
  }
  return runCodexSdkWriter(running);
}

async function runCodexSdkWriter(running: KnowledgeFinalizationJob): Promise<KnowledgeWriterRunResult> {
  const sdk = await import(pathToFileURL(resolveCodexSdkEntryPath()).href) as {
    Codex: new (options?: { env?: Record<string, string>; codexPathOverride?: string }) => {
      startThread(options: Record<string, unknown>): {
        id: string | null;
        run(prompt: string): Promise<{ finalResponse: string }>;
      };
    };
  };
  const Codex = sdk.Codex;
  const codex = new Codex({
    env: knowledgeFinalizerEnvironment(),
    ...(process.env.CLAW_CODEX_PATH_OVERRIDE
      ? { codexPathOverride: process.env.CLAW_CODEX_PATH_OVERRIDE }
      : {}),
  });
  const writer = running.writer ?? { model: null, reasoningEffort: "medium" as const };
  const thread = codex.startThread({
    workingDirectory: running.projectRoot,
    sandboxMode: process.platform === "win32" ? "danger-full-access" : "workspace-write",
    approvalPolicy: "never",
    networkAccessEnabled: false,
    ...(writer.model ? { model: writer.model } : {}),
    ...(writer.reasoningEffort
      ? { modelReasoningEffort: writer.reasoningEffort }
      : {}),
  });
  const turn = await thread.run(buildKnowledgeWriterPrompt(running));
  assertCompletedKnowledgeWriterSession(thread.id);
  return {
    finalResponse: turn.finalResponse,
    ...(thread.id ? { threadId: thread.id } : {}),
  };
}

function assertCompletedKnowledgeWriterSession(threadId: string | null): void {
  if (!threadId) {
    throw new Error("Knowledge writer returned no host session id.");
  }
  const sessionProject = resolveSessionWorkflowContext(threadId);
  if (!sessionProject || !fs.existsSync(sessionProject.tasksDir)) {
    throw new Error("Knowledge writer did not create its required session workflow.");
  }
  const completed = fs.readdirSync(sessionProject.tasksDir, { withFileTypes: true }).some((entry) => {
    if (!entry.isDirectory()) {
      return false;
    }
    const planPath = path.join(sessionProject.tasksDir, entry.name, "plan.json");
    if (!fs.existsSync(planPath)) {
      return false;
    }
    try {
      const plan = JSON.parse(fs.readFileSync(planPath, "utf8")) as Partial<PlanDocument>;
      return plan.templateId === "knowledge-writer"
        && plan.status === "end.completed"
        && Array.isArray(plan.tasks)
        && plan.tasks.length > 0
        && plan.tasks.every((task) => task.status === "done");
    } catch {
      return false;
    }
  });
  if (!completed) {
    throw new Error("Knowledge writer did not complete its required session workflow.");
  }
}

function knowledgeFinalizerEnvironment(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(withoutInvocationHost())) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  env.CLAW_KNOWLEDGE_FINALIZER = "1";
  return env;
}

function buildKnowledgeWriterPrompt(job: KnowledgeFinalizationJob): string {
  const writerSkill = job.writer?.externalSkill?.trim() || "claw-kit:knowledge-writer";
  return [
    `Use the ${writerSkill} skill and follow it exactly.`,
    "Act as the knowledge-base steward: maintain Truth and ADR together, preserve one current owner, and reconcile related current claims before completion.",
    `Completed plan: ${job.planPath}`,
    `Turn report: ${job.reportPath}`,
    `Finalization id: ${job.finalizeId}`,
    "Treat the completed plan and report as verified evidence. Do not edit either input, do not dispatch subagents, and do not repeat implementation or test verification.",
  ].join("\n");
}

function launchKnowledgeFinalizationWorker(jobPath: string, cwd: string): void {
  if (process.platform === "win32") {
    const launcherScript = [
      "$node = $env:CLAW_KNOWLEDGE_NODE",
      "$entry = $env:CLAW_KNOWLEDGE_ENTRY",
      "$job = $env:CLAW_KNOWLEDGE_JOB",
      "$cwd = $env:CLAW_KNOWLEDGE_CWD",
      "Start-Process -FilePath $node -ArgumentList @($entry, 'internal-knowledge-finalize', '--job', $job) -WorkingDirectory $cwd -WindowStyle Hidden",
    ].join("; ");
    const launcher = spawnSync("powershell.exe", ["-NoProfile", "-Command", launcherScript], {
      cwd,
      stdio: "ignore",
      windowsHide: true,
      env: {
        ...withoutInvocationHost(),
        CLAW_KNOWLEDGE_NODE: process.execPath,
        CLAW_KNOWLEDGE_ENTRY: resolveCliEntryPath(),
        CLAW_KNOWLEDGE_JOB: jobPath,
        CLAW_KNOWLEDGE_CWD: cwd,
      },
    });
    if (launcher.error || (launcher.status ?? 0) !== 0) {
      throw launcher.error ?? new Error(`Knowledge finalizer launcher exited with ${launcher.status ?? 1}.`);
    }
    return;
  }
  const child = spawn(
    process.execPath,
    [resolveCliEntryPath(), "internal-knowledge-finalize", "--job", jobPath],
    { cwd, detached: true, stdio: "ignore", windowsHide: true, env: withoutInvocationHost() },
  );
  child.unref();
}

async function runSessionStartHook(effectiveHost: ClawHost | undefined): Promise<void> {
  if (process.env.CLAW_KNOWLEDGE_FINALIZER === "1") {
    return;
  }
  const payload = await readStdinJson();
  const hookCwd = resolveHookCwd(payload);
  const ownerSessionKey = resolveOwnerSessionKey(payload);

  if (!hookCwd) {
    return;
  }
  const sessionProject = resolveSessionWorkflowContext(ownerSessionKey ?? undefined);
  if (!containsClawDir(hookCwd) && !sessionProject) {
    return;
  }

  try {
    const context = await runContextCommand([], hookCwd, ownerSessionKey, effectiveHost);
    const contextProject = asJsonRecord(context.project);
    if (
      contextProject?.scope !== "session"
      && !context.error
      && process.env.CLAW_KNOWLEDGE_FINALIZER_DISABLE_LAUNCH !== "1"
    ) {
      const project = resolveProjectContext(hookCwd);
      for (const jobPath of listRetryableKnowledgeFinalizationJobs(project)) {
        try {
          launchKnowledgeFinalizationWorker(jobPath, project.projectRoot);
        } catch {
          // Retry discovery remains fail-open and may run again on a later SessionStart.
        }
      }
    }
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

function readHookString(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
  const searchGuidance = buildContextSearchGuidance(context);
  const runtimeErrorPrompt = buildCodexRuntimeErrorPrompt(context);
  const activeWorkflow = context.activeWorkflow as JsonRecord | undefined;
  if (activeWorkflow) {
    const prompt = buildRecoveredWorkflowAdditionalContext(activeWorkflow, versionSyncPrompt);
    const promptWithSearch = searchGuidance ? `${prompt}\n${searchGuidance}` : prompt;
    return runtimeErrorPrompt ? `${runtimeErrorPrompt}\n\n${promptWithSearch}` : promptWithSearch;
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
  const promptWithVersion = !versionSyncPrompt
    ? prompt
    : versionSyncPrompt.placement === "prefix"
    ? `${versionSyncPrompt.lines.join("\n")}\n${prompt}`
    : `${prompt}\n${versionSyncPrompt.lines.join("\n")}`;
  const promptWithSearch = searchGuidance ? `${promptWithVersion}\n${searchGuidance}` : promptWithVersion;
  return runtimeErrorPrompt ? `${runtimeErrorPrompt}\n\n${promptWithSearch}` : promptWithSearch;
}

function buildCodexRuntimeErrorPrompt(context: Record<string, unknown>): string | null {
  const error = asJsonRecord(context.error);
  if (error?.code !== "CODEX_SDK_RUNTIME_MISSING") {
    return null;
  }
  return typeof error.prompt === "string" && error.prompt.trim() ? error.prompt.trim() : null;
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
  effectiveHost: ClawHost | undefined,
): Promise<{
  taskName: string;
  planFile: string;
  planPath: string;
  planStatus: string;
  planSummary: string;
  planContent: PlanDocument;
  workflowGuidance: WorkflowGuidance;
} | null> {
  const project = resolveWorkflowProjectContext(cwd, ownerSessionKey);
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
      ownerSessionKey,
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
        host: effectiveHost,
      }),
    };
  } catch {
    unbindSession(project, ownerSessionKey);
    return null;
  }
}

async function runSubplan(args: string[], effectiveHost: ClawHost | undefined): Promise<void> {
  const subcommand = args.shift();
  switch (subcommand) {
    case "create": {
      const templateName = readOptionalFlag(args, "--template") ?? undefined;
      const templateFile = readOptionalFlag(args, "--template-file");
      if (templateName && templateFile) {
        throw new ClawError("PROJECT_CONFIG_INVALID", "--template and --template-file are mutually exclusive.");
      }
      const result = await createSubplan({
        cwd: process.cwd(),
        parentTaskName: readRequiredFlag(args, "--parent"),
        parentTaskId: readOptionalNumber(args, "--task-id") ?? failMissingNumericFlag("--task-id"),
        templateName,
        templateFile: templateFile ? path.resolve(process.cwd(), templateFile) : undefined,
        ownerSessionKey: resolveOwnerSessionKey() ?? undefined,
        host: effectiveHost,
      });
      assertNoRemainingArgs(args, "subplan create");
      printJson(compactPlanCommandResult("subplan.create", result, effectiveHost));
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
  const bufferedInput = consumeBufferedHookInput();
  const chunks: string[] = [];
  if (bufferedInput === null) {
    for await (const chunk of process.stdin) {
      chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    }
  }
  const raw = (bufferedInput ?? chunks.join("")).trim();
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
  command: "plan.create" | "plan.start" | "plan.edit" | "plan.remove" | "plan.wait" | "plan.resume" | "plan.done" | "task.add" | "task.edit" | "task.remove" | "task.done" | "subplan.create",
  result: {
    taskName: string;
    planFile: string;
    planPath: string;
    planStatus: string;
    workflowGuidance: WorkflowGuidance;
    plan?: PlanDocument;
    planView: PlanViewModel;
    planReview?: {
      score: number;
      issues: unknown[];
      suggestions: string[];
      completionPolicy: string;
    };
    previousPlanStatus?: string;
    changedTaskIds?: number[];
    appendedTaskIds?: number[];
    events?: PlanEvent[];
    operationChain?: {
      status: "completed" | "partial";
      completedOperations: number;
      remainingOperations: number;
      failedOperation?: Record<string, unknown>;
    };
  },
  effectiveHost: ClawHost | undefined,
  completionRefresh?: CompletionRefreshResult,
  ): Record<string, unknown> {
    const archivedPlanPath =
      completionRefresh?.taskRetention.archivedCurrentTask?.taskName === result.taskName &&
      completionRefresh.taskRetention.archivedCurrentTask.archivedPlanPath
        ? completionRefresh.taskRetention.archivedCurrentTask.archivedPlanPath
        : undefined;
    const resolvedPlanPath = archivedPlanPath ?? result.planPath;
    const codexResult = effectiveHost === "codex";
    const hostActions = codexResult ? buildHostActions(result) : [];
    return {
      ok: true,
      command,
      planPath: resolvedPlanPath,
      ...(archivedPlanPath ? { archivedPlanPath } : {}),
      planStatus: result.planStatus,
      ...(!codexResult && result.previousPlanStatus ? { previousPlanStatus: result.previousPlanStatus } : {}),
      ...(hostActions.length ? { hostActions } : {}),
      ...(!codexResult && result.changedTaskIds?.length ? { changedTaskIds: result.changedTaskIds } : {}),
      ...(!codexResult && result.appendedTaskIds?.length ? { appendedTaskIds: result.appendedTaskIds } : {}),
      ...(codexResult ? { stage: result.workflowGuidance.stage } : {}),
      ...(!codexResult ? { nextsteps: result.workflowGuidance.nextsteps } : {}),
      ...(result.workflowGuidance.nextTask ? { nextTask: result.workflowGuidance.nextTask } : {}),
      ...(result.workflowGuidance.notes?.trim() && !codexResult
        ? { notes: result.workflowGuidance.notes }
        : {}),
      ...(result.workflowGuidance.recommendedCommands?.length
        ? { recommendedCommands: result.workflowGuidance.recommendedCommands }
        : {}),
      ...(result.workflowGuidance.askUser ? { askUser: result.workflowGuidance.askUser } : {}),
      ...(result.operationChain?.status === "partial"
        ? {
            chainStatus: "partial",
            completedOperations: result.operationChain.completedOperations,
            remainingOperations: result.operationChain.remainingOperations,
            failedOperation: result.operationChain.failedOperation,
          }
        : {}),
      ...(!codexResult && result.workflowGuidance.goalMode ? { goalMode: result.workflowGuidance.goalMode } : {}),
      ...(!codexResult && result.workflowGuidance.goalTool ? { goalTool: result.workflowGuidance.goalTool } : {}),
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

function buildHostActions(result: {
  planPath: string;
  planStatus: string;
  plan?: PlanDocument;
  planView: PlanViewModel;
  workflowGuidance: WorkflowGuidance;
  events?: PlanEvent[];
}): Array<Record<string, unknown>> {
  const latestEvent = result.events?.at(-1);
  if (!latestEvent) {
    return [];
  }
  const actions: Array<Record<string, unknown>> = [];
  if (result.plan) {
    let assignedInProgress = false;
    const plan = result.plan.tasks.map((task) => {
      let status: "pending" | "in_progress" | "completed" = task.status === "done" ? "completed" : "pending";
      if (!assignedInProgress && result.planStatus === "process.active" && task.status !== "done") {
        status = "in_progress";
        assignedInProgress = true;
      }
      return { step: task.title, status };
    });
    actions.push({
      schemaVersion: 1,
      id: `${latestEvent.mutationId}:update_plan`,
      sourceEventId: latestEvent.eventId,
      tool: "update_plan",
      input: {
        explanation: result.workflowGuidance.summary,
        plan,
      },
    });
  }
  if (result.workflowGuidance.goalTool) {
    const goalTool = result.workflowGuidance.goalTool;
    if (goalTool.tool === "create_goal") {
      actions.push({
        schemaVersion: 1,
        id: `${latestEvent.mutationId}:create_goal`,
        sourceEventId: latestEvent.eventId,
        tool: "create_goal",
        input: {
          objective: goalTool.objective,
        },
        meta: {
          allowOverwrite: goalTool.allowOverwrite,
          reason: goalTool.reason,
        },
      });
    } else {
      const codexStatus = result.planStatus === "process.wait" || result.planStatus === "process.discussing"
        ? "complete"
        : goalTool.status;
      actions.push({
        schemaVersion: 1,
        id: `${latestEvent.mutationId}:update_goal`,
        sourceEventId: latestEvent.eventId,
        tool: "update_goal",
        input: {
          status: codexStatus,
        },
        meta: {
          reason: goalTool.reason,
        },
      });
    }
  }
  return actions;
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
    ...(workflowGuidance.notes?.trim() ? { notes: workflowGuidance.notes } : {}),
    ...(workflowGuidance.recommendedCommands?.length
      ? { recommendedCommands: workflowGuidance.recommendedCommands }
      : {}),
  };
}

function readPlanFieldUpdates(args: string[]): PlanFieldUpdates | undefined {
  const references = readGroupedValues(args, "--reference", "--why", true).map((entry) => ({
    path: entry.value,
    why: entry.detail!,
  }));
  const updates: PlanFieldUpdates = {
    goalText: readOptionalFlag(args, "--goal"),
    requirementsSummary: readOptionalFlag(args, "--requirements"),
    openQuestions: readRepeatedFlag(args, "--question"),
    acceptanceCriteria: readRepeatedFlag(args, "--acceptance"),
    planSummary: readOptionalFlag(args, "--summary"),
    rules: readRepeatedFlag(args, "--rule"),
    keyDecisions: readRepeatedFlag(args, "--key-decision"),
    references,
  };
  return Object.values(updates).some((value) => Array.isArray(value) ? value.length > 0 : value !== undefined)
    ? updates
    : undefined;
}

function readOrderedPlanEditOperations(args: string[]): PlanMutationOperation[] {
  const operations: PlanMutationOperation[] = [];
  while (args.length > 0) {
    const flag = args.shift()!;
    switch (flag) {
      case "--goal":
        operations.push({ type: "plan.update", updates: { goalText: readChainValue(args, flag) } });
        break;
      case "--requirements":
        operations.push({ type: "plan.update", updates: { requirementsSummary: readChainValue(args, flag) } });
        break;
      case "--question":
        operations.push({ type: "plan.update", updates: { openQuestions: [readChainValue(args, flag)] } });
        break;
      case "--acceptance":
        operations.push({ type: "plan.update", updates: { acceptanceCriteria: [readChainValue(args, flag)] } });
        break;
      case "--summary":
        operations.push({ type: "plan.update", updates: { planSummary: readChainValue(args, flag) } });
        break;
      case "--rule":
        operations.push({ type: "plan.update", updates: { rules: [readChainValue(args, flag)] } });
        break;
      case "--key-decision":
        operations.push({ type: "plan.update", updates: { keyDecisions: [readChainValue(args, flag)] } });
        break;
      case "--reference": {
        const path = readChainValue(args, flag);
        const whyFlag = args.shift();
        if (whyFlag !== "--why") {
          throw new ClawError("PROJECT_CONFIG_INVALID", "Each --reference must be followed immediately by --why <text>.");
        }
        operations.push({ type: "plan.update", updates: { references: [{ path, why: readChainValue(args, "--why") }] } });
        break;
      }
      case "--status":
        operations.push({ type: "plan.status", status: readChainValue(args, flag) });
        break;
      default:
        throw new ClawError("PROJECT_CONFIG_INVALID", `Unknown argument for plan edit: ${flag}`);
    }
  }
  return operations;
}

function readOrderedTaskAddOperations(args: string[]): PlanMutationOperation[] {
  const operations: PlanMutationOperation[] = [];
  while (args.length > 0) {
    const flag = args.shift();
    if (flag !== "--title") {
      throw new ClawError("PROJECT_CONFIG_INVALID", `task add expects --title to start each task group, received ${flag ?? "end of input"}.`);
    }
    const title = readChainValue(args, flag);
    let detail: string | undefined;
    if (args[0] === "--detail") {
      args.shift();
      detail = readChainValue(args, "--detail");
    }
    operations.push({ type: "task.add", title, ...(detail !== undefined ? { detail } : {}) });
  }
  if (operations.length === 0) {
    throw new ClawError("PROJECT_CONFIG_INVALID", "task add requires at least one --title.");
  }
  return operations;
}

function readOrderedTaskEditOperations(args: string[]): PlanMutationOperation[] {
  const operations: PlanMutationOperation[] = [];
  while (args.length > 0) {
    const flag = args.shift();
    if (flag !== "--id") {
      throw new ClawError("PROJECT_CONFIG_INVALID", `task edit expects --id to start each task group, received ${flag ?? "end of input"}.`);
    }
    const id = readChainNumber(args, flag);
    const fields: { title?: string; detail?: string; status?: PlanTask["status"]; choiceId?: string } = {};
    const seen = new Set<string>();
    while (args.length > 0 && args[0] !== "--id") {
      const field = args.shift()!;
      if (!["--title", "--detail", "--status", "--choice"].includes(field)) {
        throw new ClawError("PROJECT_CONFIG_INVALID", `Unknown argument in task edit group ${id}: ${field}`);
      }
      if (seen.has(field)) {
        throw new ClawError("PROJECT_CONFIG_INVALID", `Duplicate ${field} in task edit group ${id}.`);
      }
      seen.add(field);
      const value = readChainValue(args, field);
      if (field === "--title") fields.title = value;
      else if (field === "--detail") fields.detail = value;
      else if (field === "--status") fields.status = value as PlanTask["status"];
      else fields.choiceId = value;
    }
    if (seen.size === 0) {
      throw new ClawError("PROJECT_CONFIG_INVALID", `task edit group ${id} requires --title, --detail, --status, or --choice.`);
    }
    operations.push({ type: "task.edit", id, ...fields });
  }
  if (operations.length === 0) {
    throw new ClawError("PROJECT_CONFIG_INVALID", "task edit requires at least one --id group.");
  }
  return operations;
}

function readOrderedTaskRemoveOperations(args: string[]): PlanMutationOperation[] {
  const operations: PlanMutationOperation[] = [];
  while (args.length > 0) {
    const flag = args.shift();
    if (flag !== "--id") {
      throw new ClawError("PROJECT_CONFIG_INVALID", `task remove accepts repeated --id values, received ${flag ?? "end of input"}.`);
    }
    operations.push({ type: "task.remove", id: readChainNumber(args, flag) });
  }
  if (operations.length === 0) {
    throw new ClawError("PROJECT_CONFIG_INVALID", "task remove requires at least one --id.");
  }
  return operations;
}

function readOrderedTaskDoneOperations(args: string[]): PlanMutationOperation[] {
  const operations: PlanMutationOperation[] = [];
  while (args.length > 0) {
    const flag = args.shift();
    if (flag !== "--id") {
      throw new ClawError("PROJECT_CONFIG_INVALID", `task done expects --id to start each task group, received ${flag ?? "end of input"}.`);
    }
    const id = readChainNumber(args, flag);
    let choiceId: string | undefined;
    if (args[0] === "--choice") {
      args.shift();
      choiceId = readChainValue(args, "--choice");
    }
    operations.push({ type: "task.edit", id, status: "done", ...(choiceId ? { choiceId } : {}) });
  }
  if (operations.length === 0) {
    throw new ClawError("PROJECT_CONFIG_INVALID", "task done requires at least one --id.");
  }
  return operations;
}

function readChainValue(args: string[], flag: string): string {
  const value = args.shift();
  if (!value || value.startsWith("--")) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Missing value for ${flag}.`, { flag });
  }
  return value;
}

function readChainNumber(args: string[], flag: string): number {
  const raw = readChainValue(args, flag);
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Expected a positive integer value for ${flag}.`, { flag, value: raw });
  }
  return value;
}

function readPlanRemovalUpdates(args: string[]): PlanFieldUpdates | undefined {
  const updates: PlanFieldUpdates = {
    removeOpenQuestions: readRepeatedFlag(args, "--question"),
    removeAcceptanceCriteria: readRepeatedFlag(args, "--acceptance"),
    removeRules: readRepeatedFlag(args, "--rule"),
    removeKeyDecisions: readRepeatedFlag(args, "--key-decision"),
    removeReferencePaths: readRepeatedFlag(args, "--reference"),
  };
  return Object.values(updates).some((value) => Array.isArray(value) && value.length > 0)
    ? updates
    : undefined;
}

function readPlanMutationTarget(args: string[]): { taskName: string; planFile?: string } {
  const explicitTaskName = readOptionalFlag(args, "--task-name");
  const explicitPlanFile = readOptionalFlag(args, "--plan-file");
  if (explicitTaskName) {
    return {
      taskName: explicitTaskName,
      ...(explicitPlanFile ? { planFile: explicitPlanFile } : {}),
    };
  }

  const project = resolveWorkflowProjectContext(process.cwd(), resolveOwnerSessionKey() ?? undefined);
  const boundPlanPath = resolveSessionBoundPlan(project, resolveOwnerSessionKey() ?? undefined);
  if (!boundPlanPath) {
    throw new ClawError(
      "PROJECT_CONFIG_INVALID",
      "No plan is bound to the current session. Create or recover a plan first, or use --task-name and optional --plan-file as an advanced override.",
    );
  }

  const relativePlanPath = path.relative(project.tasksDir, boundPlanPath);
  const segments = relativePlanPath.split(path.sep).filter(Boolean);
  if (segments.length < 2 || relativePlanPath.startsWith("..") || path.isAbsolute(relativePlanPath)) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Invalid session-bound plan path: ${boundPlanPath}`);
  }
  return {
    taskName: segments[0]!,
    planFile: explicitPlanFile ?? segments.slice(1).join(path.sep),
  };
}

function readExplicitAddedTasks(args: string[]): PlanTask[] {
  return readGroupedValues(args, "--add-task", "--detail", false).map((entry) => ({
    title: entry.value,
    ...(entry.detail ? { detail: entry.detail } : {}),
    status: "pending",
  } as PlanTask));
}

function readGroupedValues(
  args: string[],
  valueFlag: string,
  detailFlag: string,
  detailRequired: boolean,
): Array<{ value: string; detail?: string }> {
  const result: Array<{ value: string; detail?: string }> = [];
  while (true) {
    const index = args.indexOf(valueFlag);
    if (index === -1) {
      return result;
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new ClawError("PROJECT_CONFIG_INVALID", `Missing value for ${valueFlag}.`);
    }
    const hasDetail = args[index + 2] === detailFlag;
    const detail = hasDetail ? args[index + 3] : undefined;
    if (hasDetail && (!detail || detail.startsWith("--"))) {
      throw new ClawError("PROJECT_CONFIG_INVALID", `Missing value for ${detailFlag}.`);
    }
    if (detailRequired && !hasDetail) {
      throw new ClawError("PROJECT_CONFIG_INVALID", `${valueFlag} must be followed immediately by ${detailFlag}.`);
    }
    args.splice(index, hasDetail ? 4 : 2);
    result.push({ value, ...(detail ? { detail } : {}) });
  }
}

function readRepeatedIntegerFlag(args: string[], flag: string): number[] {
  return readRepeatedFlag(args, flag).map((value) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      throw new ClawError("PROJECT_CONFIG_INVALID", `${flag} must be an integer.`, { flag, value });
    }
    return parsed;
  });
}

function failMissingNumericFlag(flag: string): never {
  throw new ClawError("PROJECT_CONFIG_INVALID", `Missing required flag ${flag}.`, { flag });
}

type CompletionRefreshResult = {
  taskRetention: ReturnType<typeof enforceTaskRetention>;
  asyncRefresh: {
    queued: true;
    startedAt: string;
    statusFile: string;
    operations: CompletionRefreshOperation[];
    coalesced?: boolean;
    leaderStatusFile?: string;
    dirtyHash: string;
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
  coalesced: true;
  queued: true;
  startedAt: string;
  cwd: string;
  taskName: string;
  operations: CompletionRefreshOperation[];
  dirtyHash: string;
  leaderStatusFile: string;
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
  dirtyHash?: string;
  refreshCycles?: number;
  coalescedCount?: number;
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

type CompletionRefreshFlightState = {
  schemaVersion: 1;
  queuedAt: string;
  leaderStatusFile: string;
  statusFiles: string[];
  requestedDirtyHash: string;
  operations: CompletionRefreshOperation[];
  pid?: number;
  startedAt?: string;
};

function queueCompletionRefresh(input: {
  cwd: string;
  taskName: string;
  includeTaskRetention?: boolean;
  includeTaskMemory?: boolean;
  statusLabel?: string;
  skipGitNexusRefresh?: boolean;
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
  if (project.projectConfig?.gitnexus === true && !input.skipGitNexusRefresh) {
    operations.push("gitnexus.refresh");
  }
  const dirtyHash = computeCompletionDirtyHash(input.cwd, input.taskName, operations);

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
        dirtyHash,
      },
      null,
      2,
    ),
    "utf-8",
  );
  const flight = claimCompletionRefreshFlight({
    clawDir: project.clawDir,
    statusFile,
    dirtyHash,
    operations,
    queuedAt: startedAt,
  });
  if (flight.leader) {
    launchCompletionRefreshWorker({
      cwd: input.cwd,
      taskName: input.taskName,
      statusFile,
    });
  } else {
    const coalescedStatus = {
      ok: true,
      coalesced: true,
      queued: true,
      startedAt,
      cwd: input.cwd,
      taskName: input.taskName,
      operations,
      dirtyHash,
      leaderStatusFile: flight.leaderStatusFile,
    } satisfies CompletionRefreshStatus;
    fs.writeFileSync(statusFile, `${JSON.stringify(coalescedStatus, null, 2)}\n`, "utf-8");
    const leaderStatus = tryReadCompletionRefreshStatus(flight.leaderStatusFile);
    if (leaderStatus && "finishedAt" in leaderStatus) {
      fs.writeFileSync(
        statusFile,
        `${JSON.stringify({ ...leaderStatus, coalesced: true, leaderStatusFile: flight.leaderStatusFile }, null, 2)}\n`,
        "utf-8",
      );
    }
  }

  return {
    taskRetention,
    asyncRefresh: {
      queued: true,
      startedAt,
      statusFile,
      operations,
      dirtyHash,
      ...(!flight.leader ? { coalesced: true, leaderStatusFile: flight.leaderStatusFile } : {}),
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
          ...withoutInvocationHost(),
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
      env: withoutInvocationHost(),
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
  const flightDir = getCompletionRefreshFlightDir(resolveProjectContext(cwd).clawDir);
  const initialFlight = readCompletionRefreshFlightState(flightDir);
  const operations: CompletionRefreshOperation[] = initialFlight?.operations ?? (
    "operations" in queuedStatus && Array.isArray(queuedStatus.operations)
      ? queuedStatus.operations as CompletionRefreshOperation[]
      : ["memory.reindex.project"]);
  updateCompletionRefreshFlightState(flightDir, (state) => ({
    ...state,
    pid: process.pid,
    startedAt,
  }));

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
    let projectMemory: ReturnType<typeof buildMemoryIndex> | undefined;
    let taskMemory: ReturnType<typeof buildMemoryIndex> | undefined;
    let gitnexus: GitNexusRefreshResult | undefined;
    let refreshCycles = 0;
    let dirtyHash = "";
    while (refreshCycles < 3) {
      refreshCycles += 1;
      dirtyHash = computeCompletionDirtyHash(cwd, taskName, operations);
      projectMemory = buildMemoryIndex({ cwd, scope: "project" });
      taskMemory = operations.includes("memory.reindex.task")
        ? tryBuildTaskMemoryIndex(cwd, taskName)
        : undefined;
      gitnexus = operations.includes("gitnexus.refresh")
        ? refreshGitNexusIfEnabled(cwd, resolveProjectContext(cwd).projectConfig)
        : {
            enabled: false,
            reason: resolveProjectContext(cwd).projectConfig?.gitnexus === true
              ? "gitnexus refresh was satisfied by plan-done preflight"
              : "gitnexus is not enabled in .claw/project.json",
          };
      const latestFlight = readCompletionRefreshFlightState(flightDir);
      const latestDirtyHash = computeCompletionDirtyHash(cwd, taskName, latestFlight?.operations ?? operations);
      if (latestDirtyHash === dirtyHash && latestFlight?.requestedDirtyHash === dirtyHash) {
        break;
      }
      if (latestFlight?.operations) {
        for (const operation of latestFlight.operations) {
          if (!operations.includes(operation)) {
            operations.push(operation);
          }
        }
      }
    }
    const finalFlight = readCompletionRefreshFlightState(flightDir);
    const status: CompletionRefreshStatus = {
      ok: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      cwd,
      taskName,
      memory: {
        project: projectMemory!,
        ...(taskMemory ? { task: taskMemory } : {}),
      },
      gitnexus,
      dirtyHash,
      refreshCycles,
      coalescedCount: Math.max(0, (finalFlight?.statusFiles.length ?? 1) - 1),
    };
    writeCompletionRefreshFinalStatuses(flightDir, statusFile, status);
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
    writeCompletionRefreshFinalStatuses(flightDir, statusFile, payload);
    process.exitCode = 1;
  }
}

function getCompletionRefreshFlightDir(clawDir: string): string {
  return path.join(clawDir, "logs", "completion-refresh", "inflight.lock");
}

function claimCompletionRefreshFlight(input: {
  clawDir: string;
  statusFile: string;
  dirtyHash: string;
  operations: CompletionRefreshOperation[];
  queuedAt: string;
}): { leader: boolean; leaderStatusFile: string } {
  const flightDir = getCompletionRefreshFlightDir(input.clawDir);
  try {
    fs.mkdirSync(flightDir);
    const state: CompletionRefreshFlightState = {
      schemaVersion: 1,
      queuedAt: input.queuedAt,
      leaderStatusFile: input.statusFile,
      statusFiles: [input.statusFile],
      requestedDirtyHash: input.dirtyHash,
      operations: input.operations,
    };
    writeCompletionRefreshFlightState(flightDir, state);
    return { leader: true, leaderStatusFile: input.statusFile };
  } catch (error) {
    if (!isFileAlreadyExistsError(error)) {
      throw error;
    }
  }

  const existing = readCompletionRefreshFlightState(flightDir);
  if (!existing || isCompletionRefreshFlightStale(existing)) {
    fs.rmSync(flightDir, { recursive: true, force: true });
    return claimCompletionRefreshFlight(input);
  }
  const updated = updateCompletionRefreshFlightState(flightDir, (state) => ({
    ...state,
    statusFiles: Array.from(new Set([...state.statusFiles, input.statusFile])),
    requestedDirtyHash: input.dirtyHash,
    operations: Array.from(new Set([...state.operations, ...input.operations])),
  }));
  return { leader: false, leaderStatusFile: updated.leaderStatusFile };
}

function readCompletionRefreshFlightState(flightDir: string): CompletionRefreshFlightState | null {
  const statePath = path.join(flightDir, "state.json");
  if (!fs.existsSync(statePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf-8")) as CompletionRefreshFlightState;
  } catch {
    return null;
  }
}

function tryReadCompletionRefreshStatus(statusFile: string): CompletionRefreshStatus | null {
  if (!fs.existsSync(statusFile)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(statusFile, "utf-8")) as CompletionRefreshStatus;
  } catch {
    return null;
  }
}

function writeCompletionRefreshFlightState(flightDir: string, state: CompletionRefreshFlightState): void {
  const statePath = path.join(flightDir, "state.json");
  const tempPath = `${statePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
  fs.renameSync(tempPath, statePath);
}

function updateCompletionRefreshFlightState(
  flightDir: string,
  update: (state: CompletionRefreshFlightState) => CompletionRefreshFlightState,
): CompletionRefreshFlightState {
  const lockPath = path.join(flightDir, "state.write.lock");
  let lockFd: number | undefined;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      lockFd = fs.openSync(lockPath, "wx");
      break;
    } catch (error) {
      if (!isFileAlreadyExistsError(error)) {
        throw error;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
  if (lockFd === undefined) {
    throw new ClawError("PROJECT_CONFIG_INVALID", "Timed out updating completion refresh single-flight state.");
  }
  try {
    const current = readCompletionRefreshFlightState(flightDir);
    if (!current) {
      throw new ClawError("PROJECT_CONFIG_INVALID", "Completion refresh single-flight state is missing.");
    }
    const next = update(current);
    writeCompletionRefreshFlightState(flightDir, next);
    return next;
  } finally {
    fs.closeSync(lockFd);
    fs.rmSync(lockPath, { force: true });
  }
}

function writeCompletionRefreshFinalStatuses(
  flightDir: string,
  leaderStatusFile: string,
  status: CompletionRefreshStatus,
): void {
  const flight = readCompletionRefreshFlightState(flightDir);
  const statusFiles = flight?.statusFiles ?? [leaderStatusFile];
  for (const target of statusFiles) {
    const payload = target === leaderStatusFile
      ? status
      : { ...status, coalesced: true, leaderStatusFile };
    fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  }
  fs.rmSync(flightDir, { recursive: true, force: true });
}

function isCompletionRefreshFlightStale(state: CompletionRefreshFlightState): boolean {
  if (state.pid) {
    try {
      process.kill(state.pid, 0);
      return false;
    } catch {
      return true;
    }
  }
  return Date.now() - Date.parse(state.queuedAt) > 60_000;
}

function isFileAlreadyExistsError(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "EEXIST";
}

function computeCompletionDirtyHash(
  cwd: string,
  taskName: string,
  operations: CompletionRefreshOperation[],
): string {
  const hash = createHash("sha256");
  hash.update(JSON.stringify([...operations].sort()));
  const project = resolveProjectContext(cwd);
  const roots = [
    path.join(project.clawDir, "memory.md"),
    path.join(project.clawDir, "truth"),
    path.join(project.tasksDir, taskName),
  ];
  const files = roots.flatMap((root) => listCompletionFingerprintFiles(root)).sort();
  for (const filePath of files) {
    hash.update(path.relative(cwd, filePath));
    hash.update(fs.readFileSync(filePath));
  }
  const gitStatus = runCommand("git", ["status", "--porcelain=v1", "--untracked-files=no"], cwd);
  if (!commandFailed(gitStatus)) {
    hash.update(gitStatus.stdout ?? "");
    const gitDiff = runCommand("git", ["diff", "--no-ext-diff", "--binary"], cwd);
    if (!commandFailed(gitDiff)) {
      hash.update(gitDiff.stdout ?? "");
    }
  }
  return hash.digest("hex");
}

function listCompletionFingerprintFiles(root: string): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }
  const stat = fs.statSync(root);
  if (stat.isFile()) {
    return /\.(?:md|json)$/i.test(root) ? [root] : [];
  }
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === "logs" || entry.name.endsWith(".sqlite")) {
      continue;
    }
    const child = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listCompletionFingerprintFiles(child));
    } else if (/\.(?:md|json)$/i.test(entry.name)) {
      files.push(child);
    }
  }
  return files;
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
      dirtyHash: completionRefresh.asyncRefresh.dirtyHash,
      ...(completionRefresh.asyncRefresh.coalesced
        ? {
            coalesced: true,
            leaderStatusFile: completionRefresh.asyncRefresh.leaderStatusFile,
          }
        : {}),
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

function ensureGitNexusReadyForPlanDone(cwd: string): boolean {
  const project = resolveProjectContext(cwd);
  if (project.projectConfig?.gitnexus !== true) {
    return false;
  }

  ensureGitNexusInstalled(project.projectRoot);
  seedGitNexusEmbeddingCache(project.projectRoot, project.projectConfig);
  return ensureGitNexusEmbeddingsEnabled(project.projectRoot);
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

function ensureGitNexusEmbeddingsEnabled(cwd: string): boolean {
  if (readGitNexusEmbeddingsEnabled(cwd)) {
    return false;
  }
  runGitNexusAnalyze(cwd, { embeddings: true });
  return true;
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
  const primary = runCommandWithLockRetry("gitnexus", primaryArgs, cwd);
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
  const fallback = runCommandWithLockRetry("gitnexus", fallbackArgs, cwd);
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
  const resolvedCommand = resolveCommandOnPath(command) ?? command;
  if (process.platform === "win32" && /\.(?:cmd|bat)$/i.test(resolvedCommand)) {
    return spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", resolvedCommand, ...args], {
      cwd,
      encoding: "utf-8",
      windowsHide: true,
    });
  }
  return spawnSync(resolvedCommand, args, {
    cwd,
    encoding: "utf-8",
    windowsHide: true,
  });
}

function runCommandWithLockRetry(command: string, args: string[], cwd: string) {
  let result = runCommand(command, args, cwd);
  for (const delayMs of [100, 250]) {
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    if (!commandFailed(result) || !/(?:database|index|graph)?.{0,20}(?:busy|locked)|(?:busy|locked).{0,20}(?:database|index|graph)?/i.test(output)) {
      break;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
    result = runCommand(command, args, cwd);
  }
  return result;
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

function readWorkflowScope(args: string[]): "session" | undefined {
  const value = readOptionalFlag(args, "--scope");
  if (value === undefined) {
    return undefined;
  }
  if (value === "session") {
    return "session";
  }
  throw new ClawError("PROJECT_CONFIG_INVALID", "--scope currently accepts only session; omit it for project scope.", {
    scope: value,
  });
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
    throw new ClawError(
      "PROJECT_CONFIG_INVALID",
      'Missing search query. Use: `claw search --query "<topic>"`.',
      { flag: "--query", recommendedCommand: 'claw search --query "<topic>"' },
    );
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
    "  --host <host>   Select host-specific output projection (codex or opencode).",
    "",
    "Run `claw help <command>` or `claw help <command> <subcommand>` for detailed help.",
  ];
  process.stderr.write(lines.join("\n"));
  process.stderr.write("\n");
}

function printSimpleHelp(
  label: string,
  entry: HelpEntry,
  output: NodeJS.WritableStream = process.stderr,
): void {
  const lines: string[] = [
    ...renderUsage(entry.usage),
    "",
    entry.description,
    ...renderOptions(entry.options),
  ];
  output.write(lines.join("\n"));
  output.write("\n");
}

function printGroupHelp(
  label: string,
  node: HelpNode,
  output: NodeJS.WritableStream = process.stderr,
): void {
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

  output.write(lines.join("\n"));
  output.write("\n");
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

  const successOutput = cmd === "search" ? process.stdout : process.stderr;

  if (sub === undefined) {
    if (node.subcommands) {
      printGroupHelp(cmd, node, successOutput);
    } else {
      printSimpleHelp(cmd, node, successOutput);
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
    printSimpleHelp(`${cmd} ${sub}`, subEntry, successOutput);
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
