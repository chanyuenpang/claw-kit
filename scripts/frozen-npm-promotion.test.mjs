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
  const calls = []; let loseResponse = false;
  const runNpm = async args => {
    calls.push(args);
    assert.equal(args[0], "publish", "publication must never query or download registry content");
    assert.equal(args[1], path.join(dir, "artifacts", file));
    if (loseResponse) throw Object.assign(new Error("lost response"), { code: "ECONNRESET" });
    return "Your package is being processed and may take a few minutes to become available.";
  };
  return { dir, bytes, candidate, calls, runNpm, validateSource: revision => assert.equal(revision, candidate.sourceRevision),
    lose: () => { loseResponse = true; } };
}

test("DSH upload success completes publication without download, build, versioning or export", async t => {
  const f = await fixture(t);
  const before = await fs.readFile(path.join(f.dir, "candidate.json"));
  const dry = await promoteFrozenDsh(f.dir);
  assert.equal(dry.artifact.npmVersion, "0.2.44-rc.1"); assert.equal(f.calls.length, 0);
  const result = await promoteFrozenDsh(f.dir, { publish: true, runNpm: f.runNpm, validateSource: f.validateSource });
  assert.equal(result.receipt.state, "accepted");
  assert.deepEqual(f.calls.map(args => args[0]), ["publish"]);
  assert.ok(f.calls[0].includes("--ignore-scripts"));
  assert.deepEqual(await fs.readFile(path.join(f.dir, "candidate.json")), before);
  await promoteFrozenDsh(f.dir, { publish: true, runNpm: f.runNpm, validateSource: f.validateSource });
  assert.equal(f.calls.length, 1);
});

test("explicit DSH owner waiver binds frozen identity without fabricating trial time", async t => {
  const f = await fixture(t);
  const trialPath = path.join(f.dir, "trial.json");
  const trial = JSON.parse(await fs.readFile(trialPath, "utf8"));
  trial.startedAt = new Date().toISOString();
  const trialBytes = JSON.stringify(trial);
  await fs.writeFile(trialPath, trialBytes);
  const options = { publish: true, runNpm: f.runNpm, validateSource: f.validateSource };
  await assert.rejects(promoteFrozenDsh(f.dir, options), /seven days/);
  assert.equal(f.calls.length, 0);
  await assert.rejects(promoteFrozenDsh(f.dir, { ...options, trialWaiver: " " }), /authorization evidence/);
  const result = await promoteFrozenDsh(f.dir, { ...options, trialWaiver: "Owner explicitly waived this repair trial." });
  assert.equal(result.receipt.state, "accepted");
  const waiver = JSON.parse(await fs.readFile(path.join(f.dir, "trial-waiver-dsh.json"), "utf8"));
  assert.equal(waiver.candidateHash, result.manifestHash);
  assert.equal(waiver.identity, result.identity);
  assert.equal(await fs.readFile(trialPath, "utf8"), trialBytes);
  await promoteFrozenDsh(f.dir, { ...options, trialWaiver: waiver.evidence });
  assert.equal(f.calls.length, 1);
  await assert.rejects(promoteFrozenDsh(f.dir, { ...options, trialWaiver: "different authorization" }), /waiver differs/);
});

test("unknown upload preserves the owner error and is never downloaded or resent", async t => {
  const f = await fixture(t); f.lose();
  const options = { publish: true, runNpm: f.runNpm, validateSource: f.validateSource };
  await assert.rejects(promoteFrozenDsh(f.dir, options), error => error.code === "ECONNRESET");
  assert.equal(JSON.parse(await fs.readFile(path.join(f.dir, "promotion-dsh.json"), "utf8")).state, "unknown");
  await assert.rejects(promoteFrozenDsh(f.dir, options), /unknown; do not resend/);
  assert.deepEqual(f.calls.map(args => args[0]), ["publish"]);
});

for (const state of ["attempted", "accepted", "verified"]) {
  test(`crash-left ${state} receipt never downloads, resends or takes over its lock`, async t => {
    const f = await fixture(t);
    const bytes = await fs.readFile(path.join(f.dir, "candidate.json"));
    const record = JSON.stringify({ schemaVersion: 1, candidateHash: createHash("sha256").update(bytes).digest("hex"),
      identity: "@veewo/dsh-claw-kit@0.2.44-rc.1", state });
    await fs.writeFile(path.join(f.dir, "promotion-dsh.json"), record);
    await fs.writeFile(path.join(f.dir, "promotion-dsh.json.lock"), "crash-left owner");
    const call = () => promoteFrozenDsh(f.dir, { publish: true, runNpm: f.runNpm, validateSource: f.validateSource });
    if (state === "attempted") await assert.rejects(call(), /attempted; do not resend/);
    else { const result = await call(); assert.equal(result.receipt.state, state); assert.equal(result.receipt.recoveryReadOnly, true); }
    assert.equal(f.calls.length, 0);
    assert.equal(await fs.readFile(path.join(f.dir, "promotion-dsh.json"), "utf8"), record);
    assert.equal(await fs.readFile(path.join(f.dir, "promotion-dsh.json.lock"), "utf8"), "crash-left owner");
  });
}

test("changed local frozen bytes still prevent upload", async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.dir, "artifacts", "dsh", "package.tgz"), "changed bytes");
  await assert.rejects(promoteFrozenDsh(f.dir, { publish: true, runNpm: f.runNpm, validateSource: f.validateSource }), /changed/);
  assert.equal(f.calls.length, 0);
});

test("frozen pack is reuse without touching source; preparing cannot install or promote", async t => {
  const f = await fixture(t);
  assert.equal(await packCandidate({ sourceRoot: path.join(f.dir, "nonexistent-source"), directory: f.dir }), f.dir);
  await fs.writeFile(path.join(f.dir, "candidate.json"), JSON.stringify({ ...f.candidate, state: "preparing" }));
  await assert.rejects(verifyCandidate(f.dir), /not a frozen/);
  await assert.rejects(promoteFrozenDsh(f.dir), /not a frozen/);
});
