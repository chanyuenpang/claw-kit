import { execSync, spawn } from "node:child_process";
import path from "node:path";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import type { Plugin } from "@opencode-ai/plugin";
import type { Part } from "@opencode-ai/sdk";

/**
 * claw-kit OpenCode adapter plugin.
 *
 * Injection surfaces:
 *   1. shell.env — inject CLAW_HOST + CLAW_GUIDANCE_CONFIG into all shell executions
 *   2. event(session.created) + event(session.compacted) — one-shot init: detect .claw/,
 *      call claw context. Compaction re-runs because the prior system prompt
 *      injection is lost when the context window is compressed.
 *   3. chat.message — prepend claw context as a synthetic text part to the session's first
 *      user message. LLMs attend to user messages far more than system prompts, so this is
 *      the primary injection. Guarded by injectedSessions so it only fires once per session.
 *   4. experimental.chat.system.transform — push cached claw context into system prompt.
 *      Retained as a compaction fallback: after context compression the synthetic part may
 *      be summarized away, so the system prompt re-establishes claw context.
 *   5. event(message.updated) + event(message.part.updated) — track the latest assistant
 *      text per session so session.idle can hand the turn's final assistant message to claw.
 *   6. event(session.idle) — turn report capture plus Goal continuation. The
 *      plan file remains canonical: task progress resets retry state, while
 *      two unchanged task endings pause the plan.
 */

const ADAPTER_DIR = import.meta.dirname ?? path.dirname(new URL("", import.meta.url).pathname);
const GUIDANCE_CONFIG_PATH = path.join(ADAPTER_DIR, "..", "workflow-guidance.opencode.json");

let inClawProject = false;
let projectInfo: { projectId: string; projectName: string; clawDir: string } | null = null;
let recoveredState: string | null = null;
let clawSessionContext: string | null = null;
// Tracks sessions that already received the claw-context user-message prefix,
// so chat.message only injects on the first user message of each session.
const injectedSessions = new Set<string>();
// Turn report capture: tracks the latest assistant message id per session and its
// accumulated text, so session.idle can hand the turn's final assistant message to
// `claw hook auto-doc` for fail-open knowledge report capture.
const lastAssistantMessageBySession = new Map<string, string>();
const assistantTextByMessage = new Map<string, string>();
type GoalSession = {
  taskId: number | null;
  retryCount: number;
  attemptPending: boolean;
  continuationQueued: boolean;
  pausing?: boolean;
};
const goalSessions = new Map<string, GoalSession>();

function hasClawProject(dir: string): boolean {
  return existsSync(path.join(dir, ".claw"));
}

function readProjectInfo(projectDir: string): { projectId: string; projectName: string; clawDir: string } | null {
  const clawDir = path.join(projectDir, ".claw");
  if (!existsSync(clawDir)) return null;

  const projectJsonPath = path.join(clawDir, "project.json");
  try {
    if (existsSync(projectJsonPath)) {
      const config = JSON.parse(readFileSync(projectJsonPath, "utf8"));
      const id = config.id ?? path.basename(projectDir);
      const name = config.name ?? id;
      return { projectId: id, projectName: name, clawDir };
    }
  } catch {
    // fall through to fallback
  }

  return {
    projectId: path.basename(projectDir),
    projectName: path.basename(projectDir),
    clawDir,
  };
}

function resolveActivePlanPath(projectDir: string): string | null {
  const clawDir = path.join(projectDir, ".claw");
  if (!existsSync(clawDir)) return null;

  try {
    const metaPath = path.join(clawDir, "task-meta.json");
    if (existsSync(metaPath)) {
      const meta = JSON.parse(readFileSync(metaPath, "utf8"));
      if (meta.activeTaskName) {
        return path.join(clawDir, meta.activeTaskName, "plan.json");
      }
    }
  } catch {
    // ignore
  }

  const defaultPlan = path.join(clawDir, "plan.json");
  if (existsSync(defaultPlan)) return defaultPlan;

  // Newer .claw layouts bind the active task through the runtime/session
  // registry instead of a root task-meta.json. Keep this adapter read-only by
  // selecting the newest active plan as a recovery fallback.
  const activePlans: Array<{ planPath: string; updatedAt: number }> = [];
  const visit = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true, encoding: "utf8" });
    } catch {
      return;
    }
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
        continue;
      }
      if (entry.name !== "plan.json") continue;
      try {
        const plan = JSON.parse(readFileSync(entryPath, "utf8")) as { status?: unknown };
        if (plan.status === "process.active") {
          activePlans.push({ planPath: entryPath, updatedAt: statSync(entryPath).mtimeMs });
        }
      } catch {
        // Ignore incomplete or unrelated plan files.
      }
    }
  };
  visit(path.join(clawDir, "tasks"));
  activePlans.sort((left, right) => right.updatedAt - left.updatedAt);
  if (activePlans[0]) return activePlans[0].planPath;

  return null;
}

