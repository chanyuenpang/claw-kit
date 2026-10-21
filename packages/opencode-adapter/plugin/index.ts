import { serializeFailure } from "./failure-diagnostics.js";
import { execSync } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
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
 *      two unchanged task endings pause local continuation, not the plan.
 */

const ADAPTER_DIR = import.meta.dirname ?? path.dirname(new URL("", import.meta.url).pathname);
const GUIDANCE_CONFIG_PATH = path.join(ADAPTER_DIR, "..", "workflow-guidance.opencode.json");
const OPENCODE_HOST_IDENTITY = "[claw host]\nplatform: opencode\nAdapter-owned host identity, independent of model/provider or skill path. Host/session arguments remain adapter-owned.";

/** A new writer runtime must not inherit the foreground or another host's session. */
export function openCodeWriterEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...source, CLAW_HOST: "opencode", CLAW_KNOWLEDGE_FINALIZER: "1" };
  delete env.CLAW_SESSION_ID;
  delete env.CODEX_THREAD_ID;
  delete env.CODEX_SESSION_ID;
  return env;
}

type GoalSession = {
  taskId: number | null;
  retryCount: number;
  attemptPending: boolean;
  continuationQueued: boolean;
  pausing?: boolean;
};
function hasClawProject(dir: string): boolean {
  return existsSync(path.join(dir, ".claw"));
}

/**
 * Invoke the host-neutral `claw context` entry and render the OpenCode prompt
 * locally. The CLI returns state only; platform Hook output belongs here.
 *   - skill loading directive
 *   - workflowGuidance contract
 *   - active plan recovery (when a plan exists)
 *
 * This replaces the previous hardcoded static text in experimental.chat.system.transform.
 * Returns null when the CLI is unavailable; an uninitialized workspace returns empty context.
 */
function invokeClawSessionStart(projectDir: string, sessionID: string): Record<string, unknown> | null {
  try {
    const stdout = execSync("claw context --host opencode", {
      cwd: projectDir,
      encoding: "utf8",
      timeout: 10_000,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...openCodeWriterEnvironment(process.env),
        CLAW_KNOWLEDGE_FINALIZER: "0",
        CLAW_SESSION_ID: sessionID,
        CLAW_HOST: "opencode",
        ...(existsSync(GUIDANCE_CONFIG_PATH) ? { CLAW_GUIDANCE_CONFIG: GUIDANCE_CONFIG_PATH } : {}),
      },
    });
    if (!stdout.trim()) return null;
    return JSON.parse(stdout);
  } catch (error) {
    console.warn("[claw-kit] context recovery warning:", JSON.stringify(serializeFailure(error, { fallbackCode: "OPENCODE_CONTEXT_FAILED", origin: "opencode", operation: "context", fallbackOutcome: "unknown" })));
    return null;
  }
}

function renderClawSessionStart(context: Record<string, unknown>): string {
  const error = context.error as { prompt?: unknown } | undefined;
  const runtimePrompt = typeof error?.prompt === "string" ? error.prompt.trim() : "";
  const workflow = context.activeWorkflow;
  if (workflow && typeof workflow === "object") {
    return [
      OPENCODE_HOST_IDENTITY,
      runtimePrompt,
      "Claw workflow snapshot is recovered. Treat `workflowGuidance` as the only next-step contract.",
      JSON.stringify(workflow),
    ].filter(Boolean).join("\n\n");
  }
  const project = context.project as { projectName?: unknown; projectId?: unknown } | undefined;
  if (!project) return [OPENCODE_HOST_IDENTITY, runtimePrompt, "Load claw-kit:using-claw-kit. Small tasks may run directly without a plan. Creating a plan initializes the project automatically; claw init is optional explicit setup."].filter(Boolean).join("\n\n");
  const projectName = typeof project.projectName === "string" ? project.projectName : project.projectId;
  return [
    OPENCODE_HOST_IDENTITY,
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
        ...openCodeWriterEnvironment(process.env),
        CLAW_KNOWLEDGE_FINALIZER: "0",
        CLAW_SESSION_ID: payload.session_id,
        CLAW_HOST: "opencode",
        CLAW_KNOWLEDGE_FINALIZER_DISABLE_LAUNCH: "1",
        CLAW_KNOWLEDGE_CAPTURE_RESULT: "1",
        ...(existsSync(GUIDANCE_CONFIG_PATH) ? { CLAW_GUIDANCE_CONFIG: GUIDANCE_CONFIG_PATH } : {}),
      },
    });
    const parsed = JSON.parse(stdout) as { ok?: boolean; error?: unknown; jobPath?: unknown; finalizeId?: unknown };
    if (parsed.ok === false) throw parsed.error ?? new Error("Report capture failed without error details");
    return {
      ...(typeof parsed.jobPath === "string" ? { jobPath: parsed.jobPath } : {}),
      ...(typeof parsed.finalizeId === "string" ? { finalizeId: parsed.finalizeId } : {}),
    };
  } catch (error) {
    console.warn("[claw-kit] report capture warning:", JSON.stringify(serializeFailure(error, { fallbackCode: "OPENCODE_CAPTURE_FAILED", origin: "opencode", operation: "report.capture", fallbackOutcome: "unknown" })));
    return null;
  }
}

