import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  SESSION_RECORD_TTL_MS,
  SessionRegistryV2,
  canonicalizeSessionWorkdir,
} from "../dist/session-registry-v2.js";

function fixture(name: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `claw-session-state-${name}-`));
}

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

  const recovered = registry.recover(new Date(old.getTime() + SESSION_RECORD_TTL_MS + 1));

  assert.deepEqual(recovered.normalized, [opened.identity.sessionKeyHash]);
  assert.deepEqual(recovered.removed, [opened.identity.sessionKeyHash]);
  assert.equal(fs.existsSync(registry.sessionDirectory(opened.identity.sessionKeyHash)), false);
  assert.equal(fs.readFileSync(path.join(unrelated, "keep.txt"), "utf-8"), "keep");
});