function readPlanSummary(planPath: string): string | null {
  try {
    if (!existsSync(planPath)) return null;
    const plan = JSON.parse(readFileSync(planPath, "utf8"));
    const lines: string[] = [];
    if (plan.title) lines.push(`Active plan: ${plan.title}`);
    lines.push(`Status: ${plan.status}`);
    if (plan.goal?.text) lines.push(`Goal: ${plan.goal.text}`);
    if (plan.tasks?.length) {
      lines.push(`Tasks:`);
      for (const task of plan.tasks) {
        lines.push(`  #${task.id} [${task.status}] ${task.title}`);
      }
    }
    return lines.join("\n");
  } catch {
    return null;
  }
}

function readActivePlanState(projectDir: string): { status: string; taskId: number | null } | null {
  const planPath = resolveActivePlanPath(projectDir);
  if (!planPath) return null;
  try {
    const plan = JSON.parse(readFileSync(planPath, "utf8")) as {
      status?: unknown;
      tasks?: Array<{ id?: unknown; status?: unknown }>;
    };
    const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
    const task = tasks.find((item) => item.status === "in_progress")
      ?? tasks.find((item) => item.status === "pending");
    return {
      status: typeof plan.status === "string" ? plan.status : "",
      taskId: Number.isInteger(task?.id) ? Number(task?.id) : null,
    };
  } catch {
    return null;
  }
}

/**
 * Invoke the host-neutral `claw context` entry and render the OpenCode prompt
 * locally. The CLI returns state only; platform Hook output belongs here.
 *   - skill loading directive
 *   - workflowGuidance contract
 *   - active plan recovery (when a plan exists)
 *
 * This replaces the previous hardcoded static text in experimental.chat.system.transform.
 * Returns null when claw CLI is unavailable or the directory is not a .claw project.
 */
function invokeClawSessionStart(projectDir: string): string | null {
  try {
    const stdout = execSync("claw context --host opencode", {
      cwd: projectDir,
      encoding: "utf8",
      timeout: 10_000,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        CLAW_HOST: "opencode",
        ...(existsSync(GUIDANCE_CONFIG_PATH) ? { CLAW_GUIDANCE_CONFIG: GUIDANCE_CONFIG_PATH } : {}),
      },
    });
    if (!stdout.trim()) return null;
    return renderClawSessionStart(JSON.parse(stdout));
  } catch {
    return null;
  }
}

function renderClawSessionStart(context: Record<string, unknown>): string | null {
  const error = context.error as { prompt?: unknown } | undefined;
  const runtimePrompt = typeof error?.prompt === "string" ? error.prompt.trim() : "";
  const workflow = context.activeWorkflow;
  if (workflow && typeof workflow === "object") {
    return [
      runtimePrompt,
      "Claw workflow snapshot is recovered. Treat `workflowGuidance` as the only next-step contract.",
      JSON.stringify(workflow),
    ].filter(Boolean).join("\n\n");
  }
  const project = context.project as { projectName?: unknown; projectId?: unknown } | undefined;
  if (!project) return runtimePrompt || null;
  const projectName = typeof project.projectName === "string" ? project.projectName : project.projectId;
  return [
    runtimePrompt,
    `This session started inside claw project ${projectName || "project"}. Load claw-kit:using-claw-kit as the main workflow skill for this session.`,
    typeof context.searchGuidance === "string" ? context.searchGuidance : "",
  ].filter(Boolean).join("\n\n");
}

/**
 * Hand the turn's final assistant message to `claw hook auto-doc` so the claw CLI
 * can append one fail-open knowledge report entry (and queue finalization when a
 * plan just completed). opencode has no transcript file, so the message is passed
 * inline via stdin. Fail-open: any error is swallowed to keep the session responsive.
 */