type Execution = { parentSessionId: string; childSessionId?: string; messageId: string; state: string };
type ExecutionView = { finalizeId: string; jobPath: string; status: string; execution?: Execution; error?: string; claimed?: boolean };
type ExecutionResult = { execute?: boolean; execution?: Execution; executions?: ExecutionView[] };

function executionCommand(projectDir: string, sessionID: string, action: string, finalizeId?: string, childSessionId?: string): ExecutionResult {
  const args = ["claw internal-opencode-finalizer-execution --host opencode --action", action];
  // These are host/Core identifiers, never free-form model text.
  for (const [flag, value] of [["--finalize-id", finalizeId], ["--child-session-id", childSessionId]]) {
    if (value) {
      if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error("Invalid native execution identifier");
      args.push(flag!, value);
    }
  }
  return JSON.parse(execSync(args.join(" "), { cwd: projectDir, encoding: "utf8", timeout: 30_000,
    stdio: ["ignore", "pipe", "pipe"], env: { ...openCodeWriterEnvironment(process.env), CLAW_SESSION_ID: sessionID } }));
}

/** SDK error values are failures even when the promise resolves. */
function sdkData<T>(result: { data?: T; error?: unknown }): T | undefined {
  if (result.error !== undefined) throw result.error;
  return result.data;
}

export async function dispatchOpenCodeKnowledgeWriter(
  client: Parameters<Plugin>[0]["client"], projectDir: string, parentSessionId: string, jobPath: string, finalizeId: string,
): Promise<void> {
  let attempted = false;
  let phase = "knowledge.bootstrap";
  let rejected = false;
  try {
    const handoff = JSON.parse(execSync(`claw internal-knowledge-dispatch --job ${JSON.stringify(jobPath)}`, {
      cwd: projectDir, encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"],
      env: { ...openCodeWriterEnvironment(process.env), CLAW_SESSION_ID: parentSessionId },
    })) as { dispatch?: { prompt?: string }; writer?: { model?: string; reasoningEffort?: string } };
    if (!handoff.dispatch?.prompt) throw new Error("Missing canonical writer bootstrap");
    phase = "session.get";
    const parent = sdkData(await client.session.get({ path: { id: parentSessionId }, query: { directory: projectDir } }));
    if (!parent) throw new Error("Parent session is unavailable");
    const reservation = executionCommand(projectDir, parentSessionId, "reserve", finalizeId);
    if (!reservation.execute) return;
    attempted = true;
    // v1 SDK's older create type omits permission, but the server accepts it.
    // Copy parent rules explicitly: parentID alone does not inherit permissions.
    const body = { parentID: parentSessionId, title: "claw knowledge " + finalizeId,
      permission: (parent as typeof parent & { permission?: unknown[] }).permission ?? [] };
    phase = "session.create";
    const creation = await client.session.create({ query: { directory: projectDir }, body });
    if (creation.error !== undefined) {
      rejected = true;
      executionCommand(projectDir, parentSessionId, "rejected", finalizeId);
    }
    const child = sdkData(creation);
    if (!child?.id) throw new Error("Native child creation outcome is unknown");
    executionCommand(projectDir, parentSessionId, "bind", finalizeId, child.id);
    const delivery = executionCommand(projectDir, parentSessionId, "attempt", finalizeId);
    if (!delivery.execute || !delivery.execution) return;
    const modelParts = handoff.writer?.model?.split("/");
    phase = "session.promptAsync";
    const result = await client.session.promptAsync({ path: { id: child.id }, query: { directory: projectDir }, body: {
      agent: "claw-knowledge-writer", messageID: delivery.execution.messageId,
      ...(modelParts && modelParts.length >= 2 ? { model: { providerID: modelParts[0], modelID: modelParts.slice(1).join("/") } } : {}),
      ...(handoff.writer?.reasoningEffort ? { variant: handoff.writer.reasoningEffort } : {}),
      parts: [{ type: "text", text: handoff.dispatch.prompt }],
    } });
    rejected = result.error !== undefined;
    executionCommand(projectDir, parentSessionId, rejected ? "rejected" : "accepted", finalizeId);
    if (result.error !== undefined) throw result.error;
    console.info("[claw-kit] knowledge writer accepted; completion remains pending:", finalizeId);
  } catch (error) {
    if (attempted) {
      try { executionCommand(projectDir, parentSessionId, "unknown", finalizeId); } catch { /* durable attempted state already forbids replay */ }
    }
    console.warn("[claw-kit] native writer warning:", JSON.stringify(serializeFailure(error, { fallbackCode: "OPENCODE_" + phase.replaceAll(".", "_").toUpperCase() + "_FAILED", origin: "opencode", operation: phase, fallbackOutcome: rejected ? "known" : "unknown" })));
  }
}

