import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

let bufferedHookInput: string | null = null;

export async function shouldLoadCliForInvocation(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<boolean> {
  if (!isKnowledgeHookInvocation(args)) {
    return true;
  }
  if (env.CLAW_KNOWLEDGE_FINALIZER === "1") {
    return false;
  }
  if (!resolveCurrentClawDir(cwd)) {
    return false;
  }

  const rawInput = await readStdin();
  if (!shouldRunKnowledgeHook(rawInput, cwd, env)) {
    return false;
  }

  bufferedHookInput = rawInput;
  return true;
}

export function shouldRunKnowledgeHook(
  rawInput: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
): boolean {
  const payload = parseHookPayload(rawInput);
  const hookCwd = readHookString(payload, "cwd") ?? cwd.trim();
  const sessionId = resolveSessionId(payload, env);
  if (!hookCwd || !sessionId) {
    return false;
  }

  const clawDir = resolveCurrentClawDir(hookCwd);
  if (!clawDir || !hasKnowledgeContext(clawDir, sessionId)) {
    return false;
  }
  return true;
}

export function consumeBufferedHookInput(): string | null {
  const input = bufferedHookInput;
  bufferedHookInput = null;
  return input;
}

function isKnowledgeHookInvocation(args: string[]): boolean {
  const positional: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--host") {
      index += 1;
      continue;
    }
    positional.push(args[index] as string);
  }
  return positional[0] === "hook" && (positional[1] === "auto-doc" || positional[1] === "Stop");
}

async function readStdin(): Promise<string> {
  const chunks: string[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
  }
  return chunks.join("");
}

function parseHookPayload(rawInput: string): Record<string, unknown> | null {
  const raw = rawInput.trim();
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function resolveSessionId(payload: Record<string, unknown> | null, env: NodeJS.ProcessEnv): string | null {
  for (const candidate of [env.CODEX_THREAD_ID, env.CODEX_SESSION_ID, readHookString(payload, "session_id")]) {
    if (candidate?.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

function readHookString(payload: Record<string, unknown> | null, key: string): string | null {
  const value = payload?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resolveCurrentClawDir(cwd: string): string | null {
  try {
    const candidate = path.join(path.resolve(cwd), ".claw");
    return fs.statSync(candidate).isDirectory() ? candidate : null;
  } catch {
    return null;
  }
}

function hasKnowledgeContext(clawDir: string, sessionId: string): boolean {
  const knowledgeKey = createHash("sha256").update(sessionId).digest("hex");
  const knowledgeRegistryPath = path.join(
    clawDir,
    "runtime",
    "knowledge-sessions",
    `${knowledgeKey}.json`,
  );
  return registryHasKnowledgeTarget(knowledgeRegistryPath, sessionId);
}

function registryHasKnowledgeTarget(registryPath: string, sessionId: string): boolean {
  try {
    const registry = JSON.parse(fs.readFileSync(registryPath, "utf8")) as {
      sessionId?: unknown;
      activePlanPath?: unknown;
      activeReportPath?: unknown;
      pendingTurnOwner?: unknown;
    };
    if (registry.sessionId !== sessionId) {
      return false;
    }
    return Boolean(
      registry.pendingTurnOwner
      || (typeof registry.activePlanPath === "string" && typeof registry.activeReportPath === "string"),
    );
  } catch {
    return false;
  }
}