function invokeClawAutoDoc(
  projectDir: string,
  payload: { cwd: string; session_id: string; turn_id: string; message: string },
): { jobPath?: string; finalizeId?: string } | null {
  try {
    const stdout = execSync("claw hook auto-doc --host opencode", {
      cwd: projectDir,
      encoding: "utf8",
      timeout: 30_000,
      input: JSON.stringify(payload),
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        CLAW_HOST: "opencode",
        CLAW_KNOWLEDGE_FINALIZER_DISABLE_LAUNCH: "1",
        CLAW_KNOWLEDGE_CAPTURE_RESULT: "1",
        ...(existsSync(GUIDANCE_CONFIG_PATH) ? { CLAW_GUIDANCE_CONFIG: GUIDANCE_CONFIG_PATH } : {}),
      },
    });
    const parsed = JSON.parse(stdout) as { jobPath?: unknown; finalizeId?: unknown };
    return {
      ...(typeof parsed.jobPath === "string" ? { jobPath: parsed.jobPath } : {}),
      ...(typeof parsed.finalizeId === "string" ? { finalizeId: parsed.finalizeId } : {}),
    };
  } catch {
    // Knowledge report capture is a fail-open sidecar and must never block session.idle.
    return null;
  }
}

/**
 * Keep finalization detached from session.idle. The CLI supplies the canonical
 * immutable dispatch; this adapter owns the native OpenCode runtime.
 */
function dispatchOpenCodeKnowledgeWriter(projectDir: string, jobPath: string): void {
  let handoff: { dispatch?: { prompt?: unknown }; projectRoot?: unknown; writer?: { model?: unknown; reasoningEffort?: unknown } | null };
  try {
    handoff = JSON.parse(execSync(`claw internal-knowledge-dispatch --job ${JSON.stringify(jobPath)}`, {
      cwd: projectDir,
      encoding: "utf8",
      timeout: 30_000,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, CLAW_HOST: "opencode", CLAW_KNOWLEDGE_FINALIZER: "1" },
    })) as typeof handoff;
  } catch {
    return;
  }
  if (typeof handoff.dispatch?.prompt !== "string" || typeof handoff.projectRoot !== "string") return;
  const writer = handoff.writer ?? {};
  const command = process.platform === "win32" ? "opencode.cmd" : "opencode";
  const args = ["run", "--format", "json", "--dir", handoff.projectRoot, "--dangerously-skip-permissions", "--agent", "claw-knowledge-writer"];
  if (typeof writer.model === "string" && writer.model) args.push("--model", writer.model);
  if (typeof writer.reasoningEffort === "string" && writer.reasoningEffort) args.push("--variant", writer.reasoningEffort);
  args.push(handoff.dispatch.prompt);
  const child = spawn(command, args, {
    cwd: projectDir,
    env: {
      ...process.env,
      CLAW_KNOWLEDGE_FINALIZER: "1",
    },
    windowsHide: true,
    detached: process.platform !== "win32",
    stdio: "ignore",
  });
  child.on("error", () => {
    // The queued job remains available for a later adapter retry.
  });
  child.unref();
}

async function invokeOpenCodeContinuation(
  client: Parameters<Plugin>[0]["client"],
  projectDir: string,
  sessionId: string,
): Promise<boolean> {
  try {
    await client.session.promptAsync({
      path: { id: sessionId },
      query: { directory: projectDir },
      body: {
        parts: [{
          type: "text",
          text: "继续执行当前 claw 计划：遵循 claw-kit workflow guidance，完成当前任务后记录状态；只有计划进入暂停、讨论或终态时才停止。",
        }],
      },
    });
    return true;
  } catch {
    return false;
  }
}

function invokeOpenCodePlanWait(projectDir: string, sessionId: string): boolean {
  try {
    execSync("claw plan wait --host opencode", {
      cwd: projectDir,
      encoding: "utf8",
      timeout: 30_000,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, CLAW_HOST: "opencode", CODEX_SESSION_ID: sessionId },
    });
    return true;
  } catch {
    return false;
  }
}

