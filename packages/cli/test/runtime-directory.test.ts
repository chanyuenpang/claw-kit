import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ClawError } from "@veewo/claw-core";
import { startSessionDaemon } from "../dist/session-daemon.js";
import { createFixture, runClaw, runClawExpectFailure } from "./cli-test-support.js";

function readOnlyDirectory(name: string): string {
  const directory = createFixture(name);
  fs.chmodSync(directory, 0o555);
  return directory;
}

test("hostless context initializes a writable project when the home runtime is not writable", () => {
  const workspace = createFixture("context-ro-home-workspace");
  const home = readOnlyDirectory("context-ro-home");
  try {
    const output = runClaw(["context"], workspace, {
      CLAW_HOST: "",
      CLAW_SESSION_ID: "",
      HOME: home,
      CLAW_SESSION_RUNTIME_DIR: "",
      XDG_CACHE_HOME: home,
      XDG_RUNTIME_DIR: home,
    });
    assert.equal(output.project && (output.project as { projectRoot?: string }).projectRoot, workspace);
    assert.equal((output.startupRecovery as { initialized?: boolean } | undefined)?.initialized, true);
    assert.equal(fs.existsSync(path.join(workspace, ".claw", "project.json")), true);
  } finally {
    fs.chmodSync(home, 0o700);
  }
});

test("session daemon startup names an unwritable runtime directory", async () => {
  const parent = readOnlyDirectory("daemon-ro-parent");
  const runtimeRoot = path.join(parent, "session-daemon");
  try {
    await assert.rejects(
      () => startSessionDaemon({ runtimeRoot }),
      (error: unknown) => {
        assert.ok(error instanceof ClawError);
        assert.equal(error.code, "RUNTIME_DIRECTORY_NOT_WRITABLE");
        assert.match(error.message, /session daemon runtime directory/);
        assert.match(error.message, /CLAW_SESSION_DAEMON_RUNTIME_DIR/);
        assert.match(error.message, /EACCES/);
        assert.equal(error.execution?.outcome, "known");
        assert.equal(error.execution?.effect, "none");
        return true;
      },
    );
  } finally {
    fs.chmodSync(parent, 0o700);
  }
});

test("hostless context failure text stays specific when the workspace itself is not writable", () => {
  const workspace = readOnlyDirectory("context-ro-workspace");
  const runtime = createFixture("context-ro-workspace-runtime");
  try {
    const failure = runClawExpectFailure(["context"], workspace, {
      CLAW_HOST: "",
      CLAW_SESSION_ID: "",
      CLAW_SESSION_RUNTIME_DIR: runtime,
    });
    const error = failure.error as { code?: string; message?: string };
    assert.equal(error.code, "RUNTIME_DIRECTORY_NOT_WRITABLE");
    assert.match(error.message ?? "", /project|workspace|read-only|permission|EACCES/i);
    assert.doesNotMatch(error.message ?? "", /filesystem detail redacted/);
  } finally {
    fs.chmodSync(workspace, 0o700);
  }
});
