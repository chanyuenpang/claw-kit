import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { shouldRunKnowledgeHook } from "../dist/knowledge-hook-preflight.js";
import { opencodeKnowledgeFinalizerEnvironment, parseOpencodeRunOutput } from "../dist/opencode-runner.js";
import { resolveInvocationHost, withoutInvocationHost } from "../dist/invocation-host.js";
import { CODEX_SDK_VERSION } from "../dist/codex-runtime.js";
import { resolveSessionWorkflowContext, tryEndKnowledgePlan } from "@veewo/claw-core";

export type JsonRecord = Record<string, unknown>;
export const thisDir = path.dirname(fileURLToPath(import.meta.url));
export const cliPackageVersion = String(
  (JSON.parse(fs.readFileSync(path.resolve(thisDir, "..", "package.json"), "utf-8")) as { version: string }).version,
);

export const temporaryDirectories = new Set<string>();

export function createTemporaryDirectory(prefix: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.add(directory);
  return directory;
}

export function createFixture(name: string): string {
  return createTemporaryDirectory(`claw-kit-cli-${name}-`);
}

after(() => {
  for (const directory of temporaryDirectories) {
    try {
      fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EPERM" && (error as NodeJS.ErrnoException).code !== "EBUSY") {
        throw error;
      }
      // Detached completion workers can briefly retain a Windows directory
      // handle after all behavioral assertions have completed.
    }
  }
});

export function localDateDirectory(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Locate a task created by the CLI, regardless of its date-scoped layout. */
export function taskDirectory(root: string, taskName: string): string {
  const tasksRoot = path.join(root, ".claw", "tasks");
  const legacy = path.join(tasksRoot, taskName);
  if (fs.existsSync(legacy)) return legacy;
  const dated = fs.readdirSync(tasksRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
    .map((entry) => path.join(tasksRoot, entry.name, taskName))
    .find((candidate) => fs.existsSync(candidate));
  if (!dated) throw new Error(`Task directory not found: ${taskName}`);
  return dated;
}

export function taskFile(root: string, taskName: string, fileName: string): string {
  return path.join(taskDirectory(root, taskName), fileName);
}

export function taskFinalizerJobsDirectory(root: string, taskName: string): string {
  return path.join(taskDirectory(root, taskName), ".runtime", "knowledge-finalization");
}

export function createPlanLikeTemplate(params: {
  id: string;
  scope?: "session";
  configOverride?: Record<string, unknown>;
  title?: string;
  status?: string;
  goalText?: string;
  tasks: Array<Record<string, unknown>>;
  references?: Array<{ path: string; why: string }>;
  rules?: string[];
  keyDecisions?: string[];
  retrospectiveSummary?: string;
}): Record<string, unknown> {
  return {
    id: params.id,
    version: cliPackageVersion,
    ...(params.scope ? { scope: params.scope } : {}),
    ...(params.configOverride ? { configOverride: params.configOverride } : {}),
    ...(params.title ? { title: params.title } : {}),
    status: params.status ?? "process.discussing",
    goal: {
      text: params.goalText ?? "",
    },
    requirements: {
      summary: "",
      openQuestions: [],
      acceptanceCriteria: [],
    },
    tasks: params.tasks,
    references: params.references ?? [],
    rules: params.rules ?? [],
    keyDecisions: params.keyDecisions ?? [],
    retrospective: {
      summary: params.retrospectiveSummary ?? "",
    },
  };
}

// Host adapter hooks (e.g. the opencode plugin shell.env) can inject CLAW_HOST
// and CLAW_GUIDANCE_CONFIG into the test runner's environment. When these leak
// into spawned `claw` processes, they alter workflow guidance behavior (host
// gating, stale config) and pollute assertions. Strip them by default so tests
// exercise core's bundled defaults unless a test explicitly opts in via `env`.
export const ISOLATED_ENV_KEYS = [
  "CLAW_HOST",
  "CLAW_GUIDANCE_CONFIG",
  "CODEX_THREAD_ID",
  "CODEX_SESSION_ID",
] as const;

export function buildSpawnEnv(extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CLAW_EMBEDDING_WARMUP_DISABLE_LAUNCH: "1",
  };
  for (const key of ISOLATED_ENV_KEYS) {
    delete env[key];
  }
  return { ...env, ...extra };
}

export function runClaw(args: string[], cwd: string, env?: NodeJS.ProcessEnv, input?: string): JsonRecord {
  const cliPath = path.resolve(thisDir, "..", "dist", "bin.js");
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    env: buildSpawnEnv(env),
    encoding: "utf-8",
    windowsHide: true,
    ...(input !== undefined ? { input } : {}),
  });

  if (result.status !== 0) {
    throw new Error(`claw ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }

  return JSON.parse(result.stdout) as JsonRecord;
}

export function runClawExpectFailure(args: string[], cwd: string, env?: NodeJS.ProcessEnv): JsonRecord {
  const cliPath = path.resolve(thisDir, "..", "dist", "bin.js");
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    env: buildSpawnEnv(env),
    encoding: "utf-8",
    windowsHide: true,
  });

  if (result.status === 0) {
    throw new Error(`claw ${args.join(" ")} unexpectedly succeeded\nstdout:\n${result.stdout}`);
  }

  const match = result.stderr.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`claw ${args.join(" ")} failed without JSON stderr\nstderr:\n${result.stderr}`);
  }

  return JSON.parse(match[0]) as JsonRecord;
}

export function runClawRaw(args: string[], cwd: string, env?: NodeJS.ProcessEnv): { status: number | null; stdout: string; stderr: string } {
  const cliPath = path.resolve(thisDir, "..", "dist", "bin.js");
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    env: buildSpawnEnv(env),
    encoding: "utf-8",
    windowsHide: true,
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

export function runGit(args: string[], cwd: string): string {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf-8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return result.stdout;
}

export function runClawHook(
  eventName: string,
  cwd: string,
  payload: Record<string, unknown>,
  env?: NodeJS.ProcessEnv,
): { status: number | null; stdout: string; stderr: string } {
  const cliPath = path.resolve(thisDir, "..", "dist", "bin.js");
  const result = spawnSync(process.execPath, [cliPath, "hook", eventName], {
    cwd,
    env: buildSpawnEnv(env),
    encoding: "utf-8",
    windowsHide: true,
    input: JSON.stringify(payload),
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

export async function waitForCompletionRefreshStatus(statusFile: string, timeoutMs = 15000): Promise<JsonRecord> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (fs.existsSync(statusFile)) {
      const raw = fs.readFileSync(statusFile, "utf-8").trim();
      if (raw) {
        const payload = JSON.parse(raw) as JsonRecord;
        if ("finishedAt" in payload) {
          return payload;
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Timed out waiting for completion refresh status file: ${statusFile}`);
}

