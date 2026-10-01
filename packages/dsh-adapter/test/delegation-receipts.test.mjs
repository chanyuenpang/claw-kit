import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { DelegationReceiptStore } from "../lib/delegation-receipts.js";

const id = "a".repeat(64);
const moduleUrl = new URL("../lib/delegation-receipts.js", import.meta.url).href;
async function fixture(t) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "claw-delegation-receipts-"));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, "receipts"), workdir = path.join(temporary, "workspace");
  await fs.mkdir(workdir);
  return { temporary, root, workdir, store: new DelegationReceiptStore(root) };
}
async function scopeDirectory(root) {
  const scope = (await fs.readdir(root)).find((name) => /^[a-f0-9]{64}$/.test(name));
  assert.ok(scope);
  return path.join(root, scope);
}
function child(code, args) {
  const proc = spawn(process.execPath, ["--input-type=module", "-e", code, ...args], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  let stderr = "";
  proc.stderr.on("data", (chunk) => { stderr += chunk; });
  const finished = new Promise((resolve, reject) => {
    proc.once("error", reject);
    proc.once("close", (status, signal) => resolve({ status, signal, stderr }));
  });
  return { proc, finished };
}
const prelude = "import { DelegationReceiptStore } from " + JSON.stringify(moduleUrl) + ";\n"
  + 'const [root, workdir, id] = process.argv.slice(1);\nconst store = new DelegationReceiptStore(root);\n';
const holder = prelude + [
  'await store.withParent("parent", workdir, async tx => {',
  '  await tx.put(id, { count: 1 });',
  '  process.stdout.write("locked\\n");',
  '  await new Promise(resolve => process.stdin.once("data", resolve));',
  '});',
  'process.stdin.destroy();',
].join("\n");

test("constructor is IO-free; replacement, normalized workspace and parent isolation", async (t) => {
  const f = await fixture(t);
  await assert.rejects(fs.access(f.root), { code: "ENOENT" });
  await f.store.withParent("parent", f.workdir, async tx => {
    assert.equal(await tx.get(id), undefined);
    await tx.put(id.toUpperCase(), { count: 1, values: [null, false, "text"] });
    assert.deepEqual(await tx.get(id), { count: 1, values: [null, false, "text"] });
  });
  await f.store.withParent("parent", path.join(f.workdir, "."), async tx => {
    await tx.put(id, { count: 2 });
    assert.deepEqual(await tx.list(), [{ count: 2 }]);
  });
  const directory = await scopeDirectory(f.root);
  if (process.platform !== "win32") {
    assert.equal((await fs.stat(f.root)).mode & 0o077, 0);
    assert.equal((await fs.stat(directory)).mode & 0o077, 0);
    assert.equal((await fs.stat(path.join(directory, id + ".json"))).mode & 0o077, 0);
  }
  await f.store.withParent("other parent", f.workdir, async tx => assert.deepEqual(await tx.list(), []));
  const otherWorkspace = path.join(f.temporary, "other-workspace"); await fs.mkdir(otherWorkspace);
  await f.store.withParent("parent", otherWorkspace, async tx => assert.equal(await tx.get(id), undefined));
});

test("invalid IDs, non-JSON payloads, foreign envelopes and corrupt records fail closed", async (t) => {
  const f = await fixture(t);
  await f.store.withParent("parent", f.workdir, async tx => {
    await assert.rejects(tx.put("../escape", {}), /64 hexadecimal/);
    await assert.rejects(tx.put(id, { invalid: undefined }), /lossless JSON/);
    await assert.rejects(tx.put(id, { invalid: NaN }), /lossless JSON/);
    const cycle = {}; cycle.self = cycle;
    await assert.rejects(tx.put(id, cycle), /lossless JSON/);
    await tx.put(id, { stable: true });
  });
  const file = path.join(await scopeDirectory(f.root), id + ".json");
  const original = JSON.parse(await fs.readFile(file, "utf8"));
  for (const damaged of ["{broken", JSON.stringify({ ...original, parentId: "foreign" }), JSON.stringify({ ...original, workdir: "/foreign" }), JSON.stringify({ ...original, id: "b".repeat(64) }), JSON.stringify({ ...original, schemaVersion: 9 })]) {
    await fs.writeFile(file, damaged);
    await assert.rejects(f.store.withParent("parent", f.workdir, tx => tx.get(id)), /INVALID/);
    await assert.rejects(f.store.withParent("parent", f.workdir, tx => tx.put(id, { repair: "forbidden" })), /INVALID/);
    assert.equal(await fs.readFile(file, "utf8"), damaged);
  }
});

test("root and receipt symlinks are rejected without touching their targets", async (t) => {
  const f = await fixture(t);
  const foreign = path.join(f.temporary, "foreign"); await fs.mkdir(foreign);
  await fs.symlink(foreign, f.root, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(f.store.withParent("parent", f.workdir, tx => tx.put(id, {})), /symlink/);
  assert.deepEqual(await fs.readdir(foreign), []);
  await fs.unlink(f.root);
  await f.store.withParent("parent", f.workdir, tx => tx.put(id, {}));
  const file = path.join(await scopeDirectory(f.root), id + ".json");
  await fs.unlink(file);
  await fs.symlink(foreign, file, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(f.store.withParent("parent", f.workdir, tx => tx.get(id)), /symlink|regular file/);
  await assert.rejects(f.store.withParent("parent", f.workdir, tx => tx.list()), /INVALID/);
});

test("failed atomic replacement preserves prior bytes and releases the transaction", async (t) => {
  const f = await fixture(t);
  await f.store.withParent("parent", f.workdir, tx => tx.put(id, { old: true }));
  const file = path.join(await scopeDirectory(f.root), id + ".json");
  const before = await fs.readFile(file, "utf8");
  const rename = fs.rename;
  t.mock.method(fs, "rename", async (from, to) => {
    if (String(from).endsWith(".tmp")) throw new Error("injected rename failure");
    return rename(from, to);
  });
  await assert.rejects(f.store.withParent("parent", f.workdir, tx => tx.put(id, { newer: true })), /injected rename/);
  assert.equal(await fs.readFile(file, "utf8"), before);
  t.mock.restoreAll();
  await f.store.withParent("parent", f.workdir, async tx => assert.deepEqual(await tx.get(id), { old: true }));
  assert.deepEqual(await fs.readdir(path.dirname(file)), [id + ".json"]);
});

test("same-parent async transactions serialize while other parents remain independent", async (t) => {
  const f = await fixture(t);
  await f.store.withParent("parent", f.workdir, tx => tx.put(id, { count: 0 }));
  await Promise.all(Array.from({ length: 6 }, () => f.store.withParent("parent", f.workdir, async tx => {
    const prior = await tx.get(id);
    await new Promise(resolve => setTimeout(resolve, 5));
    await tx.put(id, { count: prior.count + 1 });
  })));
  let escaped;
  await f.store.withParent("parent", f.workdir, async tx => {
    escaped = tx;
    assert.equal((await tx.get(id)).count, 6);
    await f.store.withParent("independent", f.workdir, other => other.put(id, { count: 99 }));
  });
  await assert.rejects(escaped.put(id, {}), /transaction is closed/);
});

test("separate processes serialize read-modify-write receipts", async (t) => {
  const f = await fixture(t);
  await f.store.withParent("parent", f.workdir, tx => tx.put(id, { count: 0 }));
  const code = prelude + [
    'for (let i = 0; i < 4; i++) await store.withParent("parent", workdir, async tx => {',
    '  const prior = await tx.get(id);',
    '  await tx.put(id, {count: prior.count + 1});',
    '});',
  ].join("\n");
  const children = Array.from({ length: 3 }, () => child(code, [f.root, f.workdir, id]));
  t.after(() => { for (const entry of children) if (entry.proc.exitCode === null) entry.proc.kill(); });
  for (const result of await Promise.all(children.map(entry => entry.finished))) assert.equal(result.status, 0, result.stderr);
  await f.store.withParent("parent", f.workdir, async tx => assert.equal((await tx.get(id)).count, 12));
});

test("dead process lock recovers but alive owner is never stolen by age", async (t) => {
  const f = await fixture(t);
  const running = child(holder, [f.root, f.workdir, id]);
  t.after(() => { if (running.proc.exitCode === null) running.proc.kill(); });
  await once(running.proc.stdout, "data");
  const scope = path.basename(await scopeDirectory(f.root));
  const lockDir = path.join(f.root, ".locks", scope);
  await fs.utimes(lockDir, new Date(0), new Date(0));
  await assert.rejects(f.store.withParent("parent", f.workdir, tx => tx.get(id)), /LOCK_BUSY/);
  assert.equal((await fs.readdir(lockDir)).length, 1);
  running.proc.kill("SIGKILL");
  await running.finished;
  await Promise.all([f.store.withParent("parent", f.workdir, tx => tx.put(id, { recovered: 1 })),
    f.store.withParent("parent", f.workdir, async tx => { assert.ok(await tx.get(id)); })]);
  await assert.rejects(fs.access(lockDir), { code: "ENOENT" });
});

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function sharingError(code) { return Object.assign(new Error("injected lock observation sharing violation"), { code }); }

test("lock inspection retries EPERM/EACCES during live owner release without stealing", async (t) => {
  const f = await fixture(t), entered = deferred(), release = deferred(), faultSeen = deferred();
  const owned = f.store.withParent("parent", f.workdir, async tx => {
    await tx.put(id, { count: 1 }); entered.resolve(); await release.promise;
  }).then(() => undefined, error => error);
  await entered.promise;
  const lockDir = path.join(f.root, ".locks", path.basename(await scopeDirectory(f.root)));
  const oldOwner = path.join(lockDir, (await fs.readdir(lockDir))[0]);
  const open = fs.open;
  let faults = 0, waiterEntered = false;
  t.mock.method(fs, "open", async (file, flags, ...args) => {
    if (String(file) === oldOwner && typeof flags === "number" && faults < 2) {
      const code = faults++ === 0 ? "EPERM" : "EACCES";
      faultSeen.resolve(); throw sharingError(code);
    }
    return open(file, flags, ...args);
  });
  const waiting = f.store.withParent("parent", f.workdir, async tx => {
    waiterEntered = true; assert.equal((await tx.get(id)).count, 1); await tx.put(id, { count: 2 });
  }).then(() => undefined, error => error);
  try {
    await faultSeen.promise;
    assert.equal(waiterEntered, false);
    assert.equal(JSON.parse(await fs.readFile(oldOwner, "utf8")).pid, process.pid);
  } finally { release.resolve(); }
  assert.equal(await owned, undefined);
  assert.equal(await waiting, undefined);
  assert.equal(faults, 2);
  await assert.rejects(fs.access(lockDir), { code: "ENOENT" });
});

test("unlock retries owner-read permission failures after commit and removes only its proven token", async (t) => {
  const f = await fixture(t), open = fs.open;
  let ownerFile, faults = 0;
  t.mock.method(fs, "open", async (file, flags, ...args) => {
    if (ownerFile && String(file) === ownerFile && typeof flags === "number" && faults < 2) {
      throw sharingError(faults++ === 0 ? "EPERM" : "EACCES");
    }
    return open(file, flags, ...args);
  });
  await f.store.withParent("parent", f.workdir, async tx => {
    await tx.put(id, { committed: true });
    const lockDir = path.join(f.root, ".locks", path.basename(await scopeDirectory(f.root)));
    ownerFile = path.join(lockDir, (await fs.readdir(lockDir))[0]);
  });
  assert.equal(faults, 2);
  await assert.rejects(fs.access(path.dirname(ownerFile)), { code: "ENOENT" });
  await f.store.withParent("parent", f.workdir, async tx => assert.deepEqual(await tx.get(id), { committed: true }));
});

test("permanently unreadable live lock exhausts the original contention budget without entering", async (t) => {
  const f = await fixture(t), entered = deferred(), release = deferred();
  const owned = f.store.withParent("parent", f.workdir, async () => { entered.resolve(); await release.promise; })
    .then(() => undefined, error => error);
  await entered.promise;
  const lockDir = path.join(f.root, ".locks", path.basename(await scopeDirectory(f.root)));
  const ownerFile = path.join(lockDir, (await fs.readdir(lockDir))[0]);
  const before = await fs.readFile(ownerFile, "utf8"), open = fs.open;
  let deny = true, attempts = 0, called = false;
  t.mock.method(fs, "open", async (file, flags, ...args) => {
    if (deny && String(file) === ownerFile && typeof flags === "number") { attempts++; throw sharingError("EACCES"); }
    return open(file, flags, ...args);
  });
  try {
    await assert.rejects(f.store.withParent("parent", f.workdir, async () => { called = true; }), /LOCK_BUSY/);
    assert.equal(called, false);
    assert.ok(attempts > 1);
    assert.equal(await fs.readFile(ownerFile, "utf8"), before);
  } finally { deny = false; release.resolve(); assert.equal(await owned, undefined); }
});

test("unlock observation retry never removes a different owner's replacement token", async (t) => {
  const f = await fixture(t), open = fs.open;
  let ownerFile, replacement, injected = false;
  t.mock.method(fs, "open", async (file, flags, ...args) => {
    if (ownerFile && String(file) === ownerFile && typeof flags === "number" && !injected) {
      injected = true;
      const token = randomUUID(); replacement = path.join(path.dirname(ownerFile), token + ".json");
      await fs.unlink(ownerFile);
      await fs.writeFile(replacement, JSON.stringify({ schemaVersion: 1, pid: process.pid, token }));
      throw sharingError("EPERM");
    }
    return open(file, flags, ...args);
  });
  await assert.rejects(f.store.withParent("parent", f.workdir, async tx => {
    await tx.put(id, { committed: true });
    const lockDir = path.join(f.root, ".locks", path.basename(await scopeDirectory(f.root)));
    ownerFile = path.join(lockDir, (await fs.readdir(lockDir))[0]);
  }), /lost lock ownership/);
  assert.equal(injected, true);
  assert.equal(JSON.parse(await fs.readFile(replacement, "utf8")).pid, process.pid);
});

test("corrupt lock owner is not silently repaired or recursively deleted", async (t) => {
  const f = await fixture(t);
  await f.store.withParent("parent", f.workdir, async () => {});
  const scope = path.basename(await scopeDirectory(f.root));
  const lockDir = path.join(f.root, ".locks", scope);
  await fs.mkdir(lockDir);
  const file = path.join(lockDir, "broken.json");
  await fs.writeFile(file, "{not-json");
  await assert.rejects(f.store.withParent("parent", f.workdir, tx => tx.list()), /INVALID/);
  assert.equal(await fs.readFile(file, "utf8"), "{not-json");
});
