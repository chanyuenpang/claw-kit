#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  checkProjectProtocol,
  ClawError,
  buildMemoryIndex,
  editPlan,
  ensureProjectProtocol,
  enforceTaskRetention,
  ingestTruth,
  initProject,
  resolveProjectContext,
  resolveContext,
  searchMemory,
  showPlan,
  switchTask,
  writePlan,
  type InitProjectInput,
  type InheritedFrom,
  type LeaveState,
  type MemoryScope,
  type PlanDocument,
  type PlanTask,
  type PlanViewModel,
  type ProjectConfig,
} from "@veewo/claw-core";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args.shift();

  try {
    switch (command) {
      case "init":
        const initInput: InitProjectInput = {
          cwd: process.cwd(),
          projectId: readOptionalFlag(args, "--id"),
          projectName: readOptionalFlag(args, "--name"),
          maxTasksToKeep: readOptionalNumber(args, "--max-tasks-to-keep"),
          externalTruthSkill: readOptionalFlag(args, "--external-truth-skill") ?? null,
          externalAdrSkill: readOptionalFlag(args, "--external-adr-skill") ?? null,
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
        printJson(runContextCommand(args));
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
      case "truth":
        runTruth(args);
        return;
      case "hook":
        await runHook(args);
        return;
      default:
        printUsage();
        process.exitCode = 1;
    }
  } catch (error) {
    handleError(error);
  }
}

async function runPlan(args: string[]): Promise<void> {
  const subcommand = args.shift();
  switch (subcommand) {
    case "write": {
      const contentPath = readOptionalFlag(args, "--content");
      const content = contentPath ? readJson<PlanDocument>(contentPath) : undefined;
      const result = await writePlan({
        cwd: process.cwd(),
        taskName: readOptionalFlag(args, "--task"),
        filePath: readOptionalFlag(args, "--plan"),
        title: readOptionalFlag(args, "--title"),
        description: readOptionalFlag(args, "--description"),
        goalText: readOptionalFlag(args, "--goal"),
        planStatus: readOptionalFlag(args, "--status"),
        content,
        parentTaskId: readOptionalNumber(args, "--parent-task-id"),
      });
      printJson(compactPlanCommandResult("plan.write", result));
      return;
    }
    case "edit": {
      const patchPath = readOptionalFlag(args, "--patch");
      const appendTasksPath = readOptionalFlag(args, "--append-tasks");
      const result = await editPlan({
        cwd: process.cwd(),
        taskName: readRequiredFlag(args, "--task"),
        planFile: readOptionalFlag(args, "--plan"),
        changeSummary: readOptionalFlag(args, "--summary"),
        patch: patchPath ? readJson<Partial<PlanDocument>>(patchPath) : undefined,
        planStatus: readOptionalFlag(args, "--plan-status"),
        taskId: readOptionalNumber(args, "--task-id"),
        taskStatus: readOptionalFlag(args, "--task-status") as PlanTask["status"] | undefined,
        appendTasks: appendTasksPath ? readJson<PlanTask[]>(appendTasksPath) : undefined,
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
      const result = await editPlan({
        cwd: process.cwd(),
        taskName: readRequiredFlag(args, "--task"),
        planFile: readOptionalFlag(args, "--plan"),
        changeSummary: readOptionalFlag(args, "--change-summary"),
        patch: mergedPatch,
        planStatus: "end.completed",
      });
      const completionRefresh = runCompletionRefresh({
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
        planStatus: result.plan.status,
        planView: result.planView,
      });
      return;
    }
    default:
      throw new ClawError("PROJECT_CONFIG_INVALID", `Unknown plan subcommand "${subcommand ?? ""}".`);
  }
}

function runSearch(args: string[]): void {
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
      query: readRequiredFlag(args, "--query"),
      scope: "project",
      limit: readOptionalNumber(args, "--limit"),
    }),
  });
}

type JsonRecord = Record<string, unknown>;

