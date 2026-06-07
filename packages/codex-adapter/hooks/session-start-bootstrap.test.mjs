import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const hooksDir = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(hooksDir, "..");
const repoRoot = path.resolve(pluginRoot, "..", "..");
const cliPath = path.join(repoRoot, "packages", "cli", "dist", "cli.js");

test("SessionStart hook emits additionalContext for .claw projects", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-kit-hook-project-"));
  fs.mkdirSync(path.join(root, ".claw"), { recursive: true });

  const result = spawnSync(
    process.execPath,
    [cliPath, "hook", "SessionStart"],
    {
      cwd: root,
      input: JSON.stringify({ cwd: root, session_id: "demo" }),
      encoding: "utf-8",
      env: process.env,
    },
  );

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  const context = payload.hookSpecificOutput.additionalContext;
  assert.match(context, /claw-kit/i);
  assert.match(context, /@\claw-kit|\[@claw-kit\]/i);
  assert.match(context, /Project protocol check: ok\./);
});

test("SessionStart hook stays quiet outside .claw projects", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-kit-hook-non-project-"));
  const result = spawnSync(
    process.execPath,
    [cliPath, "hook", "SessionStart"],
    {
      cwd: root,
      input: JSON.stringify({ cwd: root, session_id: "demo" }),
      encoding: "utf-8",
      env: process.env,
    },
  );

  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "");
});
