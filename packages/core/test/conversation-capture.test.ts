import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initProject, knowledgeSessionRegistryPath, resolveProjectContext,
  tryRegisterKnowledgePlan, tryCompleteKnowledgePlan, tryCaptureKnowledgeStop,
  readKnowledgeFinalizationJob } from "../src/index.js";

test("OpenCode batches preserve same-turn messages, dedup history, and scope pending capture", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-conversation-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  initProject({ cwd: root, projectName: "Conversation" });
  const project = resolveProjectContext(root);
  const sessionId = path.basename(root);
  const planPath = path.join(project.tasksDir, "probe", "plan.json");
  fs.mkdirSync(path.dirname(planPath), { recursive: true });
  fs.writeFileSync(planPath, "{}");
  assert.equal(tryRegisterKnowledgePlan({ project, sessionId, host: "opencode", planPath }).ok, true);
  const registryPath = knowledgeSessionRegistryPath(project, sessionId);
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  fs.writeFileSync(registryPath, JSON.stringify({ ...registry, activeStartedAt: "2026-10-01T10:00:00.000Z" }));
  const entry = (messageId: string, role: "user" | "assistant", occurredAt?: string) => ({ messageId, role, message: messageId, occurredAt });
  const conversationEntries = [
    entry("old-user", "user", "2026-10-01T09:00:00.000Z"),
    entry("old-assistant", "assistant", "2026-10-01T09:59:58.000Z"),
    entry("request", "user", "2026-10-01T09:59:59.000Z"),
    entry("commentary", "assistant", "2026-10-01T10:00:00.000Z"),
    entry("correction", "user", "2026-10-01T10:00:20.000Z"),
    entry("summary", "assistant", "2026-10-01T10:00:30.000Z"),
  ];
  const first = tryCaptureKnowledgeStop({ project, sessionId, host: "opencode", turnId: "idle-1", conversationEntries });
  assert.equal(first.ok, true);
  assert.equal(first.captured, true);
  const repeat = tryCaptureKnowledgeStop({ project, sessionId, host: "opencode", turnId: "idle-2", conversationEntries });
  assert.equal(repeat.duplicate, true);
  assert.equal(tryCompleteKnowledgePlan({ project, sessionId, host: "opencode", completedPlanPath: planPath,
    completedAt: "2026-10-01T10:01:00.000Z" }).ok, true);
  const last = tryCaptureKnowledgeStop({ project, sessionId, host: "opencode", turnId: "idle-3", conversationEntries: [
    ...conversationEntries, entry("final", "assistant", "2026-10-01T10:00:50.000Z"),
    entry("after-end", "assistant", "2026-10-01T10:01:00.000Z"),
  ] });
  assert.equal(last.ok, true);
  const rows = fs.readFileSync(last.reportPath!, "utf8").trim().split("\n").map(line => JSON.parse(line));
  assert.deepEqual(rows.map(row => row.message), ["request", "commentary", "correction", "summary", "final"]);
  assert.equal(rows[0].context, "plan_request");
  assert.equal(readKnowledgeFinalizationJob(last.jobPath!).status, "queued");
});