async function invokeOpenCodeContinuation(
  client: Parameters<Plugin>[0]["client"],
  projectDir: string,
  sessionId: string,
): Promise<boolean> {
  try {
    const result = await client.session.promptAsync({
      path: { id: sessionId },
      query: { directory: projectDir },
      body: {
        parts: [{
          type: "text",
          text: "继续执行当前 claw 计划：遵循 claw-kit workflow guidance，完成当前任务后记录状态；只有计划进入暂停、讨论或终态时才停止。",
        }],
      },
    });
    sdkData(result);
    return true;
  } catch {
    return false;
  }
}

export const ClawKitPlugin: Plugin = async ({ directory, client }) => {
  const projectDir = directory;

  const injectedSessions = new Set<string>();
  const lastAssistantMessageBySession = new Map<string, string>();
  const assistantTextByMessage = new Map<string, string>();
  const goalSessions = new Map<string, GoalSession>();
  const contexts = new Map<string, { projectPresent: boolean; value: Record<string, unknown> | null }>();
  const isClawProject = () => hasClawProject(projectDir);

  const writerSessions = new Set<string>();
  const reportedExecutions = new Map<string, string>();
  function isWriter(sessionID: string): boolean {
    if (writerSessions.has(sessionID)) return true;
    if (!isClawProject()) return false;
    // Negative results are not cached: create events can precede the durable bind.
    let views: ExecutionView[];
    try {
      views = executionCommand(projectDir, sessionID, "inspect").executions ?? [];
    } catch (error) {
      console.warn("[claw-kit] writer classification unavailable; suppressing claw automation for this event:", JSON.stringify(serializeFailure(error, { fallbackCode: "OPENCODE_EXECUTION_INSPECT_FAILED", origin: "opencode", operation: "knowledge.inspect", fallbackOutcome: "unknown" })));
      // Do not throw through the host shell hook or risk recursive capture.
      // This conservative result is event-local, never cached as a writer.
      return true;
    }
    for (const view of views) {
      if (view.execution?.childSessionId === sessionID) writerSessions.add(sessionID);
      const signature = JSON.stringify([view.status, view.execution?.state, view.error]);
      if (reportedExecutions.get(view.finalizeId) !== signature) {
        reportedExecutions.set(view.finalizeId, signature);
        console.info("[claw-kit] knowledge recovery:", JSON.stringify({ finalizeId: view.finalizeId, status: view.status,
          delivery: view.execution?.state, error: view.error, note: "Canonical status only; pending/unknown delivery is never resent." }));
      }
    }
    return writerSessions.has(sessionID);
  }

  function contextFor(sessionID: string, refresh = false): Record<string, unknown> | null {
    if (isWriter(sessionID)) return null;
    const projectPresent = isClawProject();
    const cached = contexts.get(sessionID);
    if (refresh || !cached || cached.projectPresent !== projectPresent) {
      injectedSessions.delete(sessionID);
      const value = invokeClawSessionStart(projectDir, sessionID);
      contexts.set(sessionID, { projectPresent, value });
      return value;
    }
    return cached.value;
  }

  return {
    // (1) Inject environment variables into all shell executions
    // Agent's bash tool calls to claw CLI will automatically carry these
    "shell.env": async (input, output) => {
      output.env.CLAW_HOST = "opencode";
      output.env.CLAW_KNOWLEDGE_FINALIZER = input.sessionID && isWriter(input.sessionID) ? "1" : "0";
      if (existsSync(GUIDANCE_CONFIG_PATH)) {
        output.env.CLAW_GUIDANCE_CONFIG = GUIDANCE_CONFIG_PATH;
      }
      // Bind claw commands to the current opencode session so that
      // plan create/done and other lifecycle operations can resolve the
      // session owner key for knowledge capture.
      if (input.sessionID) {
        output.env.CLAW_SESSION_ID = input.sessionID;
        delete output.env.CODEX_THREAD_ID;
        delete output.env.CODEX_SESSION_ID;
      }
    },

    // (2) Session start (new + compacted) + (5) Goal continuation
    event: async ({ event }) => {
      // New session: initialize claw context
      if (event.type === "session.created") {
        const sessionID = (event.properties as { info?: { id?: string } })?.info?.id;
        if (sessionID) contextFor(sessionID, true);
      }

      // Compaction: system prompt injection is lost after context compression,
      // so re-initialize to re-inject claw context into subsequent prompts
      if (event.type === "session.compacted") {
        const sessionID = (event.properties as { sessionID?: string }).sessionID;
        if (sessionID) contextFor(sessionID, true);
      }

      // Track the latest assistant message text per session so session.idle can
      // hand the turn's final assistant message to claw knowledge report capture.
      if (isClawProject() && event.type === "message.updated") {
        const props = event.properties as {
          sessionID?: string;
          info?: { id?: string; role?: string; sessionID?: string };
        };
        const messageSessionID = props.info?.sessionID ?? props.sessionID;
        if (props.info?.id && props.info.role === "assistant" && messageSessionID) {
          lastAssistantMessageBySession.set(messageSessionID, props.info.id);
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
          if (isWriter(sessionID)) return;
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
              await dispatchOpenCodeKnowledgeWriter(client, projectDir, sessionID, captured.jobPath, captured.finalizeId);
            }
            assistantTextByMessage.delete(assistantMessageId);
            lastAssistantMessageBySession.delete(sessionID);
          }

          const workflow = contextFor(sessionID, true)?.activeWorkflow as { planStatus?: string; workflowGuidance?: { nextTask?: { id?: number } } } | undefined;
          const planState = workflow ? { status: workflow.planStatus, taskId: workflow.workflowGuidance?.nextTask?.id ?? null } : null;
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
              console.warn("[claw-kit] automatic continuation paused for this session; canonical plan state is unchanged.");
              return;
            }
          }

          if (goal.continuationQueued) return;
          goal.continuationQueued = true;
          goal.attemptPending = true;
          const dispatched = await invokeOpenCodeContinuation(client, projectDir, sessionID);
          if (!dispatched) {
            goal.pausing = true;
            console.warn("[claw-kit] continuation delivery failed or is unknown; no automatic resend. Canonical plan is unchanged.");
          }
        }
      }
    },

    // (3) Inject claw context as a synthetic user-message text part (primary injection).
    // LLMs attend to user messages far more strongly than system prompts, so the claw
    // workflow context is prepended to the first user message of each session. The
    // injectedSessions guard ensures this only fires once per session.
    "chat.message": async (input, output) => {
      if (isWriter(input.sessionID)) return;
      const context = renderClawSessionStart(contextFor(input.sessionID) ?? {});
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
    "experimental.chat.system.transform": async (input, output) => {
      if (input.sessionID && isWriter(input.sessionID)) { output.system.push(OPENCODE_HOST_IDENTITY); return; }
      output.system.push(renderClawSessionStart(input.sessionID ? contextFor(input.sessionID) ?? {} : {}));
    },
  };
};

export default ClawKitPlugin;