function runContextCommand(args: string[], cwd = process.cwd()): Record<string, unknown> {
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
    initProject({ cwd });
    initialized = true;
  }

  return {
    ...resolveContext(cwd, taskName),
    protocolCheck: checkProjectProtocol(cwd),
    bootstrap: {
      initialized,
      corrected,
      fixedPaths,
    },
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

  if (!hookCwd || !containsClawDir(hookCwd)) {
    return;
  }

  try {
    const context = runContextCommand([], hookCwd);
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
    let current = path.resolve(cwd);
    while (true) {
      if (fs.existsSync(path.join(current, ".claw"))) {
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

function buildSessionStartAdditionalContext(context: Record<string, unknown>, sessionCwd: string): string | null {
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

  return [
    `This session started inside a .claw project: ${projectName} (${projectId}).`,
    `Project root: ${projectRoot}`,
    `.claw directory: ${clawDir}`,
    `Project protocol check: ${protocolOk}.`,
    "Load claw-kit:using-claw-kit as the main workflow skill for this session.",
    "Report the recovered harness state and follow the claw workflowGuidance return fields as the required next-step contract.",
    "Use [@claw-kit](plugin://claw-kit@claw-kit-local) to drive planning, search, truth, and ADR workflows for the rest of the task.",
  ].join("\n");
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
  command: "plan.write" | "plan.edit" | "plan.done",
  result: {
    taskName: string;
    planFile: string;
    planPath: string;
    planStatus: string;
    workflowGuidance: {
      stage: string;
      summary: string;
      nextStep: string;
      nextTask?: {
        id: number;
        title: string;
        status: string;
        detail?: string;
      };
      notes?: string[];
      recommendedCommands?: string[];
      delegateSubagents?: unknown[];
      askUser?: unknown;
      goalMode?: unknown;
    };
    planView: PlanViewModel;
    planReview?: {
      score: number;
      issues: unknown[];
      suggestions: string[];
      completionPolicy: string;
    };
    nextAction?: string;
    instruction?: string;
  },
  completionRefresh?: CompletionRefreshResult,
): Record<string, unknown> {
  const resolvedPlanPath =
    completionRefresh?.taskRetention.archivedCurrentTask?.taskName === result.taskName &&
    completionRefresh.taskRetention.archivedCurrentTask.archivedPlanPath
      ? completionRefresh.taskRetention.archivedCurrentTask.archivedPlanPath
      : result.planPath;

  return {
    ok: true,
    command,
    planPath: resolvedPlanPath,
    planStatus: result.planStatus,
    nextStep: result.workflowGuidance.nextStep,
    ...(result.workflowGuidance.nextTask ? { nextTask: result.workflowGuidance.nextTask } : {}),
    ...(result.workflowGuidance.delegateSubagents?.length
      ? { delegateSubagents: result.workflowGuidance.delegateSubagents }
      : {}),
    ...(result.workflowGuidance.notes?.length ? { notes: result.workflowGuidance.notes } : {}),
    ...(result.workflowGuidance.recommendedCommands?.length
      ? { recommendedCommands: result.workflowGuidance.recommendedCommands }
      : {}),
    ...(result.workflowGuidance.askUser ? { askUser: result.workflowGuidance.askUser } : {}),
    ...(result.workflowGuidance.goalMode ? { goalMode: result.workflowGuidance.goalMode } : {}),
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
    ...(result.nextAction ? { nextAction: result.nextAction } : {}),
    ...(result.instruction ? { instruction: result.instruction } : {}),
    planSummary: result.planView.collapsedSummary,
    ...(completionRefresh ? { completionRefresh: compactCompletionRefresh(completionRefresh) } : {}),
  };
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
    memory: {
      projectIndexed: completionRefresh.memory.project.indexedCount,
      taskIndexed: completionRefresh.memory.task?.indexedCount ?? 0,
    },
    gitnexus:
      completionRefresh.gitnexus?.enabled === true
        ? {
            refreshed: true,
            command: completionRefresh.gitnexus.command,
            exitCode: completionRefresh.gitnexus.exitCode,
          }
        : {
            refreshed: false,
            reason: completionRefresh.gitnexus?.reason ?? "gitnexus refresh did not run",
          },
  };
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
  memory: {
    project: ReturnType<typeof buildMemoryIndex>;
    task?: ReturnType<typeof buildMemoryIndex>;
  };
  gitnexus?: {
    enabled: true;
    command: string;
    exitCode: number;
    stdout: string;
    stderr: string;
  } | {
    enabled: false;
    reason: string;
  };
};

function runCompletionRefresh(input: { cwd: string; taskName: string }): CompletionRefreshResult {
  const project = resolveProjectContext(input.cwd);
  const taskRetention = enforceTaskRetention(project, input.taskName);
  const projectMemory = buildMemoryIndex({
    cwd: input.cwd,
    scope: "project",
  });
  const taskMemory = taskRetention.archivedCurrentTask
    ? undefined
    : buildMemoryIndex({
        cwd: input.cwd,
        scope: "task",
        taskName: input.taskName,
      });

  return {
    taskRetention,
    memory: {
      project: projectMemory,
      ...(taskMemory ? { task: taskMemory } : {}),
    },
    gitnexus: refreshGitNexusIfEnabled(project.projectRoot, project.projectConfig),
  };
}

function refreshGitNexusIfEnabled(
  cwd: string,
  projectConfig: ProjectConfig | null,
): CompletionRefreshResult["gitnexus"] {
  const enabled = projectConfig?.gitnexus?.enabled === true;

  if (!enabled) {
    return {
      enabled: false,
      reason: "gitnexus is not enabled in .claw/project.json",
    };
  }

  const primary = spawnSync("gitnexus", ["analyze", "--no-ai-context"], {
    cwd,
    encoding: "utf-8",
    shell: process.platform === "win32",
  });

  if (primary.error) {
    throw new ClawError("PROJECT_CONFIG_INVALID", "gitnexus analyze failed after plan completion.", {
      cwd,
      message: primary.error.message,
    });
  }

  if (shouldFallbackToPlainAnalyze(primary)) {
    const fallback = spawnSync("gitnexus", ["analyze"], {
      cwd,
      encoding: "utf-8",
      shell: process.platform === "win32",
    });
    if (fallback.error) {
      throw new ClawError("PROJECT_CONFIG_INVALID", "gitnexus analyze fallback failed after plan completion.", {
        cwd,
        message: fallback.error.message,
      });
    }
    return {
      enabled: true,
      command: "gitnexus analyze",
      exitCode: fallback.status ?? 0,
      stdout: fallback.stdout ?? "",
      stderr: fallback.stderr ?? "",
    };
  }

  return {
    enabled: true,
    command: "gitnexus analyze --no-ai-context",
    exitCode: primary.status ?? 0,
    stdout: primary.stdout ?? "",
    stderr: primary.stderr ?? "",
  };
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

function printUsage(): void {
  const scriptName = path.basename(process.argv[1] ?? "claw");
  process.stderr.write(
    [
      `Usage: ${scriptName} <command> [options]`,
      "",
      "Commands:",
      "  init [--id <project-id>] [--name <project-name>] [--context-path <file>] [--ext-path <path>]",
      "       [--external-truth-skill <skill>] [--external-adr-skill <skill>]",
      "       [--gitnexus true|false] [--max-tasks-to-keep <n>] [--force]",
      "  context [--task <name>]",
      "  check",
      "  plan write --task <name> [--plan <relative-path>] [--title <text>] [--goal <text>] [--content <json-file>]",
      "               [--parent-task-id <number>]",
      "  plan edit --task <name> [--plan <relative-path>] [--patch <json-file>] [--plan-status <status>]",
      "  plan show --task <name> [--plan <relative-path>]",
      "  plan done --task <name> [--plan <relative-path>] [--summary <text>] [--patch <json-file>]",
      "  switch-task --from <task> --to <task>",
      "  search --query <text> [--limit <n>]",
      "  truth ingest --target <relative-path-under-truth> [--input <file> | --content <text>] [--append]",
      "  hook <event-name>",
    ].join("\n"),
  );
  process.stderr.write("\n");
}

void main();
