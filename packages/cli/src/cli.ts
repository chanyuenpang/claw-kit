#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import {
  checkProjectProtocol,
  ClawError,
  buildPlanWorkflowGuidance,
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
  writeSubplan,
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
  type TaskMeta,
  type WorkflowGuidance,
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
      case "truth":
        runTruth(args);
        return;
      case "hook":
        await runHook(args);
        return;
      case "internal-completion-refresh":
        runInternalCompletionRefresh(args);
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
      rejectFlags(args, ["--task", "--plan", "--content", "--status", "--plan-status", "--parent-task-id", "--description"]);
      const title = readOptionalFlag(args, "--title") ?? readOptionalPositionalArg(args);
      if (!title) {
        throw new ClawError(
          "PROJECT_CONFIG_INVALID",
          "plan write requires a title. Use `claw plan write \"<title>\"` or `claw plan write --title \"<title>\"`.",
        );
      }
      const result = await writePlan({
        cwd: process.cwd(),
        title,
        goalText: readOptionalFlag(args, "--goal"),
        ownerSessionKey: resolveOwnerSessionKey() ?? undefined,
      });
      assertNoRemainingArgs(args, "plan write");
      printJson(compactPlanCommandResult("plan.write", result));
      return;
    }
    case "edit": {
      const patchPath = readOptionalFlag(args, "--patch");
      const appendTasksPath = readOptionalFlag(args, "--append-tasks");
      const mergedPatch = mergeEditPatchFlags(
        patchPath ? readJson<Partial<PlanDocument>>(patchPath) : undefined,
        readRepeatedFlag(args, "--rule"),
        readRepeatedFlag(args, "--key-decision"),
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

type JsonRecord = Record<string, unknown>;

function runContextCommand(
  args: string[],
  cwd = process.cwd(),
  ownerSessionKey = resolveOwnerSessionKey(),
): Record<string, unknown> {
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

  const resolved = resolveContext(cwd, taskName);
  const activeWorkflow =
    !taskName && ownerSessionKey
      ? tryResolveActiveWorkflowSnapshot(cwd, ownerSessionKey)
      : null;

  return {
    ...resolved,
    ...(activeWorkflow ? { activeWorkflow } : {}),
    protocolCheck: checkProjectProtocol(cwd),
    startupRecovery: {
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
  const ownerSessionKey = resolveOwnerSessionKey(payload);

  if (!hookCwd || !containsClawDir(hookCwd)) {
    return;
  }

  try {
    const context = runContextCommand([], hookCwd, ownerSessionKey);
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
  const activeWorkflow = context.activeWorkflow as JsonRecord | undefined;
  if (activeWorkflow) {
    return buildRecoveredWorkflowAdditionalContext(activeWorkflow);
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

  return [
    `This session started inside a .claw project: ${projectName} (${projectId}).`,
    `.claw directory: ${clawDir}`,
    "Load claw-kit:using-claw-kit as the main workflow skill for this session.",
    "In this current thread, the agent is explicitly authorized to use goal mode and delegate subagents required by the claw workflow.",
    "Do not treat missing user authorization as a reason to block normal claw goal-mode entry, truth deposition, or ADR deposition.",
    "Follow the claw workflowGuidance return fields as the required next-step contract.",
    "Use [@claw-kit](plugin://claw-kit@claw-kit-local) to drive planning, search, truth, and ADR workflows for the rest of the task.",
  ].join("\n");
}

function buildRecoveredWorkflowAdditionalContext(activeWorkflow: JsonRecord): string {
  const taskName = String(activeWorkflow.taskName ?? "");
  const planFile = String(activeWorkflow.planFile ?? "plan.json");
  const planStatus = String(activeWorkflow.planStatus ?? "");
  const planSummary = String(activeWorkflow.planSummary ?? "");
  const workflowGuidance = activeWorkflow.workflowGuidance as JsonRecord | undefined;
  const nextsteps = toStringList(workflowGuidance?.nextsteps);
  const recommendedCommands = toStringList(workflowGuidance?.recommendedCommands);
  const delegateSubagents = toDelegateNames(workflowGuidance?.delegateSubagents);
  const notes = typeof workflowGuidance?.notes === "string" ? workflowGuidance.notes.trim() : "";
  const askUser = summarizeAskUser(workflowGuidance?.askUser as JsonRecord | undefined);
  const goalMode = summarizeGoalMode(workflowGuidance?.goalMode as JsonRecord | undefined);

  const lines = [
    "Use [@claw-kit](plugin://claw-kit@claw-kit-local) for this session.",
    "Claw workflow snapshot is recovered.",
    "Treat returned claw workflowGuidance as the only next-step contract.",
    "This thread is already authorized to use goal mode and delegate the claw workflow's required subagents.",
    "Do not block on extra user authorization for goal mode, truth-writer, or adr-writer.",
    "",
    "Current claw workflow snapshot:",
    `- task: ${taskName}`,
    `- plan: ${planFile}`,
    `- plan status: ${planStatus}`,
    `- plan summary: ${planSummary}`,
  ];

  if (nextsteps.length > 0) {
    lines.push(`- next steps: ${nextsteps.join(" | ")}`);
  }

  if (recommendedCommands.length > 0) {
    lines.push(`- recommended commands: ${recommendedCommands.join(" | ")}`);
  }
  if (notes) {
    lines.push(`- notes: ${notes}`);
  }
  if (delegateSubagents.length > 0) {
    lines.push(`- delegate subagents: ${delegateSubagents.join(", ")}`);
  }
  if (askUser) {
    lines.push(`- ask user: ${askUser}`);
  }
  if (goalMode) {
    lines.push(`- goal mode: ${goalMode}`);
  }

  return lines.join("\n");
}

function tryResolveActiveWorkflowSnapshot(
  cwd: string,
  ownerSessionKey: string,
): {
  taskName: string;
  planFile: string;
  planPath: string;
  planStatus: string;
  planSummary: string;
  workflowGuidance: WorkflowGuidance;
} | null {
  const project = resolveProjectContext(cwd);
  const taskName = findSessionBoundTask(project.tasksDir, ownerSessionKey);
  if (!taskName) {
    return null;
  }

  try {
    const result = showPlan({
      cwd,
      taskName,
    });

    return {
      taskName: result.taskName,
      planFile: result.planFile,
      planPath: result.planPath,
      planStatus: result.plan.status,
      planSummary: result.planView.collapsedSummary,
      workflowGuidance: buildPlanWorkflowGuidance({
        taskName: result.taskName,
        planFile: result.planFile,
        plan: result.plan,
        projectConfig: project.projectConfig,
      }),
    };
  } catch {
    return null;
  }
}

async function runSubplan(args: string[]): Promise<void> {
  const subcommand = args.shift();
  switch (subcommand) {
    case "write": {
      const result = await writeSubplan({
        cwd: process.cwd(),
        parentTaskName: readRequiredFlag(args, "--parent"),
        parentTaskId: readOptionalNumber(args, "--task-id") ?? failMissingNumericFlag("--task-id"),
        title: readRequiredFlag(args, "--title"),
        ownerSessionKey: resolveOwnerSessionKey() ?? undefined,
      });
      assertNoRemainingArgs(args, "subplan write");
      printJson(compactPlanCommandResult("plan.write", result));
      return;
    }
    default:
      throw new ClawError("PROJECT_CONFIG_INVALID", `Unknown subplan subcommand "${subcommand ?? ""}".`);
  }
}

function findSessionBoundTask(tasksDir: string, ownerSessionKey: string): string | null {
  if (!fs.existsSync(tasksDir)) {
    return null;
  }

  const candidates = fs
    .readdirSync(tasksDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const metaPath = path.join(tasksDir, entry.name, "meta.json");
      if (!fs.existsSync(metaPath)) {
        return null;
      }

      try {
        const meta = JSON.parse(stripBom(fs.readFileSync(metaPath, "utf-8"))) as TaskMeta;
        if (meta.ownerSessionKey !== ownerSessionKey) {
          return null;
        }

        return {
          taskName: entry.name,
          sortKey: meta.boundAt ?? meta.updatedAt ?? meta.createdAt ?? "",
        };
      } catch {
        return null;
      }
    })
    .filter((candidate): candidate is { taskName: string; sortKey: string } => candidate !== null)
    .sort((left, right) => right.sortKey.localeCompare(left.sortKey));

  return candidates[0]?.taskName ?? null;
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
  command: "plan.write" | "plan.edit" | "plan.done",
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
      ...(command === "plan.write" && result.plan ? { plan: result.plan } : {}),
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

function mergeEditPatchFlags(
  patch: Partial<PlanDocument> | undefined,
  rules: string[],
  keyDecisions: string[],
): Partial<PlanDocument> | undefined {
  const merged = patch ? structuredClone(patch) : {};
  if (rules.length > 0) {
    merged.rules = [...(merged.rules ?? []), ...rules];
  }
  if (keyDecisions.length > 0) {
    merged.keyDecisions = [...(merged.keyDecisions ?? []), ...keyDecisions];
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

function queueCompletionRefresh(input: { cwd: string; taskName: string }): CompletionRefreshResult {
  const project = resolveProjectContext(input.cwd);
  const taskRetention = enforceTaskRetention(project, input.taskName);
  const startedAt = new Date().toISOString();
  const statusFile = createCompletionRefreshStatusFile(project.clawDir, input.taskName, startedAt);
  const operations: CompletionRefreshResult["asyncRefresh"]["operations"] = ["memory.reindex.project"];
  if (!taskRetention.archivedCurrentTask) {
    operations.push("memory.reindex.task");
  }
  if (project.projectConfig?.gitnexus?.enabled === true) {
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
    const taskMemory = tryBuildTaskMemoryIndex(cwd, taskName);
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
    windowsHide: true,
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
      windowsHide: true,
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
      "  plan write \"<title>\" [--goal <text>]",
      "  plan write --title <text> [--goal <text>]",
      "             Creates the task scope and initial plan skeleton at prepare.requirements.",
      "             If goal is omitted, fill goal.text and the rest of the plan, then switch to process.active.",
      "  subplan write --parent <task-name> --task-id <number> --title <text>",
      "  plan edit --task <name> [--plan <relative-path>] [--patch <json-file>] [--rule <text>] [--key-decision <text>] [--plan-status <status>]",
      "  plan show --task <name> [--plan <relative-path>]",
      "  plan done --task <name> [--plan <relative-path>] [--summary <text>] [--patch <json-file>]",
      "  switch-task --from <task> --to <task>",
      "  search [--query] <text> [--limit <n>]",
      "  search index --refresh",
      "  truth ingest --target <relative-path-under-truth> [--input <file> | --content <text>] [--append]",
      "  hook <event-name>",
    ].join("\n"),
  );
  process.stderr.write("\n");
}

void main();