export async function waitForCondition(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for condition after ${timeoutMs}ms.`);
}

export function getLatestCompletionRefreshStatusFile(root: string): string | null {
  return getCompletionRefreshStatusFiles(root)[0] ?? null;
}

export function getCompletionRefreshStatusFiles(root: string): string[] {
  const logDir = path.join(root, ".claw", "logs", "completion-refresh");
  if (!fs.existsSync(logDir)) {
    return [];
  }
  return fs
    .readdirSync(logDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(logDir, entry.name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
}

export async function waitForLatestCompletionRefreshStatus(root: string, timeoutMs = 15000): Promise<JsonRecord> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const statusFile = getLatestCompletionRefreshStatusFile(root);
    if (statusFile) {
      return waitForCompletionRefreshStatus(statusFile, Math.max(0, deadline - Date.now()));
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Timed out waiting for completion refresh status file under ${root}`);
}

export function createGitnexusShim(mode: "fallback" | "primary" | "lock-once" | "access-violation-once", delayMs = 0): { binDir: string; logPath: string } {
  const binDir = createTemporaryDirectory("claw-kit-gitnexus-bin-");
  const logPath = path.join(binDir, "gitnexus.log");
  const cmdPath = path.join(binDir, "gitnexus.cmd");
const jsPath = path.join(binDir, "gitnexus-shim.js");
  const lockMarkerPath = path.join(binDir, "lock-once.marker");
  const script = `
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(logPath)}, \`\${args.join(" ")}\\n\`);

if (args[0] === "analyze" && ${JSON.stringify(delayMs)} > 0) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ${JSON.stringify(delayMs)});
}

if (args[0] === "analyze" && ${JSON.stringify(mode)} === "lock-once" && !fs.existsSync(${JSON.stringify(lockMarkerPath)})) {
  fs.writeFileSync(${JSON.stringify(lockMarkerPath)}, "locked once\\n", "utf8");
  process.stderr.write("database is locked\\n");
  process.exit(1);
}

if (args[0] === "analyze" && ${JSON.stringify(mode)} === "access-violation-once" && !args.includes("--force")) {
  process.exit(0xc0000005);
}

if (args.includes("--no-ai-context") && ${JSON.stringify(mode)} === "fallback") {
  process.stderr.write("unknown option --no-ai-context\\n");
  process.exit(1);
}

if (args[0] === "analyze" && args.includes("--embeddings")) {
  const metaPath = path.join(process.cwd(), ".gitnexus", "meta.json");
  fs.mkdirSync(path.dirname(metaPath), { recursive: true });
  let meta = {};
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    } catch {
      meta = {};
    }
  }
  meta.analyzeOptions = {
    ...(meta.analyzeOptions || {}),
    embeddings: true,
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\\n", "utf-8");
}
`;
  fs.writeFileSync(jsPath, script, "utf-8");
  fs.writeFileSync(cmdPath, `@echo off\r\n"${process.execPath}" "${jsPath}" %*\r\n`, "utf-8");
  return { binDir, logPath };
}

