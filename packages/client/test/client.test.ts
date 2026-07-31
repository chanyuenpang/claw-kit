import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { ClawClient, ClawSessionError } from "../dist/index.js";

test("typed client dispatches JSONL and reports an exact reconnect command without replay", async () => {
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-client-test-"));
  const workdir = path.join(runtimeRoot, "project with spaces");
  fs.mkdirSync(workdir);
  const token = "a".repeat(64);
  let commandCount = 0;
  const server = net.createServer((socket) => {
    socket.setEncoding("utf-8");
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += String(chunk);
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines.filter(Boolean)) {
        const request = JSON.parse(line) as {
          requestId: string;
          operation: string;
          input: { operation?: string };
        };
        if (request.operation === "session.open") {
          socket.write(`${JSON.stringify({
            ok: true,
            requestId: request.requestId,
            output: { sessionHandle: "handle-1", session: { state: "live" } },
          })}\n`);
        } else if (request.operation === "session.command") {
          commandCount += 1;
          socket.destroy();
        }
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const daemonDir = path.join(runtimeRoot, "daemon");
  fs.mkdirSync(daemonDir, { recursive: true });
  fs.writeFileSync(path.join(daemonDir, "state.json"), JSON.stringify({
    schemaVersion: 1,
    protocolVersion: 1,
    pid: process.pid,
    host: "127.0.0.1",
    port: address.port,
    token,
    startedAt: new Date().toISOString(),
  }));

  const session = await new ClawClient({ runtimeRoot }).open("agent id", workdir);
  await assert.rejects(
    () => session.command({ operation: "plan.show", input: { simple: true } }),
    (error: unknown) => error instanceof ClawSessionError
      && error.code === "SESSION_CONNECTION_LOST"
      && error.outcome === "unknown"
      && error.recoveryCommand === `claw session open "${path.resolve(workdir)}" "agent id"`,
  );
  assert.equal(commandCount, 1);
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
