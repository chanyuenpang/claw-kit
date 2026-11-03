import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openPersistentSession, type PersistentClawSession } from "../dist/session-command.js";
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

function transportMode(session: PersistentClawSession): string | undefined {
  return (session.status() as { transport?: { mode?: string } }).transport?.mode;
}

test("session startup and unrelated opens leave historical records untouched, including missing workspaces", async (t) => {
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
  const expired = await registry.open("expired", missing, { kind: "node" });
  registry.write(expired.identity.sessionKeyHash, {
    ...expired.record, state: "disconnected", expiresAt: new Date(0).toISOString(),
    currentPlan: { projectRoot: missing, taskName: "retained", planFile: "plan.json" },
  });
  const expiredOriginal = fs.readFileSync(registry.recordPath(expired.identity.sessionKeyHash), "utf8");
  const original = fs.readFileSync(registry.recordPath(stale.identity.sessionKeyHash), "utf8");
  fs.rmdirSync(missing);
  // Opening an unrelated session must not rewrite another retained record or
  // recover a missing workspace.
  assert.deepEqual(registry.read(healthy.identity.sessionKeyHash), healthy.record);
  const session = await openPersistentSession({ runtimeRoot, workdir: valid, agentSessionId: "healthy" });
  try {
    assert.equal(fs.readFileSync(registry.recordPath(stale.identity.sessionKeyHash), "utf8"), original);
    assert.equal(registry.read(healthy.identity.sessionKeyHash).state, "live");
    await assert.rejects(
      () => openPersistentSession({ runtimeRoot, workdir: missing, agentSessionId: "stale" }),
      { code: "SESSION_IDENTITY_INVALID" },
    );
    assert.equal(transportMode(session), "direct");
    assert.equal(fs.readFileSync(registry.recordPath(expired.identity.sessionKeyHash), "utf8"), expiredOriginal);
  } finally { await session.close(); }
  fs.mkdirSync(missing);
  const restored = await openPersistentSession({ runtimeRoot, workdir: missing, agentSessionId: "stale" });
  await restored.close();
});

test("opening a new session never waits for a historical session execution queue", async () => {
  const runtimeRoot = fixture("blocked-history-runtime");
  const workdir = fixture("blocked-history-workspace");
  const registry = new SessionRegistryV2(runtimeRoot);
  const opened = await registry.open("history", workdir, { kind: "node" });
  const original = fs.readFileSync(registry.recordPath(opened.identity.sessionKeyHash), "utf8");
  let entered!: () => void;
  let release!: () => void;
  const acquired = new Promise<void>((resolve) => { entered = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const held = registry.withExecution(opened.identity.sessionKeyHash, async () => {
    entered();
    await gate;
  });
  await acquired;
  const starting = openPersistentSession({ runtimeRoot, workdir, agentSessionId: "new-agent" });
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      (async () => {
        const session = await starting;
        try {
          assert.equal(transportMode(session), "direct");
          assert.equal(fs.readFileSync(registry.recordPath(opened.identity.sessionKeyHash), "utf8"), original);
        } finally { await session.close(); }
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Session open waited for historical execution")), 2_000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    release();
    await held;
    const session = await starting.catch(() => undefined);
    if (session) await session.close();
  }
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

test("explicit retention cleanup removes only expired disconnected records without recovering sessions", async () => {
  const parent = fixture("retention-parent");
  const runtimeRoot = path.join(parent, "session-daemon-v2");
  const workdir = fixture("retention-workdir");
  const unrelated = path.join(parent, "legacy-cache");
  fs.mkdirSync(unrelated, { recursive: true });
  fs.writeFileSync(path.join(unrelated, "keep.txt"), "keep", "utf-8");
  const registry = new SessionRegistryV2(runtimeRoot);
  const old = new Date("2026-07-01T00:00:00.000Z");
  const opened = await registry.open("agent-expired", workdir, { kind: "node" }, old);

  const now = new Date(old.getTime() + SESSION_RECORD_TTL_MS + 1);
  assert.deepEqual(registry.cleanupExpired(now), []);
  assert.deepEqual(registry.read(opened.identity.sessionKeyHash), opened.record);
  registry.write(opened.identity.sessionKeyHash, { ...opened.record, state: "disconnected" });
  assert.deepEqual(registry.cleanupExpired(now), [opened.identity.sessionKeyHash]);
  assert.equal(fs.existsSync(registry.sessionDirectory(opened.identity.sessionKeyHash)), false);
  assert.equal(fs.readFileSync(path.join(unrelated, "keep.txt"), "utf-8"), "keep");
});