export function createNpmShim(mode: "fail-install" | "pass"): { binDir: string; logPath: string } {
  const binDir = createTemporaryDirectory("claw-kit-npm-bin-");
  const logPath = path.join(binDir, "npm.log");
  const cmdPath = path.join(binDir, "npm.cmd");
  const jsPath = path.join(binDir, "npm-shim.js");
  const script = `
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(logPath)}, \`\${args.join(" ")}\\n\`);
if (args[0] === "install" && ${JSON.stringify(mode)} === "fail-install") {
  process.stderr.write("install failed\\n");
  process.exit(1);
}
if (args[0] === "root" && args[1] === "-g") {
  process.stdout.write("C:/fake-global-root\\n");
  process.exit(0);
}
process.exit(0);
`;
  fs.writeFileSync(jsPath, script, "utf-8");
  fs.writeFileSync(cmdPath, `@echo off\r\n"${process.execPath}" "${jsPath}" %*\r\n`, "utf-8");
  return { binDir, logPath };
}

export function createClawUpdateNpmShim(options: {
  latestVersion: string;
  failLatestInstall?: boolean;
}): { binDir: string; logPath: string } {
  const binDir = createTemporaryDirectory("claw-kit-claw-update-npm-");
  const logPath = path.join(binDir, "npm.log");
  const cmdPath = path.join(binDir, "npm.cmd");
  const jsPath = path.join(binDir, "npm-shim.js");
  const script = `
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(logPath)}, \`\${args.join(" ")}\\n\`);
if (args[0] === "view" && args[1] === "@veewo/claw" && args[2] === "version") {
  process.stdout.write(${JSON.stringify(options.latestVersion)} + "\\n");
  process.exit(0);
}
if (args[0] === "install" && args[1] === "-g" && args[2] === "@veewo/claw@latest") {
  if (${options.failLatestInstall === true ? "true" : "false"}) {
    process.stderr.write("latest install failed\\n");
    process.exit(1);
  }
  process.exit(0);
}
process.exit(0);
`;
  fs.writeFileSync(jsPath, script, "utf-8");
  fs.writeFileSync(cmdPath, `@echo off\r\n"${process.execPath}" "${jsPath}" %*\r\n`, "utf-8");
  return { binDir, logPath };
}
export {
  test,
  after,
  assert,
  fs,
  os,
  path,
  spawn,
  spawnSync,
  fileURLToPath,
  shouldRunKnowledgeHook,
  opencodeKnowledgeFinalizerEnvironment,
  parseOpencodeRunOutput,
  resolveInvocationHost,
  withoutInvocationHost,
  CODEX_SDK_VERSION,
  resolveSessionWorkflowContext,
  tryEndKnowledgePlan,
};
