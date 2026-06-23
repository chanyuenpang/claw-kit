import { execSync } from "node:child_process";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import type { Plugin } from "@opencode-ai/plugin";
import type { Part } from "@opencode-ai/sdk";

/**
 * claw-kit OpenCode adapter plugin.
 *
 * Five injection surfaces:
 *   1. shell.env — inject CLAW_HOST + CLAW_GUIDANCE_CONFIG into all shell executions
 *   2. event(session.created) + event(session.compacted) — one-shot init: detect .claw/,
 *      call claw hook SessionStart. Compaction re-runs because the prior system prompt
 *      injection is lost when the context window is compressed.
 *   3. chat.message — prepend claw context as a synthetic text part to the session's first
 *      user message. LLMs attend to user messages far more than system prompts, so this is
 *      the primary injection. Guarded by injectedSessions so it only fires once per session.
 *   4. experimental.chat.system.transform — push cached claw context into system prompt.
 *      Retained as a compaction fallback: after context compression the synthetic part may
 *      be summarized away, so the system prompt re-establishes claw context.
 *   5. event(session.idle) — goal continuation: advance agent when plan.status is process.active
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
 * Invoke `claw hook SessionStart` to get the full dynamic context that claw CLI
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
    const stdout = execSync("claw hook SessionStart", {
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

export const ClawKitPlugin: Plugin = async ({ client, directory }) => {
  const projectDir = directory;

  /**
   * One-shot initialization: detect .claw/ project, invoke claw hook SessionStart,
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
    "shell.env": async (_input, output) => {
      output.env.CLAW_HOST = "opencode";
      if (existsSync(GUIDANCE_CONFIG_PATH)) {
        output.env.CLAW_GUIDANCE_CONFIG = GUIDANCE_CONFIG_PATH;
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

      // Goal continuation
      if (event.type === "session.idle") {
        const sessionID = (event.properties as { sessionID?: string }).sessionID;
        if (!sessionID) return;

        const planBinding = sessionPlans.get(sessionID);
        if (!planBinding) return;

        const status = readPlanStatus(planBinding.planPath);
        if (!status || status !== "process.active") return;

        await client.session.promptAsync({
          path: { id: sessionID },
          body: {
            parts: [
              {
                type: "text",
                text: "\u5f53\u524dplan\u8fd8\u672a\u6267\u884c\u5b8c\u6bd5\uff0c\u9700\u8981\u7ee7\u7eed\u63a8\u8fdb\u3002\u5982\u679c\u8fde\u7eed\u4e24\u8f6e\u90fd\u6ca1\u6709\u63a8\u8fdb\u6210\u529f\uff0c\u90a3\u4e48\u628a plan.status \u8bbe\u7f6e\u4e3await",
              },
            ],
          },
        });
      }
    },

    // (3) Inject claw context as a synthetic user-message text part (primary injection).
    // LLMs attend to user messages far more strongly than system prompts, so the claw
    // workflow context is prepended to the first user message of each session. The
    // injectedSessions guard ensures this only fires once per session.
    "chat.message": async (input, output) => {
      // Skip when there is nothing to inject (non-.claw project, or claw CLI unavailable)
      if (!inClawProject) return;
      // Capture into a local const so the narrowing survives the subsequent calls;
      // module-level `let` narrowing would otherwise be invalidated by injectedSessions use.
      const context = clawSessionContext;
      if (!context) return;
      // First-message guard: inject once per session, never repeat
      if (injectedSessions.has(input.sessionID)) return;
      injectedSessions.add(input.sessionID);

      // Prepend claw context as a synthetic text part. opencode auto-fills
      // id/sessionID/messageID on persistence, so only type/text/synthetic are set;
      // synthetic:true keeps the UI collapsed while the LLM still sees the text.
      output.parts.unshift({
        type: "text",
        text: context,
        synthetic: true,
      } as unknown as Part);
    },

    // (4) Inject recovered state into system prompt — compaction fallback
    "experimental.chat.system.transform": async (_input, output) => {
      // Unconditional: inject claw workflow context whenever inside a .claw project
      if (!inClawProject) return;

      // Prefer full claw hook SessionStart context (includes skill loading,
      // workflowGuidance, and plan recovery)
      if (clawSessionContext) {
        output.system.push(clawSessionContext);
        return;
      }

      // Fallback: static text when claw hook SessionStart was unavailable
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
      lines.push("Use claw plan create to create task scope when none exists.");
      lines.push("Follow the claw workflowGuidance return fields as the required next-step contract.");
      lines.push("Use claw search for project recall.");
      lines.push("");

      // Conditional: append active plan summary if recovered
      if (recoveredState) {
        lines.push("Active plan:");
        lines.push(recoveredState);
      }

      output.system.push(lines.join("\n"));
    },
  };
};

export default ClawKitPlugin;
