import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { handleProjectConfigRpc } from "../lib/project-config-rpc.js";

function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-claw-config-"));
  fs.mkdirSync(path.join(root, ".claw"), { recursive: true });
  fs.writeFileSync(path.join(root, ".claw", "project.json"), "{}", "utf8");
  return root;
}

test("project config RPC lists registered claw projects without paths", async () => {
  const root = project();
  const result = await handleProjectConfigRpc("list", {}, { list: async () => [
    { id: "ok", title: "Good", path: root }, { id: "skip", title: "Skip", path: path.join(root, "missing") },
  ] }, async () => ({ text: "{}", errText: "" }));
  assert.deepEqual(result, { ok: true, value: { items: [
    { workspaceId: "ok", title: "Good" }, { workspaceId: "skip", title: "Skip" },
  ] } });
});

test("project config RPC ignores path metadata and delegates only the registered workspace", async () => {
  const root = project();
  let received;
  const run = async (argv, cwd) => {
    received = { argv, cwd };
    return { text: JSON.stringify({ ok: true, path: "var.flag" }), errText: "" };
  };
  const registry = { list: async () => [{ id: "safe", path: root }] };
  const accepted = await handleProjectConfigRpc("get", { workspaceId: "safe", layer: "personal", key: "var.flag", path: "C:/ignored" }, registry, run);
  assert.deepEqual(accepted, { ok: true, value: { ok: true, path: "var.flag" } });
  assert.deepEqual(received, { argv: ["config", "get", "--layer", "personal", "--key", "var.flag"], cwd: root });
});

test("project config RPC accepts the DSH 0.2 synchronous registry and direct get", async () => {
  const root = project();
  let listCalls = 0;
  const registry = {
    list: () => { listCalls++; return [{ id: "dsh-020", title: "DSH 0.2", path: root }]; },
    get: (id) => id === "dsh-020" ? { id, title: "DSH 0.2", path: root } : undefined,
  };
  const listed = await handleProjectConfigRpc("list", {}, registry, async () => ({ text: "{}", errText: "" }));
  assert.deepEqual(listed, { ok: true, value: { items: [{ workspaceId: "dsh-020", title: "DSH 0.2" }] } });
  const fetched = await handleProjectConfigRpc("get", { workspaceId: "dsh-020", layer: "team", key: "planning" }, registry, async () => ({ text: JSON.stringify({ ok: true }), errText: "" }));
  assert.equal(fetched.ok, true);
  assert.equal(listCalls, 1, "get should use the DSH 0.2 direct registry lookup");
});

test("project config RPC trusts the successful config runner without a workflow envelope", async () => {
  const root = project();
  const result = await handleProjectConfigRpc("get", { workspaceId: "safe", layer: "team", key: "planning" }, {
    list: () => [{ id: "safe", path: root }],
  }, async () => ({ text: JSON.stringify({ value: 1 }), errText: "" }));
  assert.deepEqual(result, { ok: true, value: { value: 1 } });
});

test("project config RPC reads, writes and unsets through the actual CLI", async (t) => {
  const root = project();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, ".claw", "project.json"), JSON.stringify({
    version: "0.2.72", id: "config-test", name: "配置测试", maxTasksToKeep: 5,
    planning: true, autoUpdate: true, goalMode: true, gitnexus: false,
    knowledgeWriter: { model: null, reasoningEffort: "medium", datedSectionsToKeep: 3 },
    externalPlanningSkill: null, defaultPlanTemplate: null, contextPaths: [],
    memory: { enabled: true, autoUpdate: true, externalDocPaths: [], embedding: null },
  }));
  const record = { id: "registered", title: "配置测试", path: root };
  const registry = { list: () => [record], get: (id) => id === record.id ? record : undefined };
  let calls = 0;
  const run = async (argv, cwd) => {
    calls++;
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("../../cli/dist/bin.js", import.meta.url)), ...argv], { cwd, encoding: "utf8" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw JSON.parse(result.stderr);
    return { text: result.stdout, errText: result.stderr };
  };
  const request = { workspaceId: record.id, layer: "personal", key: "planning" };
  const initial = await handleProjectConfigRpc("get", request, registry, run);
  assert.equal(initial.ok, true);
  assert.equal(initial.value.present, false);
  assert.equal(initial.value.effectiveValue, true);
  const saved = await handleProjectConfigRpc("set", { ...request, value: false, revision: initial.value.revision }, registry, run);
  assert.equal(saved.ok, true);
  assert.equal(saved.value.personal.planning, false);
  assert.equal(saved.value.effective.planning, false);
  const conflict = await handleProjectConfigRpc("set", { ...request, value: true, revision: initial.value.revision }, registry, run);
  assert.equal(conflict.ok, false);
  assert.equal(conflict.error.code, "PROJECT_CONFIG_CONFLICT");
  assert.equal(calls, 3, "no automatic replay on a rejected write");
  const removed = await handleProjectConfigRpc("unset", { ...request, revision: saved.value.revisions.personal }, registry, run);
  assert.equal(removed.ok, true);
  assert.equal(Object.hasOwn(removed.value.personal, "planning"), false);
  assert.equal(removed.value.effective.planning, true);
  assert.equal(calls, 4);
});

test("project config RPC preserves structured owner failure and never retries", async () => {
  let calls = 0;
  const result = await handleProjectConfigRpc("set", { workspaceId: "safe", layer: "personal", key: "planning", value: false, revision: "old" }, {
    list: () => [{ id: "safe", path: "registered-path" }],
  }, async () => {
    calls++;
    throw { code: "PROJECT_CONFIG_CONFLICT", message: "Configuration changed; token=secret", phase: "commit", outcome: "known" };
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "PROJECT_CONFIG_CONFLICT");
  assert.equal(result.error.phase, "commit");
  assert.doesNotMatch(result.error.message, /secret/);
  assert.equal(calls, 1);
});

test("project config RPC reports malformed output without replaying a mutation", async () => {
  let calls = 0;
  const result = await handleProjectConfigRpc("set", { workspaceId: "safe", layer: "personal", key: "planning", value: false, revision: "old" }, {
    list: () => [{ id: "safe", path: "registered-path" }],
  }, async () => { calls++; return { text: "incomplete", errText: "token=secret" }; });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "PROJECT_CONFIG_RESPONSE_INVALID");
  assert.doesNotMatch(result.error.message, /secret/);
  assert.equal(calls, 1);
});

test("project config RPC failures satisfy the DSH 0.2 error envelope", async () => {
  const result = await handleProjectConfigRpc("get", { workspaceId: "missing", layer: "team", key: "planning" }, {
    list: () => [],
    get: () => undefined,
  }, async () => ({ text: "{}", errText: "" }));
  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "WORKSPACE_NOT_REGISTERED",
      message: "The requested workspace is not registered.",
      details: {},
    },
  });
});
