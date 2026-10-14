import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ClawError, initProject, resolveProjectContext, runDailyMaintenance } from "../src/index.js";
import { createSessionWorkflowContext } from "../src/session-workflows.js";
import { ensureWritableDirectory } from "../src/runtime-directory.js";

function tempDir(name: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `claw-${name}-`));
}

test("daily maintenance keeps the project when the session runtime is read-only", (t) => {
  const root = tempDir("maint-project");
  const sessionRoot = tempDir("maint-session");
  initProject({ cwd: root, projectName: "Read-only session runtime", force: true });
  const openSync = fs.openSync;
  t.mock.method(fs, "openSync", ((file: fs.PathLike, flags: fs.OpenMode, mode?: fs.Mode) => {
    if (String(file).startsWith(sessionRoot)) {
      const error = new Error("EROFS: read-only file system, open") as NodeJS.ErrnoException;
      error.code = "EROFS";
      error.syscall = "open";
      throw error;
    }
    return openSync(file, flags, mode);
  }) as typeof fs.openSync);

  const result = runDailyMaintenance(resolveProjectContext(root), {
    now: new Date("2026-02-01T00:00:00.000Z"),
    env: { CLAW_SESSION_RUNTIME_DIR: sessionRoot },
  });

  assert.equal(result.ran, true);
  assert.deepEqual(result.skippedUnwritableScopes, ["session"]);
  assert.equal(fs.existsSync(path.join(root, ".claw", "runtime", "maintenance.json")), true);
  assert.equal(fs.existsSync(path.join(sessionRoot, ".maintenance.json")), false);
});

test("ensureWritableDirectory names the daemon runtime env var for EROFS", (t) => {
  const directory = tempDir("daemon-runtime");
  t.mock.method(fs, "openSync", (() => {
    const error = new Error("EROFS: read-only file system, open") as NodeJS.ErrnoException;
    error.code = "EROFS";
    error.syscall = "open";
    throw error;
  }) as typeof fs.openSync);

  assert.throws(
    () => ensureWritableDirectory(directory),
    (error: unknown) => {
      assert.ok(error instanceof ClawError);
      assert.equal(error.code, "RUNTIME_DIRECTORY_NOT_WRITABLE");
      assert.match(error.message, /session daemon runtime directory/);
      assert.match(error.message, /read-only \(EROFS\)/);
      assert.match(error.message, /CLAW_SESSION_DAEMON_RUNTIME_DIR/);
      assert.equal(error.execution?.outcome, "known");
      assert.equal(error.execution?.effect, "none");
      return true;
    },
  );
});

test("daily maintenance treats Node's ENOENT mkdir on a read-only ancestor as unwritable", (t) => {
  const root = tempDir("maint-enoent-project");
  const sessionRoot = tempDir("maint-enoent-session");
  initProject({ cwd: root, projectName: "ENOENT read-only session runtime", force: true });
  fs.chmodSync(sessionRoot, 0o555);
  const mkdirSync = fs.mkdirSync;
  t.mock.method(fs, "mkdirSync", ((directory: fs.PathLike, options?: fs.MakeDirectoryOptions) => {
    const target = String(directory);
    if (target.startsWith(sessionRoot)) {
      const error = new Error("ENOENT: no such file or directory, mkdir") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      error.syscall = "mkdir";
      // Recursive mkdir reports the full missing path, not the existing read-only ancestor.
      error.path = path.join(sessionRoot, "runtime", "sessions");
      throw error;
    }
    return mkdirSync(directory, options);
  }) as typeof fs.mkdirSync);
  t.after(() => fs.chmodSync(sessionRoot, 0o700));

  const result = runDailyMaintenance(resolveProjectContext(root), {
    now: new Date("2026-02-01T00:00:00.000Z"),
    env: { CLAW_SESSION_RUNTIME_DIR: sessionRoot },
  });

  assert.equal(result.ran, true);
  assert.deepEqual(result.skippedUnwritableScopes, ["session"]);
  assert.equal(fs.existsSync(path.join(root, ".claw", "runtime", "maintenance.json")), true);
});

test("creating a session workflow reports an unwritable runtime directory", (t) => {
  const root = tempDir("session-create-project");
  const sessionRoot = tempDir("session-create-runtime");
  fs.chmodSync(sessionRoot, 0o555);
  const previous = process.env.CLAW_SESSION_RUNTIME_DIR;
  process.env.CLAW_SESSION_RUNTIME_DIR = sessionRoot;
  t.after(() => {
    fs.chmodSync(sessionRoot, 0o700);
    if (previous === undefined) delete process.env.CLAW_SESSION_RUNTIME_DIR;
    else process.env.CLAW_SESSION_RUNTIME_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(sessionRoot, { recursive: true, force: true });
  });

  assert.throws(
    () => createSessionWorkflowContext(root, "session-ro"),
    (error: unknown) => {
      assert.ok(error instanceof ClawError);
      assert.equal(error.code, "RUNTIME_DIRECTORY_NOT_WRITABLE");
      assert.match(error.message, /CLAW_SESSION_RUNTIME_DIR/);
      assert.match(error.message, /EACCES/);
      return true;
    },
  );
});