export const ClawKitPlugin: Plugin = async ({ directory, client }) => {
  const projectDir = directory;

  /**
   * Lazily detect .claw/ — re-checks on each call until true, then caches.
   * This handles sessions where the agent creates .claw/ mid-session (e.g.
   * `claw init` or `claw plan new`) after session.created already ran.
   */
  function isClawProject(): boolean {
    if (!inClawProject && hasClawProject(projectDir)) {
      inClawProject = true;
    }
    return inClawProject;
  }

  /**
   * One-shot initialization: detect .claw/ project, invoke claw context,
   * read active plan state. Called from session.created and session.compacted.
   */
  function initClawContext(): void {
    if (!hasClawProject(projectDir)) return;
    inClawProject = true;
    projectInfo = readProjectInfo(projectDir);

    const hookContext = invokeClawSessionStart(projectDir);
    if (hookContext) {
      clawSessionContext = hookContext;
    }

    const planPath = resolveActivePlanPath(projectDir);
    if (planPath) {
      const summary = readPlanSummary(planPath);
      if (summary) {
        recoveredState = summary;
      }
    }
  }

  return {
    // (1) Inject environment variables into all shell executions
    // Agent's bash tool calls to claw CLI will automatically carry these
    "shell.env": async (input, output) => {
      output.env.CLAW_HOST = "opencode";
      if (existsSync(GUIDANCE_CONFIG_PATH)) {
        output.env.CLAW_GUIDANCE_CONFIG = GUIDANCE_CONFIG_PATH;
      }
      // Bind claw commands to the current opencode session so that
      // plan create/done and other lifecycle operations can resolve the
      // session owner key for knowledge capture.
      if (input.sessionID) {
        output.env.CODEX_SESSION_ID = input.sessionID;
      }
    },

    // (2) Session start (new + compacted) + (5) Goal continuation
    event: async ({ event }) => {
      // New session: initialize claw context
      if (event.type === "session.created") {
        initClawContext();
      }

      // Compaction: system prompt injection is lost after context compression,
      // so re-initialize to re-inject claw context into subsequent prompts
      if (event.type === "session.compacted") {
        initClawContext();
      }

      // Track the latest assistant message text per session so session.idle can
      // hand the turn's final assistant message to claw knowledge report capture.
      if (isClawProject() && event.type === "message.updated") {
        const props = event.properties as {
          sessionID?: string;
          info?: { id?: string; role?: string };
        };
        // sessionID lives at the event-property top level (not inside info).
        if (props.info?.id && props.info.role === "assistant" && props.sessionID) {
          lastAssistantMessageBySession.set(props.sessionID, props.info.id);
        }
      } else if (isClawProject() && event.type === "message.part.updated") {
        const part = (event.properties as { part?: { messageID?: string; type?: string; text?: string } }).part;
        if (part && part.type === "text" && typeof part.text === "string" && part.text.trim() && part.messageID) {
          // opencode emits the current full text of the part on each update, so
          // overwrite (do not append) to avoid duplicating streamed content.
          assistantTextByMessage.set(part.messageID, part.text);
        }
      }

      // Turn report capture
      if (event.type === "session.idle") {
        const sessionID = (event.properties as { sessionID?: string }).sessionID;
        if (sessionID) {
          // Turn report capture: hand the turn's final assistant message to
          // claw so it appends one fail-open knowledge report entry (and queues
          // finalization when a plan just completed).
          const assistantMessageId = lastAssistantMessageBySession.get(sessionID);
          const message = assistantMessageId ? assistantTextByMessage.get(assistantMessageId) : undefined;
          if (assistantMessageId && message) {
            const captured = invokeClawAutoDoc(projectDir, {
              cwd: projectDir,
              session_id: sessionID,
              turn_id: assistantMessageId,
              message,
            });
            if (captured?.jobPath && captured.finalizeId) {
              dispatchOpenCodeKnowledgeWriter(projectDir, captured.jobPath);
            }
            assistantTextByMessage.delete(assistantMessageId);
            lastAssistantMessageBySession.delete(sessionID);
          }

          const planState = readActivePlanState(projectDir);
          const existingGoal = goalSessions.get(sessionID);
          if (!planState || planState.status !== "process.active") {
            goalSessions.delete(sessionID);
            return;
          }

          const taskChanged = existingGoal && planState.taskId !== existingGoal.taskId;
          const goal: GoalSession = {
            taskId: planState.taskId,
            retryCount: taskChanged ? 0 : existingGoal?.retryCount || 0,
            attemptPending: taskChanged ? false : existingGoal?.attemptPending === true,
            continuationQueued: taskChanged ? false : existingGoal?.continuationQueued === true,
            ...(existingGoal?.pausing ? { pausing: true } : {}),
          };
          goalSessions.set(sessionID, goal);
          if (goal.pausing) return;

          if (goal.attemptPending) {
            goal.attemptPending = false;
            goal.continuationQueued = false;
            if (goal.taskId === existingGoal?.taskId) goal.retryCount += 1;
            else goal.retryCount = 0;
            if (goal.retryCount >= 2) {
              goal.pausing = true;
              if (invokeOpenCodePlanWait(projectDir, sessionID)) goalSessions.delete(sessionID);
              return;
            }
          }

          if (goal.continuationQueued) return;
          goal.continuationQueued = true;
          goal.attemptPending = true;
          const dispatched = await invokeOpenCodeContinuation(client, projectDir, sessionID);
          if (!dispatched) {
            goal.attemptPending = false;
            goal.continuationQueued = false;
            goal.retryCount += 1;
            if (goal.retryCount >= 2) {
              goal.pausing = true;
              if (invokeOpenCodePlanWait(projectDir, sessionID)) goalSessions.delete(sessionID);
            }
          }
        }
      }
    },

    // (3) Inject claw context as a synthetic user-message text part (primary injection).
    // LLMs attend to user messages far more strongly than system prompts, so the claw
    // workflow context is prepended to the first user message of each session. The
    // injectedSessions guard ensures this only fires once per session.
    "chat.message": async (input, output) => {
      // Skip when there is nothing to inject (non-.claw project, or claw CLI unavailable)
      if (!isClawProject()) return;
      // Capture into a local const so the narrowing survives the subsequent calls;
      // module-level `let` narrowing would otherwise be invalidated by injectedSessions use.
      const context = clawSessionContext;
      if (!context) return;
      // First-message guard: inject once per session, never repeat
      if (injectedSessions.has(input.sessionID)) return;
      injectedSessions.add(input.sessionID);

      // Prepend claw context as a synthetic text part. opencode requires
      // sessionID/messageID on each Part for event validation, so they are
      // pulled from the hook input/output. synthetic:true keeps the UI
      // collapsed while the LLM still sees the text.
      output.parts.unshift({
        type: "text",
        text: context,
        synthetic: true,
        id: `prt_claw${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`,
        sessionID: input.sessionID,
        messageID: output.message.id ?? input.messageID ?? "",
      } as unknown as Part);
    },

    // (4) Inject recovered state into system prompt — compaction fallback
    "experimental.chat.system.transform": async (_input, output) => {
      // Unconditional: inject claw workflow context whenever inside a .claw project
      if (!isClawProject()) return;

      // Prefer full claw context (includes workflow recovery,
      // workflowGuidance, and plan recovery)
      if (clawSessionContext) {
        output.system.push(clawSessionContext);
        return;
      }

      // Fallback: static text when claw context was unavailable
      const info = projectInfo;
      const lines: string[] = [];
      lines.push("## claw-kit project context");
      lines.push("");
      if (info) {
        lines.push(`This session started inside a .claw project: ${info.projectName} (${info.projectId}).`);
        lines.push(`.claw directory: ${info.clawDir}`);
      } else {
        lines.push("This session started inside a .claw project.");
      }
      lines.push("");
      lines.push("Load the using-claw-kit skill as the main workflow skill for this session.");
      lines.push("If no task scope exists yet, let using-claw-kit create a plan when reusable project knowledge is expected, then keep it discussing until downstream tasks are explicit and handoff-ready.");
      lines.push("Low-complexity work can bypass claw plan create, claw search, and workflowGuidance entirely.");
      lines.push("For higher-complexity work, use claw plan create, then follow the claw workflowGuidance return fields as the required next-step contract.");
      lines.push("Use claw search for project recall after plan creation when the formal claw workflow is active.");
      lines.push("");

      // Conditional: append active plan summary if recovered
      if (recoveredState) {
        lines.push("There is already an unfinished plan in this thread.");
        lines.push("Tell the user and ask whether to close the current plan or continue advancing it before starting unrelated work.");
        lines.push("After this plan finishes, keep using claw-kit in this thread for the next task.");
        lines.push("");
        lines.push("Active plan:");
        lines.push(recoveredState);
      }

      output.system.push(lines.join("\n"));
    },
  };
};

export default ClawKitPlugin;
