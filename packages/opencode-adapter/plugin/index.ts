import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
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

// Resolve the adapter directory (where this plugin file lives, after install).
// The workflow-guidance.opencode.json sits alongside the plugin entry.
const ADAPTER_DIR = import.meta.dirname ?? path.dirname(new URL("", import.meta.url).pathname);
const GUIDANCE_CONFIG_PATH = path.join(ADAPTER_DIR, "..", "workflow-guidance.opencode.json");

// Recovered state cache for the current session.
let recoveredState: string | null = null;

// Session-to-plan binding: which session has an active plan.
const sessionPlans = new Map<string, { planPath: string; projectDir: string }>();

function getProjectDir(directory: string): string {
  return directory;
}

function hasClawProject(dir: string): boolean {
  return existsSync(path.join(dir, ".claw"));
}

async function runClaw(
  $: Plugin extends never ? never : Awaited<Parameters<NonNullable<Parameters<Plugin>[0]["$"]>>[0],
  command: string,
  cwd: string,
): Promise<string> {
  try {
    const result = await $({ cmd: [command], cwd }).quiet();
    return result.stdout.toString();
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

  // Look for active task directories
  try {
    const entries = readFileSync(path.join(clawDir, "task-meta.json"), "utf8");
    const meta = JSON.parse(entries);
    if (meta.activeTaskName) {
      return path.join(clawDir, meta.activeTaskName, "plan.json");
    }
  } catch {
    // task-meta.json may not exist
  }

  // Fallback: check default plan.json
  const defaultPlan = path.join(clawDir, "plan.json");
  if (existsSync(defaultPlan)) return defaultPlan;

  return null;
}

export const ClawKitPlugin: Plugin = async ({ client, $, directory }) => {
  const projectDir = getProjectDir(directory);

  return {
    // (1) Inject environment variables into all shell executions
    "shell.env": async (_input, output) => {
      output.env.CLAW_HOST = "opencode";
      if (existsSync(GUIDANCE_CONFIG_PATH)) {
        output.env.CLAW_GUIDANCE_CONFIG = GUIDANCE_CONFIG_PATH;
      }
    },

    // (2) Session start detection + (4) Goal continuation
    event: async ({ event }) => {
      // Session created: run recovery
      if (event.type === "session.created") {
        const sessionID = (event.properties as { sessionID?: string }).sessionID;
        if (!sessionID || !hasClawProject(projectDir)) return;

        // Run claw context for recovery
        const contextResult = await runClaw($ as never, "claw context", projectDir);

        // Detect active plan
        const planPath = resolveActivePlanPath(projectDir);
        if (planPath) {
          sessionPlans.set(sessionID, { planPath, projectDir });
        }

        // Cache recovered state for system.transform
        if (contextResult) {
          recoveredState = contextResult;
        }
      }

      // Session idle: goal continuation
      if (event.type === "session.idle") {
        const sessionID = (event.properties as { sessionID?: string }).sessionID;
        if (!sessionID) return;

        const planBinding = sessionPlans.get(sessionID);
        if (!planBinding) return; // no plan bound to this session

        const status = readPlanStatus(planBinding.planPath);
        if (!status || status !== "process.active") return;

        // Send continuation prompt
        await client.session.promptAsync({
          body: {
            sessionID,
            message: {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "当前plan还未执行完毕，需要继续推进。如果连续两轮都没有推进成功，那么把 plan.status 设置为wait",
                },
              ],
            },
          },
        });
      }
    },

    // (3) Inject recovered state into system prompt
    "experimental.chat.system.transform": async (_input, output) => {
      if (!recoveredState) return;
      output.system.push(
        `## claw-kit project context\n\nYou are in a claw-kit project. Use the claw-kit workflow:\n- Start with the using-claw-kit skill\n- Use \`claw plan write\` to create task scope\n- Follow returned workflowGuidance\n- Use \`claw search\` for project recall\n\nRecovered context:\n${recoveredState}`,
      );
    },
  };
};

export default ClawKitPlugin;