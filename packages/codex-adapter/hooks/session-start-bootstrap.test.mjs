import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const hooksDir = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(hooksDir, "session-start-bootstrap.mjs");

test("SessionStart hook emits additionalContext for .claw projects", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-kit-hook-project-"));
  fs.mkdirSync(path.join(root, ".claw"), { recursive: true });

  const shimDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-kit-hook-bin-"));
  const clawCmdPath = path.join(shimDir, "claw.cmd");
  fs.writeFileSync(
    clawCmdPath,
    `@echo off
echo {\"project\":{\"projectRoot\":\"${escapeForCmd(root)}\",\"clawDir\":\"${escapeForCmd(path.join(root, ".claw"))}\",\"projectId\":\"demo-project\",\"projectName\":\"Demo Project\"},\"protocolCheck\":{\"ok\":true}}
`,
    "utf-8",
  );

  const result = spawnSync(
    process.execPath,
    [scriptPath],
    {
      cwd: root,
      input: JSON.stringify({ cwd: root, session_id: "demo" }),
      encoding: "utf-8",
      env: {
        ...process.env,
        PATH: `${shimDir}${path.delimiter}${process.env.PATH ?? ""}`,
        PLUGIN_ROOT: path.resolve(hooksDir, ".."),
      },
    },
  );

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  const context = payload.hookSpecificOutput.additionalContext;
  assert.match(context, /Demo Project/);
  assert.match(context, /@\claw-kit|\[@claw-kit\]/i);
  assert.match(context, /Project protocol check: ok\./);
});

test("SessionStart hook stays quiet outside .claw projects", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-kit-hook-non-project-"));
  const result = spawnSync(
    process.execPath,
    [scriptPath],
    {
      cwd: root,
      input: JSON.stringify({ cwd: root, session_id: "demo" }),
      encoding: "utf-8",
      env: {
        ...process.env,
        PLUGIN_ROOT: path.resolve(hooksDir, ".."),
      },
    },
  );

  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "");
});

function escapeForCmd(value) {
  return value.replaceAll("\\", "\\\\");
}
