import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

test("project config RPC does not manufacture success from arbitrary JSON", async () => {
  const root = project();
  const result = await handleProjectConfigRpc("get", { workspaceId: "safe", layer: "team", key: "planning" }, {
    list: () => [{ id: "safe", path: root }],
  }, async () => ({ text: JSON.stringify({ value: 1 }), errText: "" }));
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "PROJECT_CONFIG_COMMAND_FAILED");
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
