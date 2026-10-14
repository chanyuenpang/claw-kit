import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startSessionDaemon } from "../dist/session-daemon.js";
import { ClawClient } from "@veewo/claw-client";
import {
  SESSION_RECORD_TTL_MS,
  SessionRegistryV2,
  canonicalizeSessionWorkdir,
} from "../dist/session-registry-v2.js";

const temporaryRoots: string[] = [];
function fixture(name: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `claw-session-state-${name}-`));
  temporaryRoots.push(root);
  return root;
}
after(() => {
  for (const root of temporaryRoots) fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

test("daemon recovery preserves a missing workspace record without blocking valid sessions", async (t) => {
  const root = fixture("missing-workspace");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const runtimeRoot = path.join(root, "runtime");
  const missing = path.join(root, "temporary-workspace");
  const valid = path.join(root, "valid-workspace");
  fs.mkdirSync(missing);
  fs.mkdirSync(valid);
  const registry = new SessionRegistryV2(runtimeRoot);
  const stale = await registry.open("stale", missing, { kind: "node" });
  const healthy = await registry.open("healthy", valid, { kind: "node" });
  const original = fs.readFileSync(registry.recordPath(stale.identity.sessionKeyHash), "utf8");
  fs.rmdirSync(missing);
  const daemon = await startSessionDaemon({ runtimeRoot, idleTtlMs: 0 });
  try {
    assert.ok(daemon.state.port > 0);
    assert.equal(fs.readFileSync(registry.recordPath(stale.identity.sessionKeyHash), "utf8"), original);
    assert.equal(registry.read(healthy.identity.sessionKeyHash).state, "disconnected");
    const client = new ClawClient({ runtimeRoot });
    const session = await client.open("healthy", valid);
    try {
      assert.equal(registry.read(healthy.identity.sessionKeyHash).state, "live");
      await assert.rejects(client.open("stale", missing), { code: "SESSION_IDENTITY_INVALID" });
      assert.ok(await session.status());
    } finally { await session.close(); }
    fs.mkdirSync(missing);
    const restored = await client.open("stale", missing);
    await restored.close();
  } finally { await daemon.close(); }
});

test("recovery tolerates a directory disappearing after its initial scan", async (t) => {
  const root = fixture("recovery-race");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workdir = path.join(root, "workspace");
  fs.mkdirSync(workdir);
  const registry = new SessionRegistryV2(path.join(root, "runtime"));
  const opened = await registry.open("race", workdir, { kind: "node" });
  const original = fs.readFileSync(registry.recordPath(opened.identity.sessionKeyHash), "utf8");
  const withExecution = registry.withExecution.bind(registry);
  registry.withExecution = async (key, action) => {
    fs.rmdirSync(workdir);
    return withExecution(key, action);
  };
  assert.deepEqual(await registry.recover(), { normalized: [], removed: [] });
  assert.equal(fs.readFileSync(registry.recordPath(opened.identity.sessionKeyHash), "utf8"), original);
});

test("v2 session identity isolates the same agent id by canonical workdir", async () => {
  const runtimeRoot = fixture("identity-runtime");
  const firstRoot = fixture("identity-first");
  const secondRoot = fixture("identity-second");
  const registry = new SessionRegistryV2(runtimeRoot);

  const first = await registry.open("agent-1", firstRoot, { kind: "node" });
  const same = await registry.open("agent-1", path.join(firstRoot, "."), { kind: "terminal" });
  const second = await registry.open("agent-1", secondRoot, { kind: "adapter", host: "test" });

  assert.equal(first.identity.sessionKeyHash, same.identity.sessionKeyHash);
  assert.notEqual(first.identity.sessionKeyHash, second.identity.sessionKeyHash);
  assert.equal(first.record.canonicalWorkdir, canonicalizeSessionWorkdir(firstRoot));
  assert.equal(same.created, false);
  assert.equal(second.created, true);
});

test("v2 session records recover live state and expire only disconnected v2 directories", async () => {
  const parent = fixture("retention-parent");
  const runtimeRoot = path.join(parent, "session-daemon-v2");
  const workdir = fixture("retention-workdir");
  const unrelated = path.join(parent, "legacy-cache");
  fs.mkdirSync(unrelated, { recursive: true });
  fs.writeFileSync(path.join(unrelated, "keep.txt"), "keep", "utf-8");
  const registry = new SessionRegistryV2(runtimeRoot);
  const old = new Date("2026-07-01T00:00:00.000Z");
  const opened = await registry.open("agent-expired", workdir, { kind: "node" }, old);

  const recovered = await registry.recover(new Date(old.getTime() + SESSION_RECORD_TTL_MS + 1));

  assert.deepEqual(recovered.normalized, [opened.identity.sessionKeyHash]);
  assert.deepEqual(recovered.removed, [opened.identity.sessionKeyHash]);
  assert.equal(fs.existsSync(registry.sessionDirectory(opened.identity.sessionKeyHash)), false);
  assert.equal(fs.readFileSync(path.join(unrelated, "keep.txt"), "utf-8"), "keep");
});
