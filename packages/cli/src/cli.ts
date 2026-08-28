#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  buildDirectWorkflowGuidance,
  appendKnowledgeTaskConclusions,
  buildKnowledgeAtomicDispatch,
  buildKnowledgeDelegateDispatch,
  KNOWLEDGE_DISPATCH_LEAD_INSTRUCTION,
  buildKnowledgeAssignmentTemplate,
  buildDirectKnowledgeAssignments,
  buildKnowledgeWriterAssignments,
  DEFAULT_MAX_TASKS_TO_KEEP,
  checkProjectProtocol,
  ClawError,
  assertRootPlanCreateAllowedForPlan,
  buildPlanWorkflowGuidance,
  buildMemoryIndex,
  buildSessionStartDefaultPrompt,
  buildSessionStartRecoveredPrompt,
  editPlan,
  ensureProjectProtocol,
  enforceTaskRetention,
  findKnowledgeFinalizationJobPath,
  findTaskDirectory,
  runDailyMaintenance,
  ingestTruth,
  initProject,
  getTemplateTaskDoneChoices,
  resolvePlanTemplateFile,
  resolvePlanEffectiveConfig,
  resolveThreadGoalPlan,
  resolveKnowledgeWriterForHost,
  resolveProjectContext,
  resolveWorkflowProjectContext,
  resolveSessionWorkflowContext,
  deleteSessionWorkflow,
  sweepExpiredSessionWorkflows,
  resolveSessionBoundPlan,
  resolveContext,
  resolveSeedPlanTemplate,
  searchMemoryAsync,
  warmProjectMemoryEmbedding,
  showPlan,
  createSubplan,
  createPlanRef,
  switchTask,
  tryCaptureKnowledgeStop,
  claimKnowledgeFinalizationJob,
  doneKnowledgeFinalizationJob,
  readKnowledgeFinalizationJob,
  reconcileKnowledgeFinalizationJob,
  waitForKnowledgeFinalizationJobReady,
  listKnowledgeFinalizationJobs,
  reconcileKnowledgeFinalizationJobs,
  normalizeTruthMarkdownEncoding,
  governKnowledgeMarkdownPaths,
  resolveKnowledgeDocUpdateSnapshot,
  resolveHostIntegrationProfile,
  recordKnowledgeFinalizationResult,
  unbindSession,
  writePlan,
  type InitProjectInput,
  type InheritedFrom,
  type LeaveState,
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
  type KnowledgeDelegateDispatch,
} from "@veewo/claw-core";
import { buildCodexDriverEnvelope } from "./codex-driver.js";
import { buildCodexHostActions } from "./codex-host-actions.js";
import { collectReport, registerReportCollector, type ReportCollectorHost } from "./report-collector-registry.js";
import { consumeBufferedHookInput } from "./knowledge-hook-preflight.js";
import { isSubagentPolicyHost, resolveInvocationHost, withoutInvocationHost, type ClawHost } from "./invocation-host.js";
import {
  ClawClient,
  ClawSessionError,
  type ClawSession,
  type ClawSessionCommand,
} from "@veewo/claw-client";

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
  { name: "plan <subcommand> [options]", summary: "Plan lifecycle: create, start, edit, remove, wait, resume, leave, sync, show, done." },
  { name: "codex driver", summary: "Return the versioned code-mode driver used by the Codex adapter." },
  { name: "template <subcommand> [options]", summary: "Plan template helpers such as validation." },
  { name: "task <subcommand> [options]", summary: "Task lifecycle helpers inside an existing plan." },
  { name: "subplan create [options]", summary: "Create a subplan nested under a parent task item." },
  { name: "switch-task --from <task> --to <task>", summary: "Switch the active task, carrying inherited context." },
  { name: "search [<query>] [options]", summary: "Recall project memory, truth, ADR, and declared docs." },
  { name: "knowledge <subcommand> [options]", summary: "Knowledge finalization lifecycle: wait, claim, done." },
  { name: "truth ingest [options]", summary: "Ingest a truth document under .claw/truth." },
  { name: "hook <event-name>", summary: "Emit host hook output (e.g. SessionStart)." },
];

function isHostlessCommand(command: string, args: string[]): boolean {
  return command === "init"
    || command === "check"
    || command === "search"
    || command === "template"
    || command === "knowledge"
    || command === "truth"
    || command === "codex"
    || command === "help"
    || command.startsWith("internal-")
    || (command === "session" && args[0] === "clean" && args.includes("--expired"));
}

