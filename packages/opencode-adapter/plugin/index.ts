import { execSync } from "node:child_process";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import type { Plugin } from "@opencode-ai/plugin";
import type { Part } from "@opencode-ai/sdk";

/**
 * claw-kit OpenCode adapter plugin.
 *
 * Injection surfaces:
 *   1. shell.env — inject CLAW_HOST + CLAW_GUIDANCE_CONFIG into all shell executions
 *   2. event(session.created) + event(session.compacted) — one-shot init: detect .claw/,
 *      call claw hook auto-claw. Compaction re-runs because the prior system prompt
 *      injection is lost when the context window is compressed.
 *   3. chat.message — prepend claw context as a synthetic text part to the session's first
 *      user message. LLMs attend to user messages far more than system prompts, so this is
 *      the primary injection. Guarded by injectedSessions so it only fires once per session.
 *   4. experimental.chat.system.transform — push cached claw context into system prompt.
 *      Retained as a compaction fallback: after context compression the synthetic part may
 *      be summarized away, so the system prompt re-establishes claw context.
 *   5. event(message.updated) + event(message.part.updated) — track the latest assistant
 *      text per session so session.idle can hand the turn's final assistant message to claw.
 *   6. event(session.idle) — turn report capture: call claw hook auto-doc with the turn's
 *      final assistant message (fail-open knowledge sidecar), then goal continuation that
 *      advances the agent when plan.status is process.active.
 */

const ADAPTER_DIR = import.meta.dirname ?? path.dirname(new URL("", import.meta.url).pathname);
const GUIDANCE_CONFIG_PATH = path.join(ADAPTER_DIR, "..", "workflow-guidance.opencode.json");

let inClawProject = false;
let projectInfo: { projectId: string; projectName: string; clawDir: string } | null = null;
let recoveredState: string | null = null;
let clawSessionContext: string | null = null;
const sessionPlans = new Map<string, { planPath: string; projectDir: string }>();
// Tracks sessions that already received the claw-context user-message prefix,
// so chat.message only injects on the first user message of each session.
const injectedSessions = new Set<string>();
// Turn report capture: tracks the latest assistant message id per session and its
// accumulated text, so session.idle can hand the turn's final assistant message to
// `claw hook auto-doc` for fail-open knowledge report capture.
const lastAssistantMessageBySession = new Map<string, string>();
const assistantTextByMessage = new Map<string, string>();

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

function readPlanStatus(planPath: string): string | null {
  try {
    if (!existsSync(planPath)) return null;
    const content = readFileSync(planPath, "utf8");
    const plan = JSON.parse(content);
    return plan.status ?? null;
  } catch {
    return null;
  }
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

/**
 * Invoke `claw hook auto-claw` to get the full dynamic context that claw CLI
 * generates for this project, including:
 *   - skill loading directive
 *   - workflowGuidance contract
 *   - active plan recovery (when a plan exists)
 *
 * This replaces the previous hardcoded static text in experimental.chat.system.transform.
 * Returns null when claw CLI is unavailable or the directory is not a .claw project.
 */
function invokeClawSessionStart(projectDir: string): string | null {
  try {
    const stdout = execSync("claw hook auto-claw", {
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
    const parsed = JSON.parse(stdout);
    return parsed.hookSpecificOutput?.additionalContext ?? null;
  } catch {
    return null;
  }
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
): void {
  try {
    execSync("claw hook auto-doc --host opencode", {
      cwd: projectDir,
      encoding: "utf8",
      timeout: 30_000,
      input: JSON.stringify(payload),
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        CLAW_HOST: "opencode",
        ...(existsSync(GUIDANCE_CONFIG_PATH) ? { CLAW_GUIDANCE_CONFIG: GUIDANCE_CONFIG_PATH } : {}),
      },
    });
  } catch {
    // Knowledge report capture is a fail-open sidecar and must never block session.idle.
  }
}

export const ClawKitPlugin: Plugin = async ({ client, directory }) => {
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
   * One-shot initialization: detect .claw/ project, invoke claw hook auto-claw,
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

      // Goal continuation + turn report capture
      if (event.type === "session.idle") {
        const sessionID = (event.properties as { sessionID?: string }).sessionID;
        if (sessionID) {
          // (a) Turn report capture: hand the turn's final assistant message to
          // claw so it appends one fail-open knowledge report entry (and queues
          // finalization when a plan just completed). Runs before goal
          // continuation so the report belongs to the just-finished turn.
          const assistantMessageId = lastAssistantMessageBySession.get(sessionID);
          const message = assistantMessageId ? assistantTextByMessage.get(assistantMessageId) : undefined;
          if (assistantMessageId && message) {
            invokeClawAutoDoc(projectDir, {
              cwd: projectDir,
              session_id: sessionID,
              turn_id: assistantMessageId,
              message,
            });
            assistantTextByMessage.delete(assistantMessageId);
            lastAssistantMessageBySession.delete(sessionID);
          }

          // (b) Goal continuation: nudge the agent when an active plan is bound.
          const planBinding = sessionPlans.get(sessionID);
          if (planBinding) {
            const status = readPlanStatus(planBinding.planPath);
            if (status === "process.active") {
              await client.session.promptAsync({
                path: { id: sessionID },
                body: {
                  parts: [
                    {
                      type: "text",
                      text: "There is already an unfinished plan in this thread. Tell the user and ask whether to close the current plan or continue advancing it before starting unrelated work. If the user chooses to continue and you still fail to make progress for two rounds, then set plan.status to wait.",
                    },
                  ],
                },
              });
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

      // Prefer full claw hook auto-claw context (includes skill loading,
      // workflowGuidance, and plan recovery)
      if (clawSessionContext) {
        output.system.push(clawSessionContext);
        return;
      }

      // Fallback: static text when claw hook auto-claw was unavailable
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
