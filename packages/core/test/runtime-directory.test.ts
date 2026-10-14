import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ClawError } from "../src/errors.js";
import { initProject } from "../src/init.js";
import { resolveProjectContext } from "../src/context.js";
import { runDailyMaintenance } from "../src/daily-maintenance.js";
import {
  canWriteDirectory,
  projectRuntimeDirectory,
  resolveEmbeddingOutputDirectory,
  resolveWritableRuntimeDirectory,
} from "../src/runtime-directory.js";
import {
  createSessionWorkflowContext,
  resolveSessionWorkflowContext,
  sessionWorkflowBaseDir,
} from "../src/session-workflows.js";

function tempDir(name: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `claw-runtime-${name}-`));
}

test("project runtime fallback stays inside a temp project", () => {
  const project = tempDir("project");
  assert.equal(
    projectRuntimeDirectory(project, "session-daemon"),
    path.join(project, ".claw", "runtime", "session-daemon"),
  );
});

test("explicit runtime directory must be writable and is not replaced", () => {
  const root = tempDir("explicit");
  const blocker = path.join(root, "not-a-directory");
  fs.writeFileSync(blocker, "x");
  const project = path.join(root, "project");
  fs.mkdirSync(project);
  assert.equal(canWriteDirectory(path.join(blocker, "child")), false);
  assert.throws(
    () => resolveWritableRuntimeDirectory({
      explicitPath: path.join(blocker, "child"),
      explicitEnvName: "CLAW_SESSION_DAEMON_RUNTIME_DIR",
      candidates: [],
      projectFallback: projectRuntimeDirectory(project, "session-daemon"),
      purpose: "Session daemon",
    }),
    (error: unknown) => error instanceof ClawError
      && error.code === "RUNTIME_DIR_NOT_WRITABLE"
      && /CLAW_SESSION_DAEMON_RUNTIME_DIR/.test((error as Error).message),
  );
});

test("unwritable candidates fall back to the project runtime directory", () => {
  const root = tempDir("fallback");
  const blocker = path.join(root, "not-a-directory");
  fs.writeFileSync(blocker, "x");
  const project = path.join(root, "project");
  fs.mkdirSync(project);
  const resolved = resolveWritableRuntimeDirectory({
    explicitEnvName: "CLAW_SESSION_DAEMON_RUNTIME_DIR",
    candidates: [path.join(blocker, "runtime")],
    projectFallback: projectRuntimeDirectory(project, "session-daemon"),
    purpose: "Session daemon",
  });
  assert.equal(resolved, path.join(project, ".claw", "runtime", "session-daemon"));
  assert.equal(fs.statSync(resolved).isDirectory(), true);
});

test("embedding worker output uses a writable temp directory", () => {
  const root = tempDir("embedding-output");
  const project = path.join(root, "project");
  fs.mkdirSync(project);
  const writableTmp = path.join(root, "tmp");
  fs.mkdirSync(writableTmp);
  const resolved = resolveEmbeddingOutputDirectory(project, writableTmp);
  assert.equal(resolved, path.resolve(writableTmp));
  const probe = path.join(resolved, "claw-embedding-probe.json");
  fs.writeFileSync(probe, "{}");
  assert.equal(fs.readFileSync(probe, "utf-8"), "{}");
});

test("read-only TMPDIR falls back to the project runtime tmp directory", () => {
  const root = tempDir("embedding-fallback");
  const blocker = path.join(root, "not-a-directory");
  fs.writeFileSync(blocker, "x");
  const project = path.join(root, "project");
  fs.mkdirSync(project);
  const resolved = resolveEmbeddingOutputDirectory(project, path.join(blocker, "tmp"));
  assert.equal(resolved, path.join(project, ".claw", "runtime", "tmp"));
  const probe = path.join(resolved, "claw-embedding-probe.json");
  fs.writeFileSync(probe, "{\"ok\":true}");
  assert.equal(fs.existsSync(probe), true);
});

test("session workflows and daily maintenance use the project when the home runtime is not writable", () => {
  const root = tempDir("home");
  const homeFile = path.join(root, "home-file");
  fs.writeFileSync(homeFile, "x");
  const project = path.join(root, "project");
  fs.mkdirSync(project);
  initProject({ cwd: project, projectName: "Runtime Fallback", planning: false });
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  const previousRuntime = process.env.CLAW_SESSION_RUNTIME_DIR;
  // os.homedir() uses USERPROFILE on Windows and HOME on POSIX.
  process.env.HOME = homeFile;
  process.env.USERPROFILE = homeFile;
  delete process.env.CLAW_SESSION_RUNTIME_DIR;
  try {
    assert.throws(
      () => sessionWorkflowBaseDir({ CLAW_SESSION_RUNTIME_DIR: homeFile }, homeFile, project),
      (error: unknown) => error instanceof ClawError && error.code === "RUNTIME_DIR_NOT_WRITABLE",
    );
    const created = createSessionWorkflowContext(project, "linux-sandbox-session");
    assert.equal(
      created.clawDir.startsWith(path.join(project, ".claw", "runtime", "sessions") + path.sep),
      true,
    );
    const resolved = resolveSessionWorkflowContext("linux-sandbox-session", { readOnly: true, cwd: project });
    assert.equal(resolved?.clawDir, created.clawDir);
    const maintenance = runDailyMaintenance(resolveProjectContext(project), { env: {} });
    assert.equal(maintenance.ran, true);
    assert.equal(
      fs.existsSync(path.join(project, ".claw", "runtime", "sessions", ".maintenance.json")),
      true,
    );
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = previousUserProfile;
    if (previousRuntime === undefined) delete process.env.CLAW_SESSION_RUNTIME_DIR;
    else process.env.CLAW_SESSION_RUNTIME_DIR = previousRuntime;
  }
});
