import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const npmExecPath = process.env.npm_execpath;
assert(npmExecPath, "Run this smoke through npm so npm_execpath is available.");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-session-pack-"));
const packsDir = path.join(temporaryRoot, "packs");
const installDir = path.join(temporaryRoot, "install");
const projectDir = path.join(temporaryRoot, "project");
const runtimeRoot = path.join(temporaryRoot, "runtime");
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
  const cli = pack("@veewo/claw");
  assert(core && cli);
  fs.writeFileSync(path.join(installDir, "package.json"), JSON.stringify({
    private: true,
    type: "module",
    dependencies: {
      "@veewo/claw-core": `file:${path.join(packsDir, core)}`,
      "@veewo/claw": `file:${path.join(packsDir, cli)}`,
    },
  }, null, 2));
  npm(["install", "--ignore-scripts"], installDir);

  const cliEntry = path.join(installDir, "node_modules", "@veewo", "claw", "dist", "bin.js");
  assert(fs.existsSync(cliEntry));
  const cliContents = npm(["pack", "--workspace", "@veewo/claw", "--dry-run", "--json"]);
  assert(cliContents.includes("dist/session-command.js"), "CLI pack must contain the in-process session command module.");
  assert(!cliContents.includes("session-daemon-entry"), "CLI pack must not contain the removed session daemon entry.");
  execFileSync(process.execPath, [cliEntry, "init", "--name", "Packaged session", "--planning", "false"], {
    cwd: projectDir,
    stdio: "pipe",
  });

  const terminal = execFileSync(
    process.execPath,
    [cliEntry, "session", "open", projectDir, "packaged-agent", "--host", "cindy"],
    {
      cwd: projectDir,
      env: { ...process.env, CLAW_SESSION_DAEMON_RUNTIME_DIR: runtimeRoot },
      input: [
        'plan create "Packaged plan" --goal "Verify installed packages"',
        "plan show --simple",
        "session close",
        "",
      ].join("\n"),
      encoding: "utf-8",
    },
  );
  assert.match(terminal, /"command":"session\.open"/);
  assert.match(terminal, /"transport":"direct"/);
  assert.match(terminal, /"text":"Verify installed packages"/);
  assert.match(terminal, /"command":"plan\.create"/);
  assert.equal(fs.existsSync(path.join(runtimeRoot, "daemon", "state.json")), false);
  console.log(JSON.stringify({
    ok: true,
    installedFromTarballs: ["@veewo/claw-core", "@veewo/claw"],
    terminal: true,
    transport: "direct",
  }, null, 2));
} finally {
  await new Promise((resolve) => setTimeout(resolve, 250));
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
