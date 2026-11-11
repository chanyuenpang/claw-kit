import test, { after, type TestContext } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { withFileLock, tryWithFileLock, withSerializedQueue } from "../src/io.js";
import { ClawError } from "../src/errors.js";
import { initProject, ensureProjectProtocol, resolveProjectContext } from "../src/index.js";
import { migrateLegacyTaskLayout, taskLayoutMigrationMarkerPath } from "../src/task-layout-migration.js";
import { mutexWorker } from "./mutex-fixture.js";

const roots: string[] = [];
after(() => { for (const root of roots) fs.rmSync(root, { recursive: true, force: true }); });

function fixture(_t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-mutex-"));
  roots.push(root);
  return { root, resource: path.join(root, "resource") };
}

test("file mutex excludes a real process regardless of file age and releases on process death", async t => {
  const { resource } = fixture(t);
  const holder = await mutexWorker(t, "file", resource);
  const old = new Date("2000-01-01");
  fs.utimesSync(resource + ".mutex.sqlite", old, old);
  let calls = 0;
  assert.throws(() => withFileLock(resource, () => calls++), (error: any) => {
    assert.equal(error.code, "PLAN_WRITE_CONFLICT");
    assert.equal(error.details.reason, "busy");
    assert.equal(error.details.phase, "acquire"); return true;
  });
  assert.deepEqual(tryWithFileLock(resource, () => calls++), { acquired: false });
  assert.equal(calls, 0);
  assert.equal(withFileLock(resource + "-other", () => "independent"), "independent");
  await holder.stop();
  assert.equal(withFileLock(resource, () => ++calls), 1);
  assert.equal(fs.existsSync(resource + ".mutex.sqlite"), true);
  assert.equal(fs.existsSync(resource + ".lock"), false);
});

test("queue timeout has zero effects and process death permits recovery without replay", async t => {
  const { resource } = fixture(t);
  const holder = await mutexWorker(t, "queue", resource);
  let calls = 0;
  await assert.rejects(withSerializedQueue(resource, async () => calls++, { timeoutMs: 40, pollMs: 10 }), (error: any) => {
    assert.equal(error.details.reason, "busy"); assert.equal(error.details.timeoutMs, 40); return true;
  });
  assert.equal(calls, 0);
  await holder.stop();
  assert.equal(await withSerializedQueue(resource, async () => ++calls), 1);
});

test("two process contenders serialize read/await/write updates", async t => {
  const { resource } = fixture(t);
  fs.writeFileSync(resource + ".count", "0");
  const [first, second] = await Promise.all([mutexWorker(t, "increment", resource), mutexWorker(t, "increment", resource)]);
  first.child.send("go"); second.child.send("go");
  await Promise.all([first.stopped, second.stopped]);
  assert.equal(first.child.exitCode, 0); assert.equal(second.child.exitCode, 0);
  assert.equal(fs.readFileSync(resource + ".count", "utf8"), "20");
});

test("same-process async wait yields to holder and does not replay action conflicts", async t => {
  const { resource } = fixture(t);
  let release!: () => void;
  const first = withSerializedQueue(resource, () => new Promise<void>(resolve => { release = resolve; }));
  const second = withSerializedQueue(resource, async () => "next", { pollMs: 10, timeoutMs: 1000 });
  release();
  await first;
  assert.equal(await second, "next");
  let calls = 0;
  const failure = new ClawError("PLAN_WRITE_CONFLICT", "business outcome unknown");
  await assert.rejects(withSerializedQueue(resource, async () => { calls++; throw failure; }), error => error === failure);
  assert.equal(calls, 1);
  assert.throws(() => tryWithFileLock(resource, () => { throw failure; }), error => error === failure);
  assert.equal(withFileLock(resource, () => "released"), "released");
});

test("long resource paths retain cross-process exclusion and crash release", async t => {
  const { root } = fixture(t);
  const resource = path.join(root, "long-directory-".repeat(9), "nested-directory-".repeat(7), "resource");
  assert.ok(resource.length > 260);
  const holder = await mutexWorker(t, "file", resource);
  assert.deepEqual(tryWithFileLock(resource, () => assert.fail("holder owns this resource")), { acquired: false });
  await holder.stop();
  assert.equal(withFileLock(resource, () => "recovered"), "recovered");
});

test("canonical directory aliases share one mutex", t => {
  const { root, resource } = fixture(t);
  const alias = path.join(root, "alias");
  fs.symlinkSync(root, alias, process.platform === "win32" ? "junction" : "dir");
  withFileLock(resource, () => {
    assert.deepEqual(tryWithFileLock(path.join(alias, "resource"), () => "incorrect"), { acquired: false });
  });
});

test("legacy locks and invalid mutex stores are preserved, never mistaken for safe recovery", async t => {
  const { resource } = fixture(t);
  const legacy = resource + ".lock";
  fs.writeFileSync(legacy, "");
  assert.throws(() => withFileLock(resource, () => assert.fail("legacy writer may exist")), (error: any) => {
    assert.equal(error.details.reason, "legacy-lock"); return true;
  });
  fs.writeFileSync(resource, JSON.stringify({ schemaVersion: 1, pid: 2147483647, token: "dead" }));
  await assert.rejects(withSerializedQueue(resource, async () => assert.fail("do not guess from PID")), (error: any) => {
    assert.equal(error.details.reason, "legacy-lock"); return true;
  });
  assert.equal(fs.readFileSync(legacy, "utf8"), "");
  const bad = resource + "-bad";
  fs.writeFileSync(bad + ".mutex.sqlite", "not sqlite");
  assert.throws(() => withFileLock(bad, () => assert.fail("bad store")), (error: any) => error.errcode === 26);
  assert.equal(fs.readFileSync(bad + ".mutex.sqlite", "utf8"), "not sqlite");
});

test("unreadable legacy occupancy is an IO error, not permission to enter or retry", async t => {
  const { resource } = fixture(t);
  const original = fs.lstatSync;
  const failure = Object.assign(new Error("unreadable legacy slot"), { code: "EACCES" });
  t.mock.method(fs, "lstatSync", ((file: fs.PathLike, ...args: any[]) => {
    if (String(file) === resource + ".lock" || String(file) === resource) throw failure;
    return (original as any)(file, ...args);
  }) as typeof fs.lstatSync);
  assert.throws(() => withFileLock(resource, () => assert.fail("must not enter")), error => error === failure);
  await assert.rejects(withSerializedQueue(resource, async () => assert.fail("must not enter")), error => error === failure);
});

test("completed migration is a read-only fast path under legacy and live maintenance locks", async t => {
  const { root } = fixture(t);
  initProject({ cwd: root, projectName: "Mutex recovery", force: true });
  const maintenance = path.join(root, ".claw", "runtime", "maintenance.json");
  fs.writeFileSync(maintenance + ".lock", "");
  assert.equal(ensureProjectProtocol(root).changed, false);
  assert.equal(fs.readFileSync(maintenance + ".lock", "utf8"), "");
  fs.unlinkSync(maintenance + ".lock");
  const holder = await mutexWorker(t, "file", maintenance);
  assert.equal(ensureProjectProtocol(root).changed, false);
  // Necessary migration/cleanup still obeys the actual maintenance writer.
  fs.writeFileSync(taskLayoutMigrationMarkerPath(path.join(root, ".claw")), "legacy marker");
  assert.throws(() => migrateLegacyTaskLayout(resolveProjectContext(root)), { code: "PLAN_WRITE_CONFLICT" });
  await holder.stop();
  assert.equal(migrateLegacyTaskLayout(resolveProjectContext(root)).changed, true);
});
