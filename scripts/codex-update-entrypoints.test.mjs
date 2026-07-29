import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("repository update commands use cross-platform Node entrypoints", async () => {
  const packageJson = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"));

  assert.equal(packageJson.scripts["install:local-cli"], "node ./scripts/install-cli.mjs");
  assert.equal(packageJson.scripts["install:codex-plugin"], "node ./scripts/install-codex-plugin-official.mjs");
});

test("CLI updater refreshes the prefix that owns the active claw command", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "claw-kit-cli-update-"));
  const prefix = path.join(root, "active-prefix");
  const binDir = path.join(prefix, "bin");
  const packageDir = path.join(prefix, "lib", "node_modules", "@veewo", "claw");
  const logPath = path.join(root, "npm-args.json");
  await fs.mkdir(binDir, { recursive: true });
  await fs.mkdir(packageDir, { recursive: true });
  await fs.writeFile(path.join(binDir, "claw"), "#!/bin/sh\nexit 0\n");
  await fs.writeFile(
    path.join(binDir, "npm"),
    `#!/bin/sh\nprintf '%s\\n' \"$@\" > \"${logPath}\"\n`,
  );
  await fs.chmod(path.join(binDir, "claw"), 0o755);
  await fs.chmod(path.join(binDir, "npm"), 0o755);

  const result = spawnSync(
    process.execPath,
    [path.join(repoRoot, "scripts", "install-cli.mjs")],
    {
      cwd: repoRoot,
      env: { ...process.env, PATH: binDir },
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const args = (await fs.readFile(logPath, "utf8")).trim().split(/\r?\n/);
  assert.deepEqual(args, [
    "install",
    "-g",
    "@veewo/claw",
    "--prefix",
    prefix,
    "--no-audit",
    "--no-fund",
  ]);
});

test("Codex updater remains pinned to the official GitHub marketplace", async () => {
  const installerPath = path.join(repoRoot, "scripts", "install-codex-plugin-official.mjs");
  await assert.doesNotReject(fs.access(installerPath));
  const installer = await fs.readFile(
    installerPath,
    "utf8",
  );

  assert.match(installer, /https:\/\/github\.com\/chanyuenpang\/claw-kit\.git/);
  assert.match(installer, /--depth/);
  assert.match(installer, /--branch/);
  assert.doesNotMatch(installer, /packages\/codex-adapter["'`]\s*\)/);
});
