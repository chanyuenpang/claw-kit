import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { inventory, startTrial, WEEK_MS, verifyCandidate, packCandidate } from "./release-candidate.mjs";
import { promoteFrozenDsh } from "./frozen-npm-promotion.mjs";
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "claw-frozen-dsh-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const dir = path.join(root, "candidate"); await fs.mkdir(path.join(dir, "artifacts", "dsh"), { recursive: true });
  const file = "dsh/package.tgz", bytes = Buffer.from("tested package bytes");
  await fs.writeFile(path.join(dir, "artifacts", file), bytes);
  const candidate = { schemaVersion: 2, state: "frozen", batch: "fixture", version: "0.2.44", sourceRevision: "a".repeat(40),
    createdAt: new Date(Date.now() - 2 * WEEK_MS).toISOString(), selected: ["dsh"], packages: [],
    versions: { dsh: { version: "0.2.44.1", npmVersion: "0.2.44-rc.1" } },
    artifacts: { dsh: { version: "0.2.44.1", npmVersion: "0.2.44-rc.1", file } }, files: await inventory(path.join(dir, "artifacts")) };
  await fs.writeFile(path.join(dir, "candidate.json"), JSON.stringify(candidate));
  await startTrial(dir, "fixture trial", Date.now() - WEEK_MS - 1000);
  const calls = []; let loseResponse = false, corrupt = false;
  const runNpm = async args => {
    calls.push(args);
    if (args[0] === "publish") { assert.equal(args[1], path.join(dir, "artifacts", file)); if (loseResponse) throw new Error("lost response"); return ""; }
    assert.equal(args[0], "pack"); assert.equal(args[1], "@veewo/dsh-claw-kit@0.2.44-rc.1");
    const dest = args[args.indexOf("--pack-destination") + 1];
    await fs.writeFile(path.join(dest, "retrieved.tgz"), corrupt ? "wrong bytes" : bytes);
    return JSON.stringify([{ filename: "retrieved.tgz" }]);
  };
  return { dir, bytes, candidate, calls, runNpm, validateSource: revision => assert.equal(revision, candidate.sourceRevision),
    lose: () => { loseResponse = true; }, corrupt: () => { corrupt = true; } };
}

test("DSH promotion sends frozen tgz and never builds, versions or exports workspace", async t => {
  const f = await fixture(t);
  const before = await fs.readFile(path.join(f.dir, "candidate.json"));
  const dry = await promoteFrozenDsh(f.dir);
  assert.equal(dry.artifact.npmVersion, "0.2.44-rc.1"); assert.equal(f.calls.length, 0);
  const result = await promoteFrozenDsh(f.dir, { publish: true, runNpm: f.runNpm, validateSource: f.validateSource });
  assert.equal(result.receipt.state, "verified");
  assert.deepEqual(f.calls.map(args => args[0]), ["publish", "pack"]);
  assert.ok(f.calls[0].includes("--ignore-scripts"));
  assert.deepEqual(await fs.readFile(path.join(f.dir, "candidate.json")), before);
  await promoteFrozenDsh(f.dir, { publish: true, runNpm: f.runNpm, validateSource: f.validateSource });
  assert.equal(f.calls.filter(args => args[0] === "publish").length, 1);
});

test("unknown upload is recovered by exact registry bytes, never resent", async t => {
  const f = await fixture(t); f.lose();
  await assert.rejects(promoteFrozenDsh(f.dir, { publish: true, runNpm: f.runNpm, validateSource: f.validateSource }), /lost response/);
  assert.equal(JSON.parse(await fs.readFile(path.join(f.dir, "promotion-dsh.json"), "utf8")).state, "unknown");
  await promoteFrozenDsh(f.dir, { publish: true, runNpm: f.runNpm, validateSource: f.validateSource });
  assert.deepEqual(f.calls.map(args => args[0]), ["publish", "pack"]);
});

test("a crash-left attempt lock permits read-only reconciliation, not resend or ledger takeover", async t => {
  const f = await fixture(t);
  const bytes = await fs.readFile(path.join(f.dir, "candidate.json"));
  const receipt = { schemaVersion: 1, candidateHash: createHash("sha256").update(bytes).digest("hex"),
    identity: "@veewo/dsh-claw-kit@0.2.44-rc.1", state: "attempted" };
  const record = JSON.stringify(receipt);
  await fs.writeFile(path.join(f.dir, "promotion-dsh.json"), record);
  await fs.writeFile(path.join(f.dir, "promotion-dsh.json.lock"), "crash-left owner");
  const result = await promoteFrozenDsh(f.dir, { publish: true, runNpm: f.runNpm, validateSource: f.validateSource });
  assert.equal(result.receipt.recoveryReadOnly, true);
  assert.deepEqual(f.calls.map(args => args[0]), ["pack"]);
  assert.equal(await fs.readFile(path.join(f.dir, "promotion-dsh.json"), "utf8"), record);
  assert.equal(await fs.readFile(path.join(f.dir, "promotion-dsh.json.lock"), "utf8"), "crash-left owner");
});

test("different remote bytes stay local to the coordinate and do not authorize resend", async t => {
  const f = await fixture(t); f.corrupt();
  await assert.rejects(promoteFrozenDsh(f.dir, { publish: true, runNpm: f.runNpm, validateSource: f.validateSource }), /bytes differ/);
  await assert.rejects(promoteFrozenDsh(f.dir, { publish: true, runNpm: f.runNpm, validateSource: f.validateSource }), /bytes differ/);
  assert.equal(f.calls.filter(args => args[0] === "publish").length, 1);
});

test("frozen pack is reuse without touching source; preparing cannot install or promote", async t => {
  const f = await fixture(t);
  assert.equal(await packCandidate({ sourceRoot: path.join(f.dir, "nonexistent-source"), directory: f.dir }), f.dir);
  await fs.writeFile(path.join(f.dir, "candidate.json"), JSON.stringify({ ...f.candidate, state: "preparing" }));
  await assert.rejects(verifyCandidate(f.dir), /not a frozen/);
  await assert.rejects(promoteFrozenDsh(f.dir), /not a frozen/);
});
