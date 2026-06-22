import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import type { Plugin } from "@opencode-ai/plugin";

/**
 * claw-kit OpenCode adapter plugin.
 *
 * Four injection surfaces:
 *   1. shell.env — inject CLAW_HOST + CLAW_GUIDANCE_CONFIG into all shell executions
 *   2. event(session.created) — detect .claw/ project, run claw context for recovery
 *   3. experimental.chat.system.transform — inject recovered state into system prompt
 *   4. event(session.idle) — goal continuation: advance agent when plan.status is process.active
 */

const ADAPTER_DIR = import.meta.dirname ?? path.dirname(new URL("", import.meta.url).pathname);
const GUIDANCE_CONFIG_PATH = path.join(ADAPTER_DIR, "..", "workflow-guidance.opencode.json");

let recoveredState: string | null = null;
const sessionPlans = new Map<string, { planPath: string; projectDir: string }>();

function hasClawProject(dir: string): boolean {
  return existsSync(path.join(dir, ".claw"));
}

function runClaw(command: string, cwd: string): string {
  try {
    return execSync(command, {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        CLAW_HOST: "opencode",
        ...(existsSync(GUIDANCE_CONFIG_PATH) ? { CLAW_GUIDANCE_CONFIG: GUIDANCE_CONFIG_PATH } : {}),
      },
      timeout: 30000,
    }).trim();
  } catch {
    return "";
  }
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

export const ClawKitPlugin: Plugin = async ({ client, directory }) => {
  const projectDir = directory;

  return {
    "shell.env": async (_input, output) => {
      output.env.CLAW_HOST = "opencode";
      if (existsSync(GUIDANCE_CONFIG_PATH)) {
        output.env.CLAW_GUIDANCE_CONFIG = GUIDANCE_CONFIG_PATH;
      }
    },

    event: async ({ event }) => {
      if (event.type === "session.created") {
        const sessionID = (event.properties as { sessionID?: string }).sessionID;
        if (!sessionID || !hasClawProject(projectDir)) return;

        const contextResult = runClaw("claw context", projectDir);
        if (contextResult) {
          recoveredState = contextResult;
        }

        const planPath = resolveActivePlanPath(projectDir);
        if (planPath) {
          sessionPlans.set(sessionID, { planPath, projectDir });
        }
      }

      if (event.type === "session.idle") {
        const sessionID = (event.properties as { sessionID?: string }).sessionID;
        if (!sessionID) return;

        const planBinding = sessionPlans.get(sessionID);
        if (!planBinding) return;

        const status = readPlanStatus(planBinding.planPath);
        if (!status || status !== "process.active") return;

        await client.session.promptAsync({
          body: {
            sessionID,
            message: {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "\u5f53\u524dplan\u8fd8\u672a\u6267\u884c\u5b8c\u6bd5\uff0c\u9700\u8981\u7ee7\u7eed\u63a8\u8fdb\u3002\u5982\u679c\u8fde\u7eed\u4e24\u8f6e\u90fd\u6ca1\u6709\u63a8\u8fdb\u6210\u529f\uff0c\u90a3\u4e48\u628a plan.status \u8bbe\u7f6e\u4e3await",
                },
              ],
            },
          },
        });
      }
    },

    "experimental.chat.system.transform": async (_input, output) => {
      if (!recoveredState) return;
      output.system.push(
        "## claw-kit project context\n\nYou are in a claw-kit project. Use the claw-kit workflow:\n- Start with the using-claw-kit skill\n- Use claw plan write to create task scope\n- Follow returned workflowGuidance\n- Use claw search for project recall\n\nRecovered context:\n" + recoveredState,
      );
    },
  };
};

export default ClawKitPlugin;