function assertForegroundInvocationHost(
  command: string | undefined,
  args: string[],
  effectiveHost: ClawHost | undefined,
): void {
  if (!command || effectiveHost !== undefined || isHostlessCommand(command, args)) return;
  throw new ClawError(
    "PROJECT_CONFIG_INVALID",
    [
      `claw ${command} requires a host-scoped invocation; host is missing.`,
      "Do not add `--host` to bypass the platform adapter.",
      "Codex: run plan, task, or subplan mutations through the fixed code-mode runner loaded with `claw codex driver`; the adapter or hook owns other host lifecycle commands.",
      "DSH: use `claw_run` with its operation and args.",
      "Cindy: normally use Ghost `list_tools` then `call_tool`; only a runtime explicitly identified as GPT/Codex uses Cindy's Shell + bridge path.",
      "OpenCode: invoke the CLI from its host integration so it supplies `CLAW_HOST=opencode`; `knowledgeWriter.executionPolicy: subagent` must use `background`.",
    ].join(" "),
    { command, host: null },
  );
}

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
      { flag: "--max-tasks-to-keep <n>", detail: `Max archived tasks to retain (default ${DEFAULT_MAX_TASKS_TO_KEEP}).` },
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
    usage: [
      "{script} session open <dir> <session-id>",
      "{script} session clean",
      "{script} session clean --expired",
    ],
    description: "Open a persistent claw command session or clean legacy ephemeral session workflow state.",
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
          "Create the task scope and initial plan from a template. Outside a .claw project, explicit `--template` automatically uses session scope while plain plan creation keeps the project-initializing behavior. Template resolution uses explicit `--template` first, otherwise the project's configured `defaultPlanTemplate`, and finally the built-in `default`; planning-enabled projects start in process.discussing with one default planning task, while planning-disabled projects start directly in process.active with one executable task.",
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
          { flag: "--retrospective <text>", detail: "Set the retrospective summary; required before --status end.completed." },
          { flag: "--what-worked <text>", detail: "Append a retrospective success (repeatable)." },
          { flag: "--issue <text>", detail: "Append a retrospective issue (repeatable)." },
          { flag: "--follow-up <text>", detail: "Append a retrospective follow-up (repeatable)." },
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
      leave: {
        usage: ["{script} plan leave"],
        description: "Explicitly leave the current plan and clear its session binding so a new root plan may be created.",
        summary: "Leave the current plan without completing it.",
      },
      sync: {
        usage: ["{script} plan sync"],
        description: "Resynchronize a recovered active Codex plan with host progress and Goal Mode without mutating the plan.",
        summary: "Resync a recovered active Codex plan.",
        options: [
          { flag: "--task-name <name>", detail: "Advanced: override the session-bound task scope." },
          { flag: "--plan-file <relative-path>", detail: "Advanced: override the session-bound plan file." },
        ],
      },
      start: {
        usage: ["{script} plan start --requirements <text> --add-task <title> [--detail <text>] [options]"],
        description:
          "Atomically apply refined plan content, append outcome tasks, and execute the current template task's plan-start guidance in one serialized mutation.",
        summary: "Atomically commit the planning result.",
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
        usage: ["{script} plan show", "{script} plan show --simple"],
        description: "Show the session-bound current plan, including archived plans through an explicit override.",
        summary: "Show the current plan for a task.",
        options: [
          { flag: "--simple", detail: "Return only status, goal.text, tasks[].title, and rules." },
          { flag: "--task-name <name>", detail: "Advanced: override the session-bound task scope." },
          { flag: "--plan-file <relative-path>", detail: "Advanced: override the session-bound plan file." },
        ],
      },
      done: {
        usage: ["{script} plan done --retrospective <text> [options]"],
        description:
          "Shortcut for applying closeout fields and --status end.completed in one ordered plan edit; project scope requires a retrospective, while session scope completes without document deposition. It retains the task for at least one hour, sweeps older completed tasks into the archive, and queues the async completion refresh.",
        summary: "Shortcut for completing a plan and queueing completion refresh.",
        options: [
          { flag: "--retrospective <text>", detail: "Retrospective summary (required for project scope)." },
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
          "Mark one or more task items as done in argument order. This command records task state, not a conclusion field: transcript-backed knowledge capture derives each task conclusion from the immediately preceding assistant message. Route-aware templates may require `--choice`, and each selected choice is persisted as `task.choiceId` in the plan state.",
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
          { flag: "--parent <task-name>", detail: "(required) Parent task directory name (`taskName`), not its plan title." },
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
    usage: ["{script} search [<query>] [--dir <dir>] [--limit <n>] [--json]", "{script} search index --refresh [--json]"],
    description:
      "Project-scoped recall over .claw memory, truth, ADR, and declared markdown docs. Use a positional query or --query. Task-local scope (--task/--scope) is rejected; put task materials in plan.references instead.",
    options: [
      { flag: "--query <text>", detail: "Search query (or pass the query positionally)." },
      { flag: "--dir <dir>", detail: "Override the project directory for this search only." },
      { flag: "--limit <n>", detail: "Max number of results." },
      { flag: "--json", detail: "Compatibility flag; search output is always JSON." },
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
  knowledge: {
    usage: ["{script} knowledge <subcommand> [options]"],
    description: "Commands for queued knowledge finalization jobs and explicit same-agent knowledge capture.",
    subcommands: {
      prepare: {
        usage: ["{script} knowledge prepare --source agent-memory --project-root <path>"],
        description: "Read the current project configuration and return the immutable assignment projection for one explicit manual knowledge capture. It never initializes, repairs, or mutates the project.",
        summary: "Prepare explicit same-agent knowledge capture.",
        options: [
          { flag: "--source agent-memory", detail: "(required) Only source supported by the manual same-agent route." },
          { flag: "--project-root <path>", detail: "(required) Project root used to resolve current team and personal configuration." },
        ],
      },
      complete: {
        usage: ["{script} knowledge complete --source agent-memory --project-root <path> --config-fingerprint <hash> [--changed-truth <absolute-path> ...]"],
        description: "Validate the prepared configuration, govern declared canonical paths, normalize knowledge encoding, and queue the existing completion refresh without creating a report or job.",
        summary: "Complete explicit same-agent knowledge capture.",
        options: [
          { flag: "--source agent-memory", detail: "(required) Only source supported by the manual same-agent route." },
          { flag: "--project-root <path>", detail: "(required) Project root used to resolve current configuration." },
          { flag: "--config-fingerprint <hash>", detail: "(required) Fingerprint returned by knowledge prepare." },
          { flag: "--changed-truth <absolute-path>", detail: "Canonical Truth or ADR Markdown path changed by this capture (repeatable)." },
        ],
      },
      wait: {
        usage: ["{script} knowledge wait --project-root <path> --finalize-id <id> [--session-key <key>] [--timeout-ms <n>]"],
        description: "Wait for Stop capture to create a knowledge finalization job. This command does not create or inspect session bindings.",
        summary: "Wait until the finalization job exists.",
        options: [
          { flag: "--project-root <path>", detail: "(required) Project that owns the pending finalization." },
          { flag: "--finalize-id <id>", detail: "(required) Stable finalization id returned by plan done." },
          { flag: "--session-key <key>", detail: "Advanced: resolve a session-scoped workflow before falling back to the project." },
          { flag: "--timeout-ms <n>", detail: "Maximum wait in milliseconds (default 300000)." },
        ],
      },
      claim: {
        usage: [
          "{script} knowledge claim --job <path>",
          "{script} knowledge claim --project-root <path> --finalize-id <id>",
        ],
        description: "Claim a queued or retryable job. Codex subagent claims capture the existing task conclusions from the parent transcript before ownership is granted.",
        summary: "Claim a ready finalization job and prepare its report.",
        options: [
          { flag: "--job <path>", detail: "Exact finalization job JSON path." },
          { flag: "--project-root <path>", detail: "Project that owns a ready finalization job." },
          { flag: "--finalize-id <id>", detail: "Finalization id used with --project-root." },
        ],
      },
      done: {
        usage: [
          "{script} knowledge done --job <path> --claim-token <token> --status succeeded --result <text>",
          "{script} knowledge done --job <path> --claim-token <token> --status failed --error <text>",
        ],
        description: "Persist the terminal result for a claimed knowledge finalization job.",
        summary: "Complete a claimed finalization job.",
        options: [
          { flag: "--job <path>", detail: "(required) Finalization job JSON path." },
          { flag: "--claim-token <token>", detail: "(required) Token returned by knowledge claim." },
          { flag: "--status succeeded|failed", detail: "(required) Terminal execution status." },
          { flag: "--result <text>", detail: "Required when status is succeeded." },
          { flag: "--error <text>", detail: "Required when status is failed." },
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
      "Emit host hook output. `auto-doc` maps to Stop report capture; startup recovery is owned by each platform adapter through `claw context`.",
    options: [
      { flag: "<event-name>", detail: "(required) Hook command name (`auto-doc` or Stop)." },
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
  "internal-knowledge-dispatch": {
    usage: ["{script} internal-knowledge-dispatch --job <path>"],
    description: "Internal: returns the canonical background knowledge-writer dispatch for an adapter-owned native runner.",
    options: [{ flag: "--job <path>", detail: "(required) Finalization job JSON path." }],
  },
  "internal-embedding-warmup": {
    usage: ["{script} internal-embedding-warmup --cwd <dir>"],
    description: "Internal: warms the configured local persistent embedding session after context recovery without delaying SessionStart.",
    options: [{ flag: "--cwd <dir>", detail: "(required) Project root." }],
  },
  "internal-daily-maintenance": {
    usage: ["{script} internal-daily-maintenance --cwd <dir> [--session-key <key>] [--session-only]"],
    description: "Internal: runs the lock-protected daily cleanup asynchronously after context recovery.",
    options: [
      { flag: "--cwd <dir>", detail: "(required) Current workspace directory." },
      { flag: "--session-key <key>", detail: "Optional owner session key used for session workflow maintenance." },
      { flag: "--session-only", detail: "Only maintain the session workflow; do not touch project tasks." },
    ],
  },
  "internal-knowledge-sweep": {
    usage: ["{script} internal-knowledge-sweep --cwd <dir>"],
    description: "Internal: discovers retryable knowledge jobs and launches their detached finalizers.",
    options: [{ flag: "--cwd <dir>", detail: "(required) Project root." }],
  },
  "internal-background-maintenance": {
    usage: ["{script} internal-background-maintenance --cwd <dir> [--session-key <key>]"],
    description: "Internal: runs non-blocking cleanup, embedding warmup, and knowledge job discovery in one worker.",
    options: [
      { flag: "--cwd <dir>", detail: "(required) Current workspace directory." },
      { flag: "--session-key <key>", detail: "Optional owner session key used for session workflow maintenance." },
    ],
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
    assertForegroundInvocationHost(command, args, effectiveHost);
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
        await runSession(args, effectiveHost);
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
        await runCodex(args);
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
        await runSearch(args);
        return;
      case "knowledge":
        await runKnowledge(args);
        return;
      case "internal-report-collector-register":
        runInternalReportCollectorRegister(args);
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
      case "internal-knowledge-dispatch":
        runInternalKnowledgeDispatch(args);
        return;
      case "internal-knowledge-capture":
        await runInternalKnowledgeCapture(args, effectiveHost);
        return;
      case "internal-knowledge-complete":
        runInternalKnowledgeComplete(args);
        return;
      case "internal-knowledge-claim":
        runInternalKnowledgeClaim(args);
        return;
      case "internal-knowledge-fail":
        runInternalKnowledgeFail(args);
        return;
      case "internal-embedding-warmup":
        await runInternalEmbeddingWarmup(args);
        return;
      case "internal-daily-maintenance":
        runInternalDailyMaintenance(args);
        return;
      case "internal-knowledge-sweep":
        runInternalKnowledgeSweep(args);
        return;
      case "internal-background-maintenance":
        await runInternalBackgroundMaintenance(args);
        return;
      default:
        printTopLevelUsage();
        process.exitCode = 1;
    }
  } catch (error) {
    handleError(error);
  }
}

async function runCodex(args: string[]): Promise<void> {
  const subcommand = args.shift();
  if (subcommand === "driver") {
    assertNoRemainingArgs(args, "codex driver");
    printJson(buildCodexDriverEnvelope(CLI_VERSION));
    return;
  }
  if (subcommand === "invoke") {
    const encoded = args.shift();
    assertNoRemainingArgs(args, "codex invoke");
    if (!encoded || !/^(?:[a-f0-9]{4})+$/i.test(encoded)) {
      throw new ClawError("PROJECT_CONFIG_INVALID", "codex invoke requires one UTF-16 hex argv payload.");
    }
    let json = "";
    for (let index = 0; index < encoded.length; index += 4) {
      json += String.fromCharCode(Number.parseInt(encoded.slice(index, index + 4), 16));
    }
    const invocation = JSON.parse(json) as unknown;
    if (
      !Array.isArray(invocation)
      || invocation.length === 0
      || invocation.some((value) => typeof value !== "string")
      || (!["plan", "task", "subplan"].includes(invocation[0] as string)
        && !(invocation[0] === "context" && invocation.length === 1))
      || invocation.some((value) => value === "--host")
    ) {
      throw new ClawError(
        "PROJECT_CONFIG_INVALID",
        "codex invoke accepts only a structured context, plan, task, or subplan argv without --host.",
      );
    }
    if (invocation[0] === "context") {
      printJson({
        ok: true,
        command: "context",
        output: buildPublicContextOutput(await runContextCommand([], process.cwd(), resolveOwnerSessionKey(), "codex")),
      });
      return;
    }
    const originalArgv = process.argv;
    try {
      process.argv = [originalArgv[0]!, originalArgv[1]!, ...invocation, "--host", "codex"];
      await main();
    } finally {
      process.argv = originalArgv;
    }
    return;
  }
  throw new ClawError("PROJECT_CONFIG_INVALID", `Unknown codex subcommand "${subcommand ?? ""}".`);
}

async function runSession(args: string[], effectiveHost: ClawHost | undefined): Promise<void> {
  const subcommand = args.shift();
  if (subcommand === "open") {
    const workdir = args.shift();
    const agentSessionId = args.shift();
    assertNoRemainingArgs(args, "session open");
    if (!workdir || !agentSessionId) {
      throw new ClawError(
        "PROJECT_CONFIG_INVALID",
        "session open requires <dir> <session-id> in that order.",
      );
    }
    await runPersistentSession(workdir, agentSessionId, effectiveHost);
    return;
  }
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

async function runPersistentSession(
  workdir: string,
  agentSessionId: string,
  effectiveHost: ClawHost | undefined,
): Promise<void> {
  const opened = await new ClawClient({
    clientKind: "terminal",
    ...(effectiveHost ? { host: effectiveHost } : {}),
  }).open(agentSessionId, path.resolve(workdir));
  writeSessionOutput({
    ok: true,
    command: "session.open",
    ...(opened.openResult as Record<string, unknown>),
  });
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    prompt: "claw> ",
  });
  if (process.stdin.isTTY && process.stdout.isTTY) readline.prompt();
  try {
    for await (const line of readline) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (process.stdin.isTTY && process.stdout.isTTY) readline.prompt();
        continue;
      }
      try {
        const command = parsePersistentSessionCommand(trimmed);
        if (command.kind === "close") {
          await opened.close();
          writeSessionOutput({ ok: true, command: "session.close" });
          return;
        }
        if (command.kind === "status") {
          writeSessionOutput({ ok: true, command: "session.status", ...(await opened.status() as object) });
        } else {
          const envelope = await opened.commandEnvelope(command.request);
          writeSessionOutput({
            ok: true,
            command: command.request.operation,
            ...envelope,
          });
        }
      } catch (error) {
        writeSessionOutput({ ok: false, error: serializeSessionError(error) });
        if (error instanceof ClawSessionError && error.code === "SESSION_CONNECTION_LOST") return;
      }
      if (process.stdin.isTTY && process.stdout.isTTY) readline.prompt();
    }
  } finally {
    readline.close();
    try {
      await opened.close();
    } catch {
      // EOF is a soft close; retained state survives a lost daemon connection.
    }
  }
}

type PersistentSessionCommand =
  | { kind: "close" }
  | { kind: "status" }
  | { kind: "command"; request: ClawSessionCommand };

function parsePersistentSessionCommand(line: string): PersistentSessionCommand {
  if (line.startsWith("{")) {
    const request = JSON.parse(line) as { operation?: unknown; input?: unknown };
    if (typeof request.operation !== "string") {
      throw new ClawError("PROJECT_CONFIG_INVALID", "JSON session commands require operation.");
    }
    return {
      kind: "command",
      request: { operation: request.operation, input: request.input ?? {} } as ClawSessionCommand,
    };
  }
  const tokens = tokenizeSessionLine(line);
  const group = tokens.shift();
  const action = tokens.shift();
  if ((group === "session" && action === "close") || group === "exit" || group === "quit") {
    return { kind: "close" };
  }
  if ((group === "session" && action === "status") || group === "status") {
    return { kind: "status" };
  }
  if (group === "plan" && action === "show") {
    const simple = consumeSessionBoolean(tokens, "--simple");
    assertSessionTokensConsumed(tokens, line);
    return {
      kind: "command",
      request: { operation: "plan.show", input: { simple } },
    };
  }
  if (group === "plan" && action === "leave") {
    assertSessionTokensConsumed(tokens, line);
    return { kind: "command", request: { operation: "plan.leave", input: {} } };
  }
  if (group === "plan" && action === "resume") {
    const planId = tokens.shift();
    assertSessionTokensConsumed(tokens, line);
    return {
      kind: "command",
      request: { operation: "plan.resume", input: planId ? { planId } : {} },
    };
  }
  if (group === "plan" && action === "create") {
    const title = consumeSessionFlag(tokens, "--title") ?? tokens.shift();
    if (!title) throw new ClawError("PROJECT_CONFIG_INVALID", "plan create requires a title.");
    const goalText = consumeSessionFlag(tokens, "--goal");
    assertSessionTokensConsumed(tokens, line);
    return {
      kind: "command",
      request: {
        operation: "plan.create",
        input: { title, ...(goalText ? { goalText } : {}) },
      },
    };
  }
  if (group === "plan" && action === "wait") {
    assertSessionTokensConsumed(tokens, line);
    return { kind: "command", request: { operation: "plan.wait", input: {} } };
  }
  if (group === "plan" && action === "edit") {
    const operations = parseSessionPlanEditOperations(tokens, line);
    return {
      kind: "command",
      request: { operation: "plan.edit", input: { operations } } as ClawSessionCommand,
    };
  }
  if (group === "plan" && action === "done") {
    const retrospectiveSummary = consumeSessionFlag(tokens, "--retrospective");
    const keyDecisions = consumeAllSessionFlags(tokens, "--key-decision");
    const whatWorked = consumeAllSessionFlags(tokens, "--what-worked");
    const issues = consumeAllSessionFlags(tokens, "--issue");
    const followUps = consumeAllSessionFlags(tokens, "--follow-up");
    assertSessionTokensConsumed(tokens, line);
    return {
      kind: "command",
      request: {
        operation: "plan.done",
        input: {
          ...(retrospectiveSummary ? { retrospectiveSummary } : {}),
          ...(keyDecisions.length ? { keyDecisions } : {}),
          ...(whatWorked.length ? { whatWorked } : {}),
          ...(issues.length ? { issues } : {}),
          ...(followUps.length ? { followUps } : {}),
        },
      },
    };
  }
  if (group === "task" && action === "add") {
    const tasks: Array<{ title: string; detail?: string }> = [];
    while (tokens.length > 0) {
      if (tokens.shift() !== "--title") {
        throw new ClawError("PROJECT_CONFIG_INVALID", "task add expects --title to start each task.");
      }
      const title = tokens.shift();
      if (!title) throw new ClawError("PROJECT_CONFIG_INVALID", "task add requires a title.");
      let detail: string | undefined;
      if (tokens[0] === "--detail") {
        tokens.shift();
        detail = tokens.shift();
        if (!detail) throw new ClawError("PROJECT_CONFIG_INVALID", "task add --detail requires a value.");
      }
      tasks.push({ title, ...(detail ? { detail } : {}) });
    }
    if (!tasks.length) throw new ClawError("PROJECT_CONFIG_INVALID", "task add requires at least one task.");
    return { kind: "command", request: { operation: "task.add", input: { tasks } } };
  }
  if (group === "task" && action === "edit") {
    const id = Number(consumeSessionFlag(tokens, "--id"));
    if (!Number.isInteger(id)) throw new ClawError("PROJECT_CONFIG_INVALID", "task edit requires integer --id.");
    const taskTitle = consumeSessionFlag(tokens, "--title");
    const taskDetail = consumeSessionFlag(tokens, "--detail");
    const taskStatus = consumeSessionFlag(tokens, "--status") as
      | "pending" | "in_progress" | "subagent_running" | "done" | "blocked" | undefined;
    const taskChoiceId = consumeSessionFlag(tokens, "--choice");
    if (!taskTitle && !taskDetail && !taskStatus && !taskChoiceId) {
      throw new ClawError("PROJECT_CONFIG_INVALID", "task edit requires a field to change.");
    }
    assertSessionTokensConsumed(tokens, line);
    return {
      kind: "command",
      request: {
        operation: "task.edit",
        input: {
          taskId: id,
          ...(taskTitle ? { taskTitle } : {}),
          ...(taskDetail ? { taskDetail } : {}),
          ...(taskStatus ? { taskStatus } : {}),
          ...(taskChoiceId ? { taskChoiceId } : {}),
        },
      },
    };
  }
  if (group === "task" && action === "done") {
    const tasks: Array<{ id: number; choiceId?: string }> = [];
    while (tokens.length > 0) {
      if (tokens.shift() !== "--id") {
        throw new ClawError("PROJECT_CONFIG_INVALID", "task done expects --id to start each task.");
      }
      const id = Number(tokens.shift());
      if (!Number.isInteger(id)) throw new ClawError("PROJECT_CONFIG_INVALID", "task done requires integer ids.");
      let choiceId: string | undefined;
      if (tokens[0] === "--choice") {
        tokens.shift();
        choiceId = tokens.shift();
        if (!choiceId) throw new ClawError("PROJECT_CONFIG_INVALID", "task done --choice requires a value.");
      }
      tasks.push({ id, ...(choiceId ? { choiceId } : {}) });
    }
    if (!tasks.length) throw new ClawError("PROJECT_CONFIG_INVALID", "task done requires at least one task.");
    return { kind: "command", request: { operation: "task.done", input: { tasks } } };
  }
  if (group === "search") {
    const query = consumeSessionFlag(tokens, "--query") ?? action;
    if (!query) throw new ClawError("MEMORY_QUERY_REQUIRED", "search requires a query.");
    const dir = consumeSessionFlag(tokens, "--dir");
    const limitRaw = consumeSessionFlag(tokens, "--limit");
    assertSessionTokensConsumed(tokens, line);
    return {
      kind: "command",
      request: {
        operation: "search",
        input: {
          query,
          ...(dir ? { dir } : {}),
          ...(limitRaw ? { limit: Number(limitRaw) } : {}),
        },
      },
    };
  }
  throw new ClawError(
    "SESSION_OPERATION_UNSUPPORTED",
    `Unsupported persistent session command: ${line}`,
  );
}

function tokenizeSessionLine(line: string): string[] {
  const tokens: string[] = [];
  const pattern = /"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)'|(\S+)/g;
  for (const match of line.matchAll(pattern)) {
    tokens.push((match[1] ?? match[2] ?? match[3] ?? "").replace(/\\(["'\\])/g, "$1"));
  }
  return tokens;
}

function consumeSessionFlag(tokens: string[], flag: string): string | undefined {
  const index = tokens.indexOf(flag);
  if (index < 0) return undefined;
  const value = tokens[index + 1];
  if (!value) throw new ClawError("PROJECT_CONFIG_INVALID", `Missing value for ${flag}.`);
  tokens.splice(index, 2);
  return value;
}

function consumeAllSessionFlags(tokens: string[], flag: string): string[] {
  const values: string[] = [];
  while (tokens.includes(flag)) {
    values.push(consumeSessionFlag(tokens, flag)!);
  }
  return values;
}

function parseSessionPlanEditOperations(tokens: string[], line: string): PlanMutationOperation[] {
  const operations: PlanMutationOperation[] = [];
  const updateFlags: Record<string, keyof PlanFieldUpdates> = {
    "--goal": "goalText",
    "--requirements": "requirementsSummary",
    "--summary": "planSummary",
    "--rule": "rules",
    "--key-decision": "keyDecisions",
  };
  while (tokens.length > 0) {
    const flag = tokens.shift()!;
    const value = tokens.shift();
    if (!value) throw new ClawError("PROJECT_CONFIG_INVALID", `Missing value for ${flag}.`);
    if (flag === "--status") {
      operations.push({ type: "plan.status", status: value });
      continue;
    }
    const field = updateFlags[flag];
    if (!field) {
      throw new ClawError("PROJECT_CONFIG_INVALID", `Unknown plan edit argument in "${line}": ${flag}`);
    }
    const listField = field === "rules" || field === "keyDecisions";
    operations.push({
      type: "plan.update",
      updates: { [field]: listField ? [value] : value },
    });
  }
  if (!operations.length) throw new ClawError("PROJECT_CONFIG_INVALID", "plan edit requires a field to change.");
  return operations;
}

function consumeSessionBoolean(tokens: string[], flag: string): boolean {
  const index = tokens.indexOf(flag);
  if (index < 0) return false;
  tokens.splice(index, 1);
  return true;
}

function assertSessionTokensConsumed(tokens: string[], line: string): void {
  if (tokens.length > 0) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Unknown session command arguments in "${line}": ${tokens.join(" ")}`);
  }
}

function writeSessionOutput(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function serializeSessionError(error: unknown): Record<string, unknown> {
  if (error instanceof ClawSessionError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      outcome: error.outcome,
      ...(error.recoveryCommand ? { recoveryCommand: error.recoveryCommand } : {}),
      ...(error.details ? { details: error.details } : {}),
    };
  }
  if (error instanceof ClawError) {
    return { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) };
  }
  return { code: "SESSION_COMMAND_FAILED", message: error instanceof Error ? error.message : String(error) };
}

/** Adapter-only registration. The descriptor contains no host history schema. */
function runInternalReportCollectorRegister(args: string[]): void {
  const projectRoot = path.resolve(readRequiredFlag(args, "--project-root"));
  const host = readRequiredFlag(args, "--collector-host");
  const collectorVersion = readRequiredFlag(args, "--collector-version");
  const executable = readRequiredFlag(args, "--executable");
  const collectorArgs = readRepeatedFlag(args, "--arg");
  assertNoRemainingArgs(args, "internal-report-collector-register");
  if (resolveHostIntegrationProfile(host)?.supportsClaimTimeReportCapture !== true) {
    throw new ClawError("PROJECT_CONFIG_INVALID", "report collector host must be codex, dsh, or cindy.");
  }
  registerReportCollector(projectRoot, {
    schemaVersion: 1,
    contractVersion: 1,
    host: host as ReportCollectorHost,
    collectorVersion,
    executable,
    args: collectorArgs,
  });
  printJson({ ok: true, command: "internal-report-collector-register", host, contractVersion: 1, collectorVersion });
}

async function runKnowledge(args: string[]): Promise<void> {
  const subcommand = args.shift();
  switch (subcommand) {
    case "prepare": {
      const source = readRequiredFlag(args, "--source");
      const projectRoot = path.resolve(readRequiredFlag(args, "--project-root"));
      assertNoRemainingArgs(args, "knowledge prepare");
      assertDirectKnowledgeSource(source);
      printJson(prepareDirectKnowledgeCapture(projectRoot));
      return;
    }
    case "complete": {
      const source = readRequiredFlag(args, "--source");
      const projectRoot = path.resolve(readRequiredFlag(args, "--project-root"));
      const configFingerprint = readRequiredFlag(args, "--config-fingerprint");
      const changedTruth = readRepeatedFlag(args, "--changed-truth");
      assertNoRemainingArgs(args, "knowledge complete");
      assertDirectKnowledgeSource(source);
      printJson(completeDirectKnowledgeCapture({ projectRoot, configFingerprint, changedTruth }));
      return;
    }
    case "list": {
      const projectRoot = path.resolve(readRequiredFlag(args, "--project-root"));
      const sessionKey = readOptionalFlag(args, "--session-key");
      const host = readOptionalFlag(args, "--job-host");
      assertNoRemainingArgs(args, "knowledge list");
      const sessionProject = sessionKey ? resolveSessionWorkflowContext(sessionKey) : null;
      const project = resolveProjectContext(projectRoot);
      const candidates = sessionProject && sessionProject.clawDir !== project.clawDir
        ? [sessionProject, project]
        : [sessionProject ?? project];
      const jobs = candidates.flatMap((candidate) => listKnowledgeFinalizationJobs(candidate))
        .map((jobPath) => ({ jobPath, job: reconcileKnowledgeFinalizationJob(jobPath) }))
        .filter(({ job }) => (
          job.status === "running"
          || job.status === "queued"
        ) && (!host || job.host === host))
        .map(({ jobPath, job }) => ({
          jobPath,
          finalizeId: job.finalizeId,
          status: job.status,
          attempts: job.attempts,
        }));
      printJson({ ok: true, command: "knowledge.list", jobs });
      return;
    }
    case "wait": {
      const projectRoot = path.resolve(readRequiredFlag(args, "--project-root"));
      const finalizeId = readRequiredFlag(args, "--finalize-id");
      const sessionKey = readOptionalFlag(args, "--session-key");
      const timeoutMs = readOptionalNumber(args, "--timeout-ms") ?? 300_000;
      assertNoRemainingArgs(args, "knowledge wait");
      const sessionProject = sessionKey ? resolveSessionWorkflowContext(sessionKey) : null;
      const project = resolveProjectContext(projectRoot);
      const candidates = sessionProject && sessionProject.clawDir !== project.clawDir
        ? [sessionProject, project]
        : [sessionProject ?? project];
      let located = candidates
        .map((candidate) => findKnowledgeFinalizationJobPath(candidate, finalizeId))
        .find((candidate): candidate is string => Boolean(candidate));
      if (!located && timeoutMs > 0) {
        located = waitForKnowledgeFinalizationJobReady({
          project: candidates[0],
          finalizeId,
          timeoutMs,
        }).jobPath;
      }
      if (!located) {
        throw new Error(`Knowledge finalization ${finalizeId} is unavailable.`);
      }
      const jobPath = located;
      const job = reconcileKnowledgeFinalizationJob(jobPath);
      printJson({
        ok: true,
        command: "knowledge.wait",
        finalizeId: job.finalizeId,
        status: job.status,
        jobPath,
      });
      return;
    }
    case "claim": {
      const explicitJobPath = readOptionalFlag(args, "--job");
      const projectRoot = readOptionalFlag(args, "--project-root");
      const finalizeId = readOptionalFlag(args, "--finalize-id");
      if (explicitJobPath && (projectRoot || finalizeId)) {
        throw new ClawError("PROJECT_CONFIG_INVALID", "knowledge claim accepts either --job or --project-root with --finalize-id.");
      }
      if (!explicitJobPath && (!projectRoot || !finalizeId)) {
        throw new ClawError("PROJECT_CONFIG_INVALID", "knowledge claim requires --job or both --project-root and --finalize-id.");
      }
      assertNoRemainingArgs(args, "knowledge claim");
      const jobPath = explicitJobPath ?? findKnowledgeFinalizationJobPath(
        resolveProjectContext(path.resolve(projectRoot!)),
        finalizeId!,
      );
      if (!jobPath) {
        throw new Error(`Knowledge finalization ${finalizeId} is unavailable.`);
      }
      const queued = reconcileKnowledgeFinalizationJob(jobPath);
      const job = claimKnowledgeFinalizationJob(jobPath, {
        prepare: (queued) => {
          if (
            queued.writer?.executionPolicy !== "subagent"
            || queued.reportCapture?.mode !== "claim"
            || queued.reportCapture.status === "captured"
          ) {
            return;
          }
          if (resolveHostIntegrationProfile(queued.host)?.supportsClaimTimeReportCapture !== true) {
            throw new Error(`Claim-time report capture is unavailable for host ${queued.host ?? "unknown"}.`);
          }
          const receipt = collectReport({
            host: queued.host as ReportCollectorHost,
            sessionId: queued.sessionId,
            projectRoot: queued.projectRoot,
            planPath: queued.planPath,
            canonicalReportPath: queued.reportPath,
            startedAt: queued.reportCapture.startedAt,
          });
          return {
            reportCapture: {
              ...queued.reportCapture,
              status: "captured" as const,
              capturedAt: receipt.completedAt,
              receipt,
            },
          };
        },
      });
      const assignments = job ? buildKnowledgeWriterAssignments(job) : [];
      const templatePath = job
        ? path.join(path.dirname(jobPath), `${job.finalizeId}.assignments.json`)
        : undefined;
      if (job && templatePath) {
        fs.writeFileSync(
          templatePath,
          `${JSON.stringify(buildKnowledgeAssignmentTemplate({
            assignments,
            finalizeId: job.finalizeId,
            version: CLI_VERSION,
          }), null, 2)}\n`,
          "utf-8",
        );
      }
      printJson({
        ok: true,
        command: "knowledge.claim",
        claimed: Boolean(job),
        ...(job ? {
          finalizeId: job.finalizeId,
          jobPath,
          claimToken: job.claimToken,
          projectRoot: job.projectRoot,
          writer: job.writer ?? null,
          expiresAt: job.expiresAt,
          planPath: job.planPath,
          reportPath: job.reportPath,
          assignments,
          templatePath,
        } : {}),
      });
      return;
    }
    case "done": {
      const jobPath = readRequiredFlag(args, "--job");
      const claimToken = readRequiredFlag(args, "--claim-token");
      const status = readRequiredFlag(args, "--status");
      const result = readOptionalFlag(args, "--result");
      const error = readOptionalFlag(args, "--error");
      assertNoRemainingArgs(args, "knowledge done");
      if (status === "succeeded") {
        if (result === undefined) {
          throw new ClawError("PROJECT_CONFIG_INVALID", "knowledge done --status succeeded requires --result.");
        }
        completeKnowledgeFinalizationJob(jobPath, result, claimToken);
        return;
      }
      if (status === "failed") {
        if (!error) {
          throw new ClawError("PROJECT_CONFIG_INVALID", "knowledge done --status failed requires --error.");
        }
        failKnowledgeFinalizationJob(jobPath, error, claimToken);
        return;
      }
      throw new ClawError("PROJECT_CONFIG_INVALID", `Unsupported knowledge done status "${status}".`);
    }
    case "verify-session": {
      const sessionId = readRequiredFlag(args, "--session-id");
      assertNoRemainingArgs(args, "knowledge verify-session");
      assertCompletedKnowledgeWriterSession(sessionId);
      printJson({ ok: true, command: "knowledge.verify-session", sessionId });
      return;
    }
    default:
      throw new ClawError("PROJECT_CONFIG_INVALID", `Unknown knowledge subcommand "${subcommand ?? ""}".`);
  }
}

function prepareDirectKnowledgeCapture(projectRoot: string) {
  const project = resolveProjectContext(projectRoot);
  const ownerSessionKey = resolveOwnerSessionKey() ?? undefined;
  if (ownerSessionKey && resolveSessionBoundPlan(project, ownerSessionKey)) {
    throw new ClawError(
      "KNOWLEDGE_DIRECT_WORKFLOW_ACTIVE",
      "Manual knowledge capture cannot run while this session has an active claw workflow.",
    );
  }
  const writer = project.projectConfig?.knowledgeWriter;
  const docUpdate = resolveKnowledgeDocUpdateSnapshot(project);
  const assignments = buildDirectKnowledgeAssignments({ writer, ...(docUpdate ? { docUpdate } : {}) });
  for (const assignment of assignments) {
    for (const resourcePath of [assignment.contractPath, assignment.formatPath]) {
      if (resourcePath && (!fs.existsSync(resourcePath) || !fs.statSync(resourcePath).isFile())) {
        throw new ClawError("KNOWLEDGE_DIRECT_RESOURCE_MISSING", "A required knowledge-capture contract resource is unavailable.", { resourcePath });
      }
    }
  }
  const configFingerprint = directKnowledgeConfigFingerprint({ project, assignments, docUpdate });
  return {
    ok: true,
    command: "knowledge.prepare",
    schemaVersion: 1,
    source: "agent-memory",
    project: { projectRoot: project.projectRoot, truthDir: project.truthDir },
    configFingerprint,
    assignments,
    refresh: {
      operations: ["memory.reindex.project", ...(project.projectConfig?.gitnexus === true ? ["gitnexus.refresh"] : [])],
    },
  };
}

function completeDirectKnowledgeCapture(input: {
  projectRoot: string;
  configFingerprint: string;
  changedTruth: string[];
}) {
  const prepared = prepareDirectKnowledgeCapture(input.projectRoot);
  if (prepared.configFingerprint !== input.configFingerprint) {
    throw new ClawError(
      "KNOWLEDGE_DIRECT_CONFIG_CHANGED",
      "Knowledge-capture configuration changed after prepare; run knowledge prepare again before completion.",
      { expected: input.configFingerprint, actual: prepared.configFingerprint },
    );
  }
  const project = resolveProjectContext(input.projectRoot);
  const relativePaths = input.changedTruth.map((candidate) => relativeTruthPath(project.truthDir, candidate));
  const builtin = prepared.assignments.find((assignment) => assignment.kind === "builtin");
  const governance = builtin
    ? governKnowledgeMarkdownPaths({
      truthDir: project.truthDir,
      relativePaths,
      datedSectionsToKeep: builtin.datedSectionsToKeep ?? 6,
    })
    : { changedFiles: 0, compactedFiles: 0, removedSections: 0, files: [] };
  const truthEncoding = normalizeTruthMarkdownEncoding(project);
  const refresh = queueCompletionRefresh({
    cwd: project.projectRoot,
    taskName: "knowledge-capture",
    includeTaskRetention: false,
    statusLabel: "knowledge-capture",
  });
  return {
    ok: true,
    command: "knowledge.complete",
    source: "agent-memory",
    configFingerprint: prepared.configFingerprint,
    changedTruth: relativePaths,
    governance,
    truthEncoding,
    asyncRefresh: refresh.asyncRefresh,
  };
}

function assertDirectKnowledgeSource(source: string): asserts source is "agent-memory" {
  if (source !== "agent-memory") {
    throw new ClawError("PROJECT_CONFIG_INVALID", 'Manual knowledge capture supports only --source agent-memory.');
  }
}

function relativeTruthPath(truthDir: string, candidate: string): string {
  const root = path.resolve(truthDir);
  const target = path.resolve(candidate);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || !/\.md$/iu.test(relative)) {
    throw new ClawError("KNOWLEDGE_DIRECT_PATH_INVALID", "Changed knowledge paths must be Markdown files inside the resolved truth directory.", { candidate, truthDir: root });
  }
  return relative.replaceAll("\\", "/");
}

function directKnowledgeConfigFingerprint(input: {
  project: ProjectContext;
  assignments: ReturnType<typeof buildDirectKnowledgeAssignments>;
  docUpdate?: { externalDocPaths: string[] };
}): string {
  const payload = {
    schemaVersion: 1,
    truthDir: path.resolve(input.project.truthDir),
    assignments: input.assignments.map((assignment) => ({
      kind: assignment.kind,
      skill: assignment.skill ?? null,
      datedSectionsToKeep: assignment.datedSectionsToKeep ?? null,
    })),
    externalDocPaths: input.docUpdate?.externalDocPaths ?? [],
    gitnexus: input.project.projectConfig?.gitnexus === true,
    memoryRefresh: input.project.projectConfig?.memory?.enabled !== false,
  };
  return `sha256:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
}

function throwUnsupportedSubagentExecutionHost(effectiveHost: ClawHost | undefined): never {
  throw new ClawError(
    "PROJECT_CONFIG_INVALID",
    'knowledgeWriter.executionPolicy "subagent" is supported only by the Codex, Cindy, or DSH host.',
    { host: effectiveHost ?? null },
  );
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
      const ownerSessionKey = resolveOwnerSessionKey();
      assertDirectRootPlanCreateAllowed(process.cwd(), ownerSessionKey, scope);
      await preparePlanCreateWorkflow(process.cwd(), ownerSessionKey, effectiveHost, scope);
      const result = await writePlan({
        cwd: process.cwd(),
        scope,
        templateName,
        templateFile: explicitTemplateFile ? path.resolve(process.cwd(), explicitTemplateFile) : undefined,
        title,
        goalText: readOptionalFlag(args, "--goal"),
        ownerSessionKey: ownerSessionKey ?? undefined,
        host: effectiveHost,
      });
      if (ownerSessionKey && scope !== "session") {
        const sessionProject = resolveSessionWorkflowContext(ownerSessionKey);
        if (sessionProject) {
          const relativePlanPath = path.relative(sessionProject.clawDir, result.planPath);
          if (relativePlanPath.startsWith("..") || path.isAbsolute(relativePlanPath)) {
            unbindSession(sessionProject, ownerSessionKey);
          }
        }
      }
      assertNoRemainingArgs(args, "plan create");
      printJson(compactPlanCommandResult("plan.create", result, effectiveHost));
      return;
    case "edit": {
      const target = readPlanMutationTarget(args);
      const operations = readOrderedPlanEditOperations(args);
      if (operations.length === 0) {
        throw new ClawError("PROJECT_CONFIG_INVALID", "plan edit requires at least one plan field or --status.");
      }
      const ownerSessionKey = resolveOwnerSessionKey() ?? undefined;
      const entersEndTerminal = requestsPlanEndTerminal(operations);
      const current = entersEndTerminal
        ? showPlan({ cwd: process.cwd(), ...target, ownerSessionKey })
        : undefined;
      const project = entersEndTerminal ? tryResolveHookProject(process.cwd()) : null;
      const effectiveWriter = resolveKnowledgeWriterForHost(
        current && project
          ? resolvePlanEffectiveConfig(project.projectConfig, current.plan)?.knowledgeWriter
          : undefined,
        effectiveHost,
      );
      if (
        current
        && !current.plan.parentPlan
        && effectiveWriter?.executionPolicy === "subagent"
        && !isSubagentPolicyHost(effectiveHost)
      ) {
        throwUnsupportedSubagentExecutionHost(effectiveHost);
      }
      const terminalRefresh = entersEndTerminal
        ? preparePlanTerminalRefresh(process.cwd(), ownerSessionKey)
        : undefined;
      const result = await editPlan({
        cwd: process.cwd(),
        ...target,
        operations,
        commandSource: "plan.edit",
        host: effectiveHost,
        ownerSessionKey,
      });
      const knowledgeDispatch = (
        current
        && project
        && (isSubagentPolicyHost(effectiveHost))
        && !current.plan.parentPlan
        && effectiveWriter?.executionPolicy === "subagent"
        && result.knowledgeFinalizeId
      )
          ? buildKnowledgeDispatch({
            // The isSubagentPolicyHost gate above guarantees this is codex | cindy | dsh.
            host: effectiveHost as "codex" | "cindy" | "dsh",
            finalizeId: result.knowledgeFinalizeId,
            writer: effectiveWriter,
          })
        : undefined;
      const completionRefresh = queueTerminalRefreshIfEntered(result, terminalRefresh);
      printJson(compactPlanCommandResult("plan.edit", result, effectiveHost, completionRefresh, false, knowledgeDispatch));
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
    case "leave":
      await runPlanLeave(args, effectiveHost);
      return;
    case "sync":
      await runPlanSync(args, effectiveHost);
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
        applyPlanStartGuidance: true,
        commandSource: "plan.start",
        host: effectiveHost,
        ownerSessionKey: resolveOwnerSessionKey() ?? undefined,
      });
      printJson(compactPlanCommandResult("plan.start", result, effectiveHost));
      return;
    }
    case "done": {
      const retrospective = readOptionalFlag(args, "--retrospective");
      const updates: PlanFieldUpdates = {
        ...(retrospective?.trim() ? { retrospectiveSummary: retrospective } : {}),
        keyDecisions: readRepeatedFlag(args, "--key-decision"),
        whatWorked: readRepeatedFlag(args, "--what-worked"),
        issues: readRepeatedFlag(args, "--issue"),
        followUps: readRepeatedFlag(args, "--follow-up"),
      };
      const target = readPlanMutationTarget(args);
      assertNoRemainingArgs(args, "plan done");
      const ownerSessionKey = resolveOwnerSessionKey() ?? undefined;
      const current = showPlan({
        cwd: process.cwd(),
        ...target,
        ownerSessionKey,
      });
      const currentProject = resolveWorkflowProjectContext(process.cwd(), ownerSessionKey);
      if (currentProject.scope !== "session" && !retrospective?.trim()) {
        throw new ClawError("RETROSPECTIVE_REQUIRED", "plan done requires --retrospective for project-scoped plans.");
      }
      const project = tryResolveHookProject(process.cwd());
      const effectiveWriter = resolveKnowledgeWriterForHost(
        project
          ? resolvePlanEffectiveConfig(project.projectConfig, current.plan)?.knowledgeWriter
          : undefined,
        effectiveHost,
      );
      if (
        !current.plan.parentPlan
        && effectiveWriter?.executionPolicy === "subagent"
        && !isSubagentPolicyHost(effectiveHost)
      ) {
        throwUnsupportedSubagentExecutionHost(effectiveHost);
      }
      const terminalRefresh = preparePlanTerminalRefresh(process.cwd(), ownerSessionKey);
      const result = await editPlan({
        cwd: process.cwd(),
        ...target,
        operations: planCompletionOperations(updates),
        commandSource: "plan.done",
        host: effectiveHost,
        ownerSessionKey,
      });
      const knowledgeDispatch = (
        isSubagentPolicyHost(effectiveHost)
        && !current.plan.parentPlan
        && effectiveWriter?.executionPolicy === "subagent"
        && result.knowledgeFinalizeId
      )
          ? buildKnowledgeDispatch({
            // The isSubagentPolicyHost gate above guarantees this is codex | cindy | dsh.
            host: effectiveHost as "codex" | "cindy" | "dsh",
            finalizeId: result.knowledgeFinalizeId,
            writer: effectiveWriter,
          })
        : undefined;
      const completionRefresh = queueTerminalRefreshIfEntered(result, terminalRefresh);
      printJson(compactPlanCommandResult(
        "plan.done",
        result,
        effectiveHost,
        completionRefresh,
        false,
        knowledgeDispatch,
      ));
      return;
    }
    case "show": {
      const simple = readBooleanFlag(args, "--simple");
      const target = readPlanMutationTarget(args);
      assertNoRemainingArgs(args, "plan show");
      const result = showPlan({
        cwd: process.cwd(),
        ...target,
        ownerSessionKey: resolveOwnerSessionKey() ?? undefined,
      });
      if (simple) {
        printJson(result.simplePlanView);
        return;
      }
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
  printJson(compactPlanCommandResult(command, result, effectiveHost, undefined, true));
}

async function runPlanLeave(args: string[], effectiveHost: ClawHost | undefined): Promise<void> {
  const ownerSessionKey = resolveOwnerSessionKey() ?? undefined;
  const target = readPlanMutationTarget(args);
  assertNoRemainingArgs(args, "plan leave");
  const terminalRefresh = preparePlanTerminalRefresh(process.cwd(), ownerSessionKey);
  const result = await editPlan({
    cwd: process.cwd(),
    ...target,
    planStatus: "end.leave",
    commandSource: "plan.edit",
    host: effectiveHost,
    ownerSessionKey,
  });
  const completionRefresh = queueTerminalRefreshIfEntered(result, terminalRefresh);
  printJson(compactPlanCommandResult("plan.leave", result, effectiveHost, completionRefresh, true));
}

async function runPlanSync(args: string[], effectiveHost: ClawHost | undefined): Promise<void> {
  const ownerSessionKey = resolveOwnerSessionKey() ?? undefined;
  const result = showPlan({ cwd: process.cwd(), ...readPlanMutationTarget(args), ownerSessionKey });
  assertNoRemainingArgs(args, "plan sync");
  if (result.plan.status !== "process.active") {
    printJson({ ok: true, command: "plan.sync", planPath: result.planPath, planStatus: result.plan.status });
    return;
  }
  const project = resolveWorkflowProjectContext(process.cwd(), ownerSessionKey);
  const goalPlan = resolveThreadGoalPlan({
    cwd: process.cwd(),
    taskName: result.taskName,
    focusedPlan: result.plan,
    ownerSessionKey,
  });
  const workflowGuidance = await buildPlanWorkflowGuidance({
    taskName: result.taskName,
    planFile: result.planFile,
    plan: result.plan,
    projectRoot: project.projectRoot,
    projectConfig: project.projectConfig,
    goalPlan,
    goalProjectConfig: resolvePlanEffectiveConfig(project.projectConfig, goalPlan),
    scope: project.scope,
    previousStatus: "process.wait",
    host: effectiveHost,
    recoveryResync: true,
  });
  printJson(compactPlanCommandResult(
    "plan.sync",
    { ...result, planStatus: result.plan.status, workflowGuidance },
    effectiveHost,
    undefined,
    true,
  ));
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
        version: template.version,
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
        commandSource: "task.add",
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
        commandSource: "task.edit",
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
        commandSource: "task.remove",
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
        commandSource: "task.done",
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

async function runSearch(args: string[]): Promise<void> {
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
  const dir = readOptionalFlag(args, "--dir");
  printJson({
    ok: true,
    command: "search",
    ...await searchMemoryAsync({
      cwd: dir ? path.resolve(process.cwd(), dir) : process.cwd(),
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
  const sessionPlanPath = sessionProject && ownerSessionKey
    ? resolveSessionBoundPlan(sessionProject, ownerSessionKey)
    : null;
  if (sessionProject && sessionPlanPath) {
    const maintenance = effectiveHost
      ? null
      : runDailyMaintenance(sessionProject, {
        excludeSessionKey: ownerSessionKey ?? undefined,
        includeProject: false,
      });
    if (effectiveHost) {
      launchDailyMaintenance(cwd, ownerSessionKey, true);
    }
    const activeWorkflow = !taskName && ownerSessionKey
      ? await tryResolveActiveWorkflowSnapshot(cwd, ownerSessionKey, effectiveHost)
      : null;
    return {
      project: sessionProject,
      ...(activeWorkflow ? { activeWorkflow } : {}),
      ...(maintenance?.ran ? { maintenance } : {}),
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

  const project = resolveProjectContext(cwd);
  const maintenance = effectiveHost
    ? null
    : runDailyMaintenance(project, { excludeSessionKey: ownerSessionKey ?? undefined });
  if (effectiveHost) {
    launchDailyMaintenance(cwd, ownerSessionKey, false);
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

  launchProjectEmbeddingWarmup(resolved.project);

  return {
    ...resolved,
    ...(maintenance?.ran ? { maintenance } : {}),
    ...(activeWorkflow ? { activeWorkflow } : {}),
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

function launchProjectEmbeddingWarmup(project: ProjectContext): void {
  const memory = project.projectConfig?.memory;
  if (
    process.env.CLAW_EMBEDDING_WARMUP_DISABLE_LAUNCH === "1"
    || process.env.CLAW_KNOWLEDGE_FINALIZER === "1"
    || memory?.enabled === false
    || memory?.embedding?.provider !== "local"
    || process.env.CLAW_EMBEDDING_PERSISTENT_WORKER === "0"
    || !fs.existsSync(path.join(project.clawDir, "memory.sqlite"))
  ) {
    return;
  }
  try {
    const child = spawn(
      process.execPath,
      [resolveCliEntryPath(), "internal-embedding-warmup", "--cwd", project.projectRoot],
      {
        cwd: project.projectRoot,
        detached: true,
        stdio: "ignore",
        windowsHide: true,
        env: withoutInvocationHost(),
      },
    );
    child.unref();
  } catch {
    // Context recovery is authoritative; embedding warmup is fail-open latency work.
  }
}

function launchDailyMaintenance(cwd: string, ownerSessionKey: string | null, sessionOnly: boolean): void {
  const args = [resolveCliEntryPath(), "internal-daily-maintenance", "--cwd", cwd];
  if (ownerSessionKey) {
    args.push("--session-key", ownerSessionKey);
  }
  if (sessionOnly) {
    args.push("--session-only");
  }
  try {
    const child = spawn(process.execPath, args, {
      cwd,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: withoutInvocationHost(),
    });
    child.unref();
  } catch {
    // Context recovery is authoritative; daily cleanup is fail-open latency work.
  }
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

  const searchGuidance = buildContextSearchGuidance(context, "rg");
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

function buildContextSearchGuidance(context: Record<string, unknown>, style: "default" | "rg" = "default"): string | null {
  const project = asJsonRecord(context.project);
  const projectConfig = asJsonRecord(project?.projectConfig);
  const memory = asJsonRecord(projectConfig?.memory);
  const embeddingEnabled = memory?.enabled === true && asJsonRecord(memory.embedding) !== null;
  const gitnexusEnabled = projectConfig?.gitnexus === true;

  if (embeddingEnabled && gitnexusEnabled) {
    return style === "rg"
      ? "Before using `rg`, use `claw search --query` to narrow the document search scope and GitNexus to narrow the code search scope, then use `rg` to locate exact files or symbols."
      : "When useful, use `claw search` to narrow the document search scope and GitNexus to narrow the code search scope, then use the default search to locate exact files or symbols.";
  }
  if (embeddingEnabled) {
    return style === "rg"
      ? "Before using `rg`, use `claw search --query` to narrow the document search scope, then use `rg` to locate exact files or symbols."
      : "When useful, use `claw search` to narrow the document search scope, then use the default search to locate exact files or symbols.";
  }
  if (gitnexusEnabled) {
    return style === "rg"
      ? "Before using `rg`, use GitNexus to narrow the code search scope, then use `rg` to locate exact files or symbols."
      : "When useful, use GitNexus to narrow the code search scope, then use the default search to locate exact files or symbols.";
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
      const target = readRequiredFlag(args, "--target");
      const append = readBooleanFlag(args, "--append");
      assertNoRemainingArgs(args, "truth ingest");
      printJson(
        ingestTruth({
          cwd: process.cwd(),
          target,
          content,
          append,
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
  // Cindy owns task-completion closeout in its Host worker path. The CLI sidecar
  // must not enqueue a job that it cannot execute with a Cindy session runner.
  if (effectiveHost === "cindy") {
    return;
  }
  if (process.env.CLAW_KNOWLEDGE_FINALIZER === "1") {
    return;
  }
  const payload = await readStdinJson();
  const hookCwd = resolveHookCwd(payload);
  const sessionId = resolveOwnerSessionKey(payload);
  const turnId = readHookString(payload, "turn_id");
  const payloadMessage = readHookString(payload, "message");
  if (!hookCwd || !sessionId || !turnId || !containsClawDir(hookCwd)) {
    return;
  }
  try {
    const project = resolveProjectContext(hookCwd);
    // Host adapters own history parsing and pass their current final inline.
    const message = payloadMessage;
    if (!message) {
      return;
    }
    const result = tryCaptureKnowledgeStop({
      project,
      sessionId,
      turnId,
      message,
      host: effectiveHost,
      taskConclusions: [],
    });
    // Current named hosts own their runner in their adapters.  Keep the CLI
    // launcher only for jobs written by pre-adapter releases with no host.
    if (result.ok && result.jobPath && !effectiveHost && process.env.CLAW_KNOWLEDGE_FINALIZER_DISABLE_LAUNCH !== "1") {
      launchKnowledgeFinalizationWorker(result.jobPath, project.projectRoot);
    }
    if (process.env.CLAW_KNOWLEDGE_CAPTURE_RESULT === "1") {
      printJson(result);
    }
  } catch {
    // Knowledge capture is a fail-open sidecar and must never block Stop.
  }
}

/**
 * Machine-facing report capture for hosts whose final-message hook is owned by
 * the adapter rather than by the CLI.  Unlike `hook auto-doc`, this only
 * persists the report/job hand-off; it never chooses or launches a writer.
 */
async function runInternalKnowledgeCapture(args: string[], effectiveHost: ClawHost | undefined): Promise<void> {
  assertNoRemainingArgs(args, "internal-knowledge-capture");
  const payload = await readStdinJson();
  const hookCwd = resolveHookCwd(payload);
  const sessionId = resolveOwnerSessionKey(payload);
  const turnId = readHookString(payload, "turn_id");
  const message = readHookString(payload, "message");
  const taskConclusions = readHookTaskConclusions(payload, turnId);
  if (!hookCwd || !sessionId || !turnId || !message) {
    printJson({ ok: true, captured: false });
    return;
  }
  try {
    const project = resolveWorkflowProjectContext(hookCwd, sessionId);
    const result = tryCaptureKnowledgeStop({
      project,
      sessionId,
      turnId,
      message,
      host: effectiveHost === "cindy" ? "cindy" : effectiveHost,
      taskConclusions,
    });
    printJson(result);
  } catch (error) {
    // Capture is a non-blocking sidecar.  Return structured failure so the
    // owning adapter can surface/retry it without affecting the assistant turn.
    printJson({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

/** Record a successful adapter-owned writer run without invoking a host SDK. */
function runInternalKnowledgeComplete(args: string[]): void {
  const jobPath = readRequiredFlag(args, "--job");
  const result = readRequiredFlag(args, "--result");
  assertNoRemainingArgs(args, "internal-knowledge-complete");
  const running = ensureLegacyKnowledgeClaim(jobPath);
  if (!running?.claimToken) {
    printJson({ ok: true, completed: false, reason: "job is not claimable" });
    return;
  }
  completeKnowledgeFinalizationJob(jobPath, result, running.claimToken);
}

function runInternalKnowledgeClaim(args: string[]): void {
  const jobPath = readRequiredFlag(args, "--job");
  assertNoRemainingArgs(args, "internal-knowledge-claim");
  const job = ensureLegacyKnowledgeClaim(jobPath);
  printJson({
    ok: true,
    claimed: Boolean(job),
    ...(job ? {
      finalizeId: job.finalizeId,
      claimToken: job.claimToken,
    } : {}),
  });
}

function runInternalKnowledgeFail(args: string[]): void {
  const jobPath = readRequiredFlag(args, "--job");
  const message = readRequiredFlag(args, "--message");
  assertNoRemainingArgs(args, "internal-knowledge-fail");
  const job = ensureLegacyKnowledgeClaim(jobPath);
  if (!job?.claimToken) {
    printJson({ ok: true, failed: false, reason: "job is not claimable" });
    return;
  }
  failKnowledgeFinalizationJob(jobPath, message, job.claimToken);
}

function ensureLegacyKnowledgeClaim(jobPath: string): KnowledgeFinalizationJob | null {
  const job = reconcileKnowledgeFinalizationJob(jobPath);
  if (job.status === "succeeded" || job.status === "failed" || job.status === "expired") {
    return null;
  }
  if (job.status === "running") {
    return job;
  }
  return claimKnowledgeFinalizationJob(jobPath);
}

function completeKnowledgeFinalizationJob(
  jobPath: string,
  result: string,
  claimToken: string,
): void {
  const running = reconcileKnowledgeFinalizationJob(jobPath);
  if (running.status === "succeeded") {
    const terminal = doneKnowledgeFinalizationJob({
      jobPath,
      claimToken,
      status: "succeeded",
      result,
    });
    removeKnowledgeAssignmentTemplate(jobPath, running.finalizeId);
    printJson({ ok: true, completed: true, alreadyDone: terminal.alreadyDone, finalizeId: running.finalizeId });
    return;
  }
  if (running.status !== "running") {
    throw new Error("Knowledge finalization job must be claimed before successful completion.");
  }
  if (running.claimToken !== claimToken) {
    throw new Error("Knowledge finalization completion does not match the active claim.");
  }
  const project = resolveKnowledgeJobProject(jobPath, running);
  const finishedAt = new Date().toISOString();
  const truthEncoding = normalizeTruthMarkdownEncoding(project);
  recordKnowledgeFinalizationResult(project, running.reportPath, {
    schemaVersion: 1,
    entryType: "knowledge_finalization",
    finalizeId: running.finalizeId,
    taskName: running.taskName,
    recordedAt: finishedAt,
    status: "succeeded",
    result,
    attempts: running.attempts,
    ...(running.host !== undefined ? { host: running.host } : {}),
    truthEncoding,
  });
  const terminal = doneKnowledgeFinalizationJob({
    jobPath,
    claimToken,
    status: "succeeded",
    result,
    finishedAt,
    patch: { truthEncoding },
  });
  removeKnowledgeAssignmentTemplate(jobPath, running.finalizeId);
  queueCompletionRefresh({
    cwd: running.projectRoot,
    taskName: running.taskName,
    includeTaskRetention: false,
    includeGitNexus: false,
    statusLabel: `knowledge-${running.finalizeId.slice(0, 12)}`,
  });
  printJson({ ok: true, completed: true, alreadyDone: terminal.alreadyDone, finalizeId: running.finalizeId });
}

async function preparePlanCreateWorkflow(
  cwd: string,
  ownerSessionKey: string | null,
  effectiveHost: ClawHost | undefined,
  requestedScope: "session" | undefined,
): Promise<void> {
  if (requestedScope === "session" || resolveSessionWorkflowContext(ownerSessionKey ?? undefined)) {
    return;
  }
  const project = tryResolveHookProject(cwd);
  if (!project) {
    return;
  }
  await prepareProjectWorkflow(cwd, ownerSessionKey, effectiveHost, project);
}

function assertDirectRootPlanCreateAllowed(
  cwd: string,
  ownerSessionKey: string | null,
  requestedScope: "session" | undefined,
): void {
  if (!ownerSessionKey) return;
  const project = requestedScope === "session"
    ? resolveSessionWorkflowContext(ownerSessionKey)
    : tryResolveHookProject(cwd);
  if (!project) return;
  const planPath = resolveSessionBoundPlan(project, ownerSessionKey);
  if (!planPath) return;
  const target = parseTaskPlanPath(project, planPath);
  if (!target) {
    throw new ClawError("PLAN_TRANSITION_CONFLICT", `Invalid session-bound plan path: ${planPath}`);
  }
  const current = showPlan({
    cwd,
    taskName: target.taskName,
    planFile: target.planFile,
    ownerSessionKey,
  });
  if (current.plan.status.startsWith("end.")) {
    unbindSession(project, ownerSessionKey);
    return;
  }
  assertRootPlanCreateAllowedForPlan(
    createPlanRef(project, current.taskName, current.planFile),
    current.plan,
  );
}

async function prepareProjectWorkflow(
  cwd: string,
  ownerSessionKey: string | null,
  effectiveHost: ClawHost | undefined,
  project = tryResolveHookProject(cwd),
): Promise<Record<string, unknown> | null> {
  const sessionProject = resolveSessionWorkflowContext(ownerSessionKey ?? undefined);
  if (sessionProject) {
    return runContextCommand([], cwd, ownerSessionKey, effectiveHost);
  }
  if (!project) {
    return null;
  }
  return runContextCommand([], cwd, ownerSessionKey, effectiveHost);
}

function resolveKnowledgeJobProject(
  jobPath: string,
  job: KnowledgeFinalizationJob,
): ProjectContext {
  const project = resolveProjectContext(job.projectRoot);
  const sessionProject = resolveSessionWorkflowContext(job.sessionId);
  for (const candidate of sessionProject ? [sessionProject, project] : [project]) {
    const relative = path.relative(candidate.clawDir, path.resolve(jobPath));
    if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
      return candidate;
    }
  }
  throw new Error("Knowledge finalization job is outside its project or session workflow.");
}

function failKnowledgeFinalizationJob(
  jobPath: string,
  message: string,
  claimToken: string,
): void {
  const terminal = doneKnowledgeFinalizationJob({
    jobPath,
    claimToken,
    status: "failed",
    error: message,
  });
  removeKnowledgeAssignmentTemplate(jobPath, terminal.job.finalizeId);
  printJson({ ok: true, failed: true, alreadyDone: terminal.alreadyDone, finalizeId: terminal.job.finalizeId });
}

function removeKnowledgeAssignmentTemplate(jobPath: string, finalizeId: string): void {
  fs.rmSync(path.join(path.dirname(jobPath), `${finalizeId}.assignments.json`), { force: true });
}

async function runInternalEmbeddingWarmup(args: string[]): Promise<void> {
  const cwd = readRequiredFlag(args, "--cwd");
  assertNoRemainingArgs(args, "internal-embedding-warmup");
  printJson({
    command: "internal-embedding-warmup",
    ok: true,
    ...await warmProjectMemoryEmbedding({ cwd }),
  });
}

function runInternalDailyMaintenance(args: string[]): void {
  const cwd = readRequiredFlag(args, "--cwd");
  const sessionKey = readOptionalFlag(args, "--session-key");
  const sessionOnly = readBooleanFlag(args, "--session-only");
  assertNoRemainingArgs(args, "internal-daily-maintenance");

  const project = sessionOnly
    ? (sessionKey ? resolveSessionWorkflowContext(sessionKey) : null)
    : resolveProjectContext(cwd);
  if (!project) {
    printJson({ command: "internal-daily-maintenance", ok: true, ran: false, skipped: true });
    return;
  }

  printJson({
    command: "internal-daily-maintenance",
    ok: true,
    ...runDailyMaintenance(project, {
      excludeSessionKey: sessionKey ?? undefined,
      includeProject: !sessionOnly,
    }),
  });
}

function runInternalKnowledgeSweep(args: string[]): void {
  const cwd = readRequiredFlag(args, "--cwd");
  assertNoRemainingArgs(args, "internal-knowledge-sweep");
  const project = tryResolveHookProject(cwd);
  if (!project) {
    printJson({ command: "internal-knowledge-sweep", ok: true, reconciled: { checked: 0, failed: 0 }, skipped: true });
    return;
  }
  printJson({
    command: "internal-knowledge-sweep",
    ok: true,
    reconciled: reconcileKnowledgeFinalizationJobs(project),
    launched: 0,
  });
}

async function runInternalBackgroundMaintenance(args: string[]): Promise<void> {
  const cwd = readRequiredFlag(args, "--cwd");
  const sessionKey = readOptionalFlag(args, "--session-key");
  assertNoRemainingArgs(args, "internal-background-maintenance");

  const sessionProject = sessionKey ? resolveSessionWorkflowContext(sessionKey) : null;
  const project = sessionProject ? null : tryResolveHookProject(cwd);
  let maintenance: Record<string, unknown> = { ran: false, skipped: true };
  if (sessionProject) {
    maintenance = runDailyMaintenance(sessionProject, { excludeSessionKey: sessionKey ?? undefined, includeProject: false });
  } else if (project) {
    maintenance = runDailyMaintenance(project, { excludeSessionKey: sessionKey ?? undefined });
  }

  let embedding: Record<string, unknown> = { warmed: false, reason: "skipped" };
  try {
    embedding = await warmProjectMemoryEmbedding({ cwd });
  } catch (error) {
    embedding = { warmed: false, reason: "failed", error: error instanceof Error ? error.message : String(error) };
  }

  let knowledgeReconciliation = { checked: 0, failed: 0 };
  const knowledgeProject = project ?? sessionProject;
  if (knowledgeProject) {
    knowledgeReconciliation = reconcileKnowledgeFinalizationJobs(knowledgeProject);
  }

  printJson({ command: "internal-background-maintenance", ok: true, maintenance, embedding, knowledgeReconciliation });
}

function runInternalKnowledgeDispatch(args: string[]): void {
  const jobPath = readRequiredFlag(args, "--job");
  const queued = reconcileKnowledgeFinalizationJob(jobPath);
  assertNoRemainingArgs(args, "internal-knowledge-dispatch");
  if ((queued.writer?.executionPolicy ?? "background") !== "background") {
    throw new ClawError("PROJECT_CONFIG_INVALID", "Knowledge dispatch requires a background writer job.");
  }
  const dispatch = buildKnowledgeDelegateDispatch({
    policy: "background",
    finalizeId: queued.finalizeId,
    writer: queued.writer,
  });
  printJson({
    ok: true,
    command: "internal-knowledge-dispatch",
    jobPath,
    finalizeId: queued.finalizeId,
    projectRoot: queued.projectRoot,
    writer: queued.writer ?? null,
    dispatch,
  });
}

type KnowledgeWriterRunResult = {
  finalResponse: string;
  threadId?: string;
};

async function runKnowledgeDelegateForJob(running: KnowledgeFinalizationJob): Promise<KnowledgeWriterRunResult> {
  void running;
  throw new Error("Platform knowledge writers must be launched by their adapter after requesting internal-knowledge-dispatch.");
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
      return plan.status === "end.completed"
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
  delete env.CLAW_SESSION_ID;
  delete env.CODEX_THREAD_ID;
  delete env.CODEX_SESSION_ID;
  return env;
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

function readHookTaskConclusions(payload: unknown, turnId: string | null): { turnId: string; message: string }[] {
  if (!turnId || !payload || typeof payload !== "object") return [];
  const value = (payload as Record<string, unknown>).task_conclusions;
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const message = (item as Record<string, unknown>).message;
    return typeof message === "string" && message.trim()
      ? [{ turnId, message: message.trim() }]
      : [];
  });
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

function buildSessionStartAdditionalContext(
  context: Record<string, unknown>,
  sessionCwd: string,
  effectiveHost: ClawHost | undefined,
): string | null {
  const versionSyncPrompt = buildVersionSyncPrompt(context);
  if (effectiveHost === "cindy") {
    return buildCindySessionStartContext(context, sessionCwd, versionSyncPrompt);
  }
  const searchGuidance = buildContextSearchGuidance(context);
  const runtimeErrorPrompt = buildCodexRuntimeErrorPrompt(context);
  const activeWorkflow = context.activeWorkflow as JsonRecord | undefined;
  if (activeWorkflow) {
    const prompt = buildRecoveredWorkflowAdditionalContext(activeWorkflow, versionSyncPrompt);
    const recoverySyncPrompt = resolveHostIntegrationProfile(effectiveHost)?.providesActiveWorkflowRecovery === true && activeWorkflow.planStatus === "process.active"
      ? "Before continuing, run `claw plan sync` once through the fixed Codex driver to restore focused-plan progress and reconcile the root-plan Goal."
      : "";
    const promptWithSync = recoverySyncPrompt ? `${prompt}\n${recoverySyncPrompt}` : prompt;
    const promptWithSearch = searchGuidance ? `${promptWithSync}\n${searchGuidance}` : promptWithSync;
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

/**
 * Cindy Agents use the Ghost Tool gateway, not shell commands or Host actions.
 * Match the Codex session-start wording and structure. Cindy's static entry
 * prompt supplies the shared skill and guidance lines; this dynamic context
 * supplies project identity or a recovered workflow snapshot. Goal Mode is
 * intentionally omitted because Cindy does not expose that Host surface.
 */
function buildCindySessionStartContext(
  context: Record<string, unknown>,
  _sessionCwd: string,
  versionSyncPrompt: { placement: "prefix" | "suffix"; lines: string[] } | null,
): string | null {
  const lines: string[] = [];
  const startupRecovery = asJsonRecord(context.startupRecovery);
  const fixedPaths = Array.isArray(startupRecovery?.fixedPaths)
    ? startupRecovery.fixedPaths.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
  if (startupRecovery?.corrected === true) {
    lines.push(`claw-kit repaired the project configuration${fixedPaths.length > 0 ? `: ${fixedPaths.join(", ")}` : "."}`);
  }
  if (versionSyncPrompt?.placement === "prefix") lines.push(...versionSyncPrompt.lines);
  lines.push("Before using `rg`, use `claw search --query` to narrow the document search scope and GitNexus to narrow the code search scope, then use `rg` to locate exact files or symbols.");
  if (versionSyncPrompt?.placement === "suffix") lines.push(...versionSyncPrompt.lines);
  return lines.length > 0 ? lines.join("\n") : null;
}

function stripCindyGoalModeLines(prompt: string): string {
  return prompt
    .split("\n")
    .filter((line) => !/goal mode/i.test(line))
    .join("\n");
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
  const commandHints = toStringList(workflowGuidance?.commandHints);
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
    commandHints,
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
        `A newer claw-kit version is available: installed CLI ${cliVersion}, published latest ${latestPublishedVersion}.`,
        "Tell the user in their language that the current claw-kit installation is out of date and must be updated before they can continue using claw-kit. Ask whether they want to update now, then wait for their answer.",
        `After the user confirms, use ${updateSkill} to update the claw-kit CLI and the current host plugin surface, then continue the original task.`,
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
    const target = parseTaskPlanPath(project, planPath);
    if (!target) {
      unbindSession(project, ownerSessionKey);
      return null;
    }
    const result = showPlan({
      cwd,
      taskName: target.taskName,
      planFile: target.planFile,
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
        scope: project.scope,
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
    process.env.CLAW_SESSION_ID,
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

function buildKnowledgeDispatch(input: {
  host: "codex" | "cindy" | "dsh";
  finalizeId: string;
  writer?: KnowledgeFinalizationJob["writer"];
}): KnowledgeDelegateDispatch {
  // Cindy uses its Orca atomic dispatch; codex and dsh both dispatch through a
  // native-subagent delegate (DSH: subagent / subagent_fork).
  if (resolveHostIntegrationProfile(input.host)?.usesAtomicKnowledgeDispatch === true) {
    return buildKnowledgeAtomicDispatch(input);
  }
  return buildKnowledgeDelegateDispatch({
    policy: "subagent",
    finalizeId: input.finalizeId,
    writer: input.writer,
    ...(input.host === "codex" ? { leadInstruction: KNOWLEDGE_DISPATCH_LEAD_INSTRUCTION } : {}),
  });
}

function compactPlanCommandResult(
  command: "plan.create" | "plan.start" | "plan.edit" | "plan.remove" | "plan.wait" | "plan.resume" | "plan.leave" | "plan.sync" | "plan.done" | "task.add" | "task.edit" | "task.remove" | "task.done" | "subplan.create",
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
    completedTaskIds?: number[];
    knowledgeFinalizeId?: string;
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
  forceProjectionSync = false,
  knowledgeDispatch?: KnowledgeDelegateDispatch,
  ): Record<string, unknown> {
    const archivedPlanPath =
      completionRefresh?.taskRetention.archivedCurrentTask?.taskName === result.taskName &&
      completionRefresh.taskRetention.archivedCurrentTask.archivedPlanPath
        ? completionRefresh.taskRetention.archivedCurrentTask.archivedPlanPath
        : undefined;
    const resolvedPlanPath = archivedPlanPath ?? result.planPath;
    // codex and dsh share the same compact protocol and versioned hostActions
    // (schemaVersion 1: update_plan / create_goal / update_goal). The Codex
    // adapter consumes them via its fixed code-mode driver; the DSH adapter
    // consumes them inside the claw_run tool's execute.
    const integration = resolveHostIntegrationProfile(effectiveHost);
    const isSessionPlan = !result.planPath.includes(`${path.sep}.claw${path.sep}`);
    const hostActionsResult = integration?.consumesPlanGoalEffects === true && !isSessionPlan;
    const cindyResult = integration?.omitsCompactNotes === true;
    const hostActions = hostActionsResult ? buildCodexHostActions(result, {
      forceProjectionSync,
      actionIdPrefix: command === "plan.sync" ? `plan.sync:${createHash("sha256").update(result.planPath).digest("hex").slice(0, 16)}` : undefined,
      includeLightweightProcessProgress: effectiveHost === "codex",
    }) : [];
    const nextsteps = [
      ...result.workflowGuidance.nextsteps,
    ];
    const planSummary = result.planView.collapsedSummary;
    const includePlan = Boolean(
      (command === "plan.create" || command === "subplan.create")
      && result.plan
      && (!hostActionsResult || result.workflowGuidance.stage === "discussion"),
    );
    const achievement = result.planStatus === "end.completed" && result.plan
      ? {
          status: result.planStatus,
          title: result.plan.title,
          planSummary,
          completedTasks: result.plan.tasks.filter((task) => task.status === "done").length,
          totalTasks: result.plan.tasks.length,
          completedAt: result.plan.completedAt,
          retrospectiveSaved: Boolean(result.plan.retrospective?.summary?.trim()),
          keyDecisionsSaved: result.plan.keyDecisions?.length ?? 0,
        }
      : undefined;
    return {
      ok: true,
      command,
      planPath: resolvedPlanPath,
      ...(archivedPlanPath ? { archivedPlanPath } : {}),
      planStatus: result.planStatus,
      ...(result.events?.at(-1)?.mutationId ? { mutationId: result.events.at(-1)?.mutationId } : {}),
      ...(result.plan?.parentPlan ? { subplanParentPlan: result.plan.parentPlan } : {}),
      ...(result.workflowGuidance.transition ? { transition: result.workflowGuidance.transition } : {}),
      ...(achievement ? { achievement } : {}),
      ...(knowledgeDispatch ? { knowledgeDispatch } : {}),
      ...(!hostActionsResult && result.previousPlanStatus ? { previousPlanStatus: result.previousPlanStatus } : {}),
      ...(hostActions.length ? { hostActions } : {}),
      ...(!hostActionsResult && result.changedTaskIds?.length ? { changedTaskIds: result.changedTaskIds } : {}),
      ...(!hostActionsResult && result.appendedTaskIds?.length ? { appendedTaskIds: result.appendedTaskIds } : {}),
      ...(hostActionsResult ? { stage: result.workflowGuidance.stage } : {}),
      nextsteps,
      ...(result.workflowGuidance.nextTask ? { nextTask: result.workflowGuidance.nextTask } : {}),
      ...(result.workflowGuidance.notes?.trim() && !cindyResult
        ? { notes: result.workflowGuidance.notes }
        : {}),
      ...(result.workflowGuidance.commandHints?.length
        ? { commandHints: result.workflowGuidance.commandHints }
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
      ...(!hostActionsResult && !cindyResult && result.workflowGuidance.goalMode ? { goalMode: result.workflowGuidance.goalMode } : {}),
      ...(!hostActionsResult && !cindyResult && result.workflowGuidance.goalTool ? { goalTool: result.workflowGuidance.goalTool } : {}),
      ...(includePlan && result.plan ? { plan: result.plan } : {}),
      // Cindy's Ghost card is a Host-owned projection.  It needs the
      // canonical task list to render its expandable Todo view, but that
      // view stays out of Agent guidance in the Cindy adapter.
      ...(cindyResult ? { planView: result.planView } : {}),
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
      ...(!hostActionsResult || !includePlan ? { planSummary } : {}),
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
    ...(workflowGuidance.notes?.trim() ? { notes: workflowGuidance.notes } : {}),
    ...(workflowGuidance.commandHints?.length
      ? { commandHints: workflowGuidance.commandHints }
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
      case "--retrospective":
        operations.push({ type: "plan.update", updates: { retrospectiveSummary: readChainValue(args, flag) } });
        break;
      case "--what-worked":
        operations.push({ type: "plan.update", updates: { whatWorked: [readChainValue(args, flag)] } });
        break;
      case "--issue":
        operations.push({ type: "plan.update", updates: { issues: [readChainValue(args, flag)] } });
        break;
      case "--follow-up":
        operations.push({ type: "plan.update", updates: { followUps: [readChainValue(args, flag)] } });
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

function requestsPlanEndTerminal(operations: PlanMutationOperation[]): boolean {
  return operations.some(
    (operation) => operation.type === "plan.status" && operation.status.startsWith("end."),
  );
}

function planCompletionOperations(updates: PlanFieldUpdates): PlanMutationOperation[] {
  return [
    { type: "plan.update", updates },
    { type: "plan.status", status: "end.completed" },
  ];
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

  const target = parseTaskPlanPath(project, boundPlanPath);
  if (!target) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Invalid session-bound plan path: ${boundPlanPath}`);
  }
  return {
    taskName: target.taskName,
    planFile: explicitPlanFile ?? target.planFile,
  };
}

function parseTaskPlanPath(project: ProjectContext, planPath: string): { taskName: string; planFile: string } | null {
  const relativePlanPath = path.relative(project.tasksDir, planPath);
  if (relativePlanPath.startsWith("..") || path.isAbsolute(relativePlanPath)) return null;
  const segments = relativePlanPath.split(path.sep).filter(Boolean);
  const dated = /^\d{4}-\d{2}-\d{2}$/.test(segments[0] ?? "");
  const taskName = dated ? segments[1] : segments[0];
  const planFile = (dated ? segments.slice(2) : segments.slice(1)).join(path.sep);
  return taskName && planFile ? { taskName, planFile } : null;
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

type CompletionRefreshOperation = "memory.reindex.project" | "gitnexus.refresh";

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

type PreparedPlanTerminalRefresh = {
  queue: (taskName: string) => CompletionRefreshResult;
};

function preparePlanTerminalRefresh(cwd: string, ownerSessionKey: string | undefined): PreparedPlanTerminalRefresh | undefined {
  const workflowProject = resolveWorkflowProjectContext(cwd, ownerSessionKey);
  const refreshProject = tryResolveHookProject(workflowProject.projectRoot);
  if (!refreshProject) return undefined;
  return {
    queue: (taskName) => queueCompletionRefresh({
      cwd: refreshProject.projectRoot,
      taskName,
      includeTaskRetention: workflowProject.scope !== "session",
    }),
  };
}

function queueTerminalRefreshIfEntered(
  result: Pick<Awaited<ReturnType<typeof editPlan>>, "taskName" | "planStatus" | "previousPlanStatus">,
  terminalRefresh: PreparedPlanTerminalRefresh | undefined,
): CompletionRefreshResult | undefined {
  if (!terminalRefresh || result.previousPlanStatus.startsWith("end.") || !result.planStatus.startsWith("end.")) {
    return undefined;
  }
  return terminalRefresh.queue(result.taskName);
}

function queueCompletionRefresh(input: {
  cwd: string;
  taskName: string;
  includeTaskRetention?: boolean;
  includeGitNexus?: boolean;
  statusLabel?: string;
}): CompletionRefreshResult {
  const project = resolveProjectContext(input.cwd);
  const includeTaskRetention = input.includeTaskRetention ?? true;
  const taskRetention = includeTaskRetention
    ? enforceTaskRetention(project, input.taskName)
    : {
        enabled: false,
        maxTasksToKeep: project.projectConfig?.maxTasksToKeep ?? DEFAULT_MAX_TASKS_TO_KEEP,
        archivedTasks: [],
        prunedArchivedTasks: [],
      };
  const startedAt = new Date().toISOString();
  const statusFile = createCompletionRefreshStatusFile(project.clawDir, input.statusLabel ?? input.taskName, startedAt);
  const operations: CompletionRefreshResult["asyncRefresh"]["operations"] = ["memory.reindex.project"];
  if (project.projectConfig?.gitnexus === true && input.includeGitNexus !== false) {
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
    let gitnexus: GitNexusRefreshResult | undefined;
    let refreshCycles = 0;
    let dirtyHash = "";
    while (refreshCycles < 3) {
      refreshCycles += 1;
      dirtyHash = computeCompletionDirtyHash(cwd, taskName, operations);
      projectMemory = buildMemoryIndex({ cwd, scope: "project" });
      gitnexus = operations.includes("gitnexus.refresh")
        ? refreshGitNexusIfEnabled(cwd, resolveProjectContext(cwd).projectConfig)
        : {
            enabled: false,
            reason: "gitnexus is not enabled in .claw/project.json",
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
    findTaskDirectory(project, taskName) ?? path.join(project.tasksDir, taskName),
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

  ensureGitNexusInstalled(cwd);
  seedGitNexusEmbeddingCache(cwd, projectConfig);
  return runGitNexusAnalyze(cwd, {
    embeddings: !readGitNexusEmbeddingsEnabled(cwd),
  });
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

function isWindowsAccessViolation(result: { status: number | null }): boolean {
  return process.platform === "win32"
    && result.status !== null
    && (result.status >>> 0) === 0xc0000005;
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
  let primaryArgs = ["analyze", ...(options.embeddings ? ["--embeddings"] : []), "--no-ai-context"];
  let primary = runCommandWithLockRetry("gitnexus", primaryArgs, cwd);
  if (isWindowsAccessViolation(primary)) {
    primaryArgs = ["analyze", "--force", ...(options.embeddings ? ["--embeddings"] : []), "--no-ai-context"];
    primary = runCommandWithLockRetry("gitnexus", primaryArgs, cwd);
  }
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

  const fallbackArgs = [
    "analyze",
    ...(primaryArgs.includes("--force") ? ["--force"] : []),
    ...(options.embeddings ? ["--embeddings"] : []),
  ];
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
    "  --host <host>   Select host-specific output projection (codex, opencode, or cindy).",
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
