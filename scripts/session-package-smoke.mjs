import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const npmExecPath = process.env.npm_execpath;
assert(npmExecPath, "Run this smoke through npm so npm_execpath is available.");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-session-pack-"));
const packsDir = path.join(temporaryRoot, "packs");
const installDir = path.join(temporaryRoot, "install");
const projectDir = path.join(temporaryRoot, "project");
const runtimeRoot = path.join(temporaryRoot, "runtime");
process.env.CLAW_SESSION_DAEMON_IDLE_TTL_MS = "100";
fs.mkdirSync(packsDir);
fs.mkdirSync(installDir);
fs.mkdirSync(projectDir);

function npm(args, cwd = repoRoot) {
  return execFileSync(process.execPath, [npmExecPath, ...args], {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function pack(workspace) {
  return npm(["pack", "--workspace", workspace, "--pack-destination", packsDir])
    .split(/\r?\n/)
    .at(-1);
}

try {
  const core = pack("@veewo/claw-core");
  const client = pack("@veewo/claw-client");
  const cli = pack("@veewo/claw");
  assert(core && client && cli);
  fs.writeFileSync(path.join(installDir, "package.json"), JSON.stringify({
    private: true,
    type: "module",
    dependencies: {
      "@veewo/claw-core": `file:${path.join(packsDir, core)}`,
      "@veewo/claw-client": `file:${path.join(packsDir, client)}`,
      "@veewo/claw": `file:${path.join(packsDir, cli)}`,
    },
  }, null, 2));
  npm(["install", "--ignore-scripts"], installDir);

  const cliEntry = path.join(installDir, "node_modules", "@veewo", "claw", "dist", "bin.js");
  const daemonEntry = path.join(installDir, "node_modules", "@veewo", "claw", "dist", "session-daemon-entry.js");
  const clientEntry = path.join(installDir, "node_modules", "@veewo", "claw-client", "dist", "index.js");
  const clientTypes = path.join(installDir, "node_modules", "@veewo", "claw-client", "dist", "index.d.ts");
  assert(fs.existsSync(clientTypes));
  assert(fs.existsSync(daemonEntry));
  execFileSync(process.execPath, [cliEntry, "init", "--name", "Packaged session", "--planning", "false"], {
    cwd: projectDir,
    stdio: "pipe",
  });

  const { ClawClient } = await import(pathToFileURL(clientEntry).href);
  const session = await new ClawClient({
    runtimeRoot,
    daemonEntryPath: daemonEntry,
    startupTimeoutMs: 10_000,
  }).open("packaged-agent", projectDir);
  await session.command({
    operation: "plan.create",
    input: { taskName: "packaged-plan", title: "Packaged plan", goalText: "Verify installed packages" },
  });
  const shown = await session.command({ operation: "plan.show", input: { simple: true } });
  assert.equal(shown.goal.text, "Verify installed packages");
  await session.close();

  const terminal = execFileSync(
    process.execPath,
    [cliEntry, "session", "open", projectDir, "packaged-agent"],
    {
      cwd: projectDir,
      env: {
        ...process.env,
        CLAW_SESSION_DAEMON_RUNTIME_DIR: runtimeRoot,
        CLAW_SESSION_DAEMON_IDLE_TTL_MS: "100",
      },
      input: "plan show --simple\nsession close\n",
      encoding: "utf-8",
    },
  );
  assert.match(terminal, /"command":"session\.open"/);
  assert.match(terminal, /"status":"process\.active"/);
  console.log(JSON.stringify({
    ok: true,
    installedFromTarballs: ["@veewo/claw-core", "@veewo/claw-client", "@veewo/claw"],
    sdk: true,
    daemon: true,
    terminal: true,
  }, null, 2));
} finally {
  await new Promise((resolve) => setTimeout(resolve, 250));
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
