import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readEmbeddingDaemonState } from "../src/embedding-daemon-protocol.js";
import type { MemoryEmbeddingConfig } from "../src/types.js";

const workerPath = fileURLToPath(new URL("../src/embedding-worker.js", import.meta.url));

test("persistent embedding daemon reuses one session across independent workers", { concurrency: false }, async () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-embedding-daemon-test-"));
  const eventLog = path.join(runtimeDir, "events.jsonl");
  const embedding: MemoryEmbeddingConfig = {
    provider: "local",
    model: "Snowflake/snowflake-arctic-embed-xs",
    local: { device: "cpu" },
  };
  const env = {
    ...process.env,
    CLAW_EMBEDDING_DAEMON_RUNTIME_DIR: runtimeDir,
    CLAW_EMBEDDING_DAEMON_TEST_MOCK: "1",
    CLAW_EMBEDDING_DAEMON_IDLE_TTL_MS: "250",
    CLAW_EMBEDDING_DAEMON_EVENT_LOG: eventLog,
  };

  const first = runWorker({ embedding, texts: ["first uncached query"] }, env, runtimeDir, "first");
  const second = runWorker({ embedding, texts: ["second uncached query"] }, env, runtimeDir, "second");
  assert.equal(first.vectors.length, 1);
  assert.equal(second.vectors.length, 1);
  assert.notDeepEqual(first.vectors[0], second.vectors[0]);

  const state = readEmbeddingDaemonState(runtimeDir);
  assert.ok(state);
  await waitFor(() => readEvents(eventLog).some((event) => event.event === "daemon.stopped"), 3000);
  const events = readEvents(eventLog);
  const started = events.filter((event) => event.event === "daemon.started");
  const sessions = events.filter((event) => event.event === "session.created");
  const requests = events.filter((event) => event.event === "request.completed");
  assert.equal(started.length, 1);
  assert.equal(sessions.length, 1);
  assert.equal(requests.length, 2);
  assert.ok(events.every((event) => event.pid === state.pid));
  assert.equal(readEmbeddingDaemonState(runtimeDir), null);
});

test("persistent embedding worker kill switch preserves one-shot behavior", { concurrency: false }, () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-embedding-disabled-test-"));
  const eventLog = path.join(runtimeDir, "events.jsonl");
  const output = runWorker(
    {
      embedding: {
        provider: "local",
        model: "Snowflake/snowflake-arctic-embed-xs",
        local: { device: "cpu" },
      },
      texts: ["disabled query"],
    },
    {
      ...process.env,
      CLAW_EMBEDDING_MOCK: "1",
      CLAW_EMBEDDING_PERSISTENT_WORKER: "0",
      CLAW_EMBEDDING_DAEMON_RUNTIME_DIR: runtimeDir,
      CLAW_EMBEDDING_DAEMON_EVENT_LOG: eventLog,
    },
    runtimeDir,
    "disabled",
  );
  assert.equal(output.vectors.length, 1);
  assert.equal(fs.existsSync(eventLog), false);
  assert.equal(readEmbeddingDaemonState(runtimeDir), null);
});

function runWorker(
  input: { embedding: MemoryEmbeddingConfig; texts: string[] },
  env: NodeJS.ProcessEnv,
  runtimeDir: string,
  name: string,
): { dimensions: number; vectors: number[][] } {
  const outputPath = path.join(runtimeDir, `${name}.json`);
  const result = spawnSync(process.execPath, [workerPath], {
    cwd: process.cwd(),
    env,
    input: JSON.stringify({ ...input, outputPath }),
    encoding: "utf-8",
    timeout: 10000,
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(fs.readFileSync(outputPath, "utf-8")) as { dimensions: number; vectors: number[][] };
}

function readEvents(target: string): Array<{ event: string; pid: number }> {
  if (!fs.existsSync(target)) {
    return [];
  }
  return fs.readFileSync(target, "utf-8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { event: string; pid: number });
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`Timed out after ${timeoutMs}ms.`);
}
