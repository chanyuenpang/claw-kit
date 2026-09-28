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
  assert.deepEqual(result, { ok: true, value: { items: [{ workspaceId: "ok", title: "Good" }] } });
});

test("project config RPC rejects path injection and delegates only resolved workspace", async () => {
  const root = project();
  let received;
  const run = async (argv, cwd) => {
    received = { argv, cwd };
    return { text: JSON.stringify({ ok: true, path: "var.flag" }), errText: "" };
  };
  const registry = { list: async () => [{ id: "safe", path: root }] };
  const rejected = await handleProjectConfigRpc("get", { workspaceId: "safe", layer: "personal", key: "var.flag", path: "C:/escape" }, registry, run);
  assert.equal(rejected.ok, false);
  const accepted = await handleProjectConfigRpc("get", { workspaceId: "safe", layer: "personal", key: "var.flag" }, registry, run);
  assert.deepEqual(accepted, { ok: true, value: { ok: true, path: "var.flag" } });
  assert.deepEqual(received, { argv: ["config", "get", "--layer", "personal", "--key", "var.flag"], cwd: root });
});
