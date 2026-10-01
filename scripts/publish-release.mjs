import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { exportCodexPluginBundle, installCodexPluginBundle, readCodexPluginSource } from "./codex-plugin-bundle.mjs";
import { loadSkillInputs } from "./skill-artifacts.mjs";
import { assertTemplateVersionsAligned } from "./update-template-versions.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publish = process.argv.includes("--publish");
const includePlatformArtifacts = process.argv.includes("--batch");
const npmExecPath = process.env.npm_execpath;

function command(command, args) {
  return execFileSync(command, args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function npmCommand(args) {
  assert(npmExecPath, "Release verification must run through an npm script so npm_execpath is available.");
  return command(process.execPath, [npmExecPath, ...args]);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertCleanWorktree(phase) {
  assert(
    command("git", ["status", "--porcelain"]) === "",
    `${phase}: release worktree must be clean. Classify every local change before continuing: commit useful release content to main, remove disposable output, or add intentional local-only artifacts to .gitignore. Do not use a stash to bypass this gate.`,
  );
}

function assertDirectMainCheckout() {
  const branch = command("git", ["branch", "--show-current"]);
  assert(
    branch === "main",
    `Release must run from the repository owner's main branch; current branch is ${branch || "detached HEAD"}. Do not create a branch or pull request unless the owner explicitly requests review.`,
  );

  command("git", ["fetch", "origin", "--prune"]);
  const localHead = command("git", ["rev-parse", "HEAD"]);
  const remoteMain = command("git", ["rev-parse", "origin/main"]);
  assert(
    localHead === remoteMain,
    "main must exactly match origin/main before publishing. Commit and push all useful release content first, then rerun verification.",
  );
}

function readHeadJson(relativePath) {
  return JSON.parse(command("git", ["show", `HEAD:${relativePath.replaceAll("\\", "/")}`]));
}

function assertHeadPathExists(relativePath) {
  const normalizedPath = relativePath.replaceAll("\\", "/");
  const result = spawnSync("git", ["cat-file", "-e", `HEAD:${normalizedPath}`], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert(result.status === 0, `Committed repository marketplace payload is missing ${normalizedPath}.`);
}

async function assertRepositorySourceSnapshot({ pluginVersion }) {
  // This validates committed build inputs, not a directly installable Git tree.
  // Codex Git delivery must publish the composed artifact through an authorized
  // target; never certify raw adapter source as a complete marketplace payload.
  const committedManifest = readHeadJson("packages/codex-adapter/.codex-plugin/plugin.json");
  assert(committedManifest.version === pluginVersion && committedManifest.skills === "./skills/", "Committed Codex manifest must preserve the installed interface and release version.");
  const inputs = await loadSkillInputs({ sourceRoot: repoRoot, targetHost: "codex" });
  assertHeadPathExists("packages/codex-adapter/skill-inputs.json");
  for (const skill of inputs.skills) {
    for (const file of skill.files) assertHeadPathExists(`${skill.relativeSource}/${file}`);
  }
  for (const relativePath of [".codex-plugin", "hooks", "assets", "scripts", "references", "package.json"]) {
    const sourcePath = `packages/codex-adapter/${relativePath}`;
    assertHeadPathExists(sourcePath);
    const tree = command("git", ["ls-tree", "-r", "HEAD", "--", sourcePath]);
    assert(!tree.split(/\r?\n/).some((line) => line.startsWith("120000 ")), `Committed Codex payload contains symlinks: ${sourcePath}`);
  }
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(repoRoot, relativePath), "utf8"));
}

function isAdapterVersion(adapterVersion, cliVersion) {
  const prefix = `${cliVersion}.`;
  return adapterVersion.startsWith(prefix) && /^\d+\.\d+\.\d+\.\d+$/.test(adapterVersion) && adapterVersion.slice(prefix.length).length > 0;
}

async function assertCodexDriverCompatibility({ cliPath, cwd }) {
  const skill = await fs.readFile(path.join(repoRoot, ".agents", "skills", "using-claw-kit", "references", "hosts", "codex.md"), "utf8");
  const expectedCacheKey = /const cacheKey = "([^"]+)"/.exec(skill)?.[1];
  const expectedDriverVersion = Number(/driverVersion !== (\d+)/.exec(skill)?.[1]);
  assert(expectedCacheKey && Number.isInteger(expectedDriverVersion), "Codex plugin must declare an explicit driver cache key and version.");
  const driver = JSON.parse(execFileSync(process.execPath, [cliPath, "codex", "driver"], { cwd, encoding: "utf8" }));
  assert(driver.cacheKey === expectedCacheKey && driver.driverVersion === expectedDriverVersion,
    `Codex plugin requires ${expectedCacheKey} / driver v${expectedDriverVersion}, but the packaged CLI provides ${driver.cacheKey} / driver v${driver.driverVersion}. Publish a compatible CLI before releasing the Codex plugin.`);
}

async function assertPlatformArtifactReadiness(cliVersion) {
  const codex = await readJson("packages/codex-adapter/package.json");
  const openclaw = await readJson("packages/openclaw-adapter/package.json");
  const openclawManifest = await readJson("packages/openclaw-adapter/openclaw.plugin.json");
  const opencode = await readJson("packages/opencode-adapter/package.json");
  const plugin = await readJson("packages/codex-adapter/.codex-plugin/plugin.json");
  assert(openclaw.dependencies?.["@veewo/claw-core"] === cliVersion, "OpenClaw adapter must pin the exact @veewo/claw-core version.");
  assert(openclawManifest.id === "claw-kit" && openclawManifest.version === openclaw.version, "OpenClaw adapter manifest must match its package.");
  assert(Array.isArray(openclawManifest.skills) && openclawManifest.skills.includes("skills"), "OpenClaw native plugin manifest must declare its skills root.");
  for (const [name, pkg] of [["codex-adapter", codex], ["openclaw-adapter", openclaw], ["opencode-adapter", opencode]]) {
    assert(isAdapterVersion(pkg.version, cliVersion), `${name} version ${pkg.version} must start with ${cliVersion}. and use four segments.`);
  }
  assert(plugin.version === codex.version, "Codex plugin manifest version must match codex-adapter version.");
  await assertTemplateVersionsAligned({ repoRoot, expectedVersion: cliVersion });
  await assertRepositorySourceSnapshot({ pluginVersion: plugin.version });
}

async function verifyReleaseReadiness() {
  const root = await readJson("package.json");
  const core = await readJson("packages/core/package.json");
  const client = await readJson("packages/client/package.json");
  const cli = await readJson("packages/cli/package.json");

  const cliVersion = root.version;

  assert(core.version === cliVersion, `@veewo/claw-core version ${core.version} must equal the CLI release version ${cliVersion}.`);
  assert(client.version === cliVersion, `@veewo/claw-client version ${client.version} must equal the CLI release version ${cliVersion}.`);
  assert(client.peerDependencies?.["@veewo/claw"] === cliVersion, "Client optional CLI peer must match the release version.");
  assert(cli.version === cliVersion, `@veewo/claw version ${cli.version} must equal the CLI release version ${cliVersion}.`);
  assert(cli.dependencies?.["@veewo/claw-client"] === cliVersion, "CLI must pin the exact @veewo/claw-client version.");
  assert(cli.dependencies?.["@veewo/claw-core"] === cliVersion, "CLI must pin the exact @veewo/claw-core version.");
  assertCleanWorktree("Before publishing");
  assertDirectMainCheckout();
  if (includePlatformArtifacts) {
    await assertPlatformArtifactReadiness(cliVersion);
  }

  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "claw-kit-release-plugin-"));
  try {
    if (includePlatformArtifacts) {
    const bundle = await exportCodexPluginBundle({ outDir });
    await readCodexPluginSource({ sourceDir: bundle.bundleDir });

    }

    npmCommand(["run", "build", "-w", "@veewo/claw-core"]);
    npmCommand(["run", "build", "-w", "@veewo/claw-client"]);
    npmCommand(["run", "build", "-w", "@veewo/claw"]);
    const packDir = path.join(outDir, "packs");
    await fs.mkdir(packDir, { recursive: true });
    const coreTarball = npmCommand(["pack", "--workspace", "@veewo/claw-core", "--pack-destination", packDir])
      .split(/\r?\n/).at(-1);
    const clientTarball = npmCommand(["pack", "--workspace", "@veewo/claw-client", "--pack-destination", packDir])
      .split(/\r?\n/).at(-1);
    const cliTarball = npmCommand(["pack", "--workspace", "@veewo/claw", "--pack-destination", packDir])
      .split(/\r?\n/).at(-1);
    assert(coreTarball && clientTarball && cliTarball, "npm pack must produce core, client, and CLI tarballs.");
    const clientContents = npmCommand([
      "pack", "--workspace", "@veewo/claw-client", "--dry-run", "--json",
    ]);
    const cliContents = npmCommand([
      "pack", "--workspace", "@veewo/claw", "--dry-run", "--json",
    ]);
    assert(clientContents.includes("dist/index.js") && clientContents.includes("dist/index.d.ts"), "Client pack must contain runtime and declarations.");
    assert(cliContents.includes("dist/session-daemon-entry.js"), "CLI pack must contain the session daemon entry.");
    const installDir = path.join(outDir, "installed-packages");
    await fs.mkdir(installDir, { recursive: true });
    await fs.writeFile(path.join(installDir, "package.json"), JSON.stringify({
      private: true,
      type: "module",
      dependencies: {
        "@veewo/claw-core": `file:${path.join(packDir, coreTarball)}`,
        "@veewo/claw-client": `file:${path.join(packDir, clientTarball)}`,
        "@veewo/claw": `file:${path.join(packDir, cliTarball)}`,
      },
    }, null, 2));
    execFileSync(
      process.execPath,
      [npmExecPath, "install", "--ignore-scripts"],
      { cwd: installDir, stdio: "pipe" },
    );
    const installedCliPath = path.join(installDir, "node_modules", "@veewo", "claw", "dist", "bin.js");
    assert(
      execFileSync(process.execPath, [installedCliPath, "--version"], { cwd: installDir, encoding: "utf8" }).trim() === cliVersion,
      "Installed tarball CLI version smoke failed.",
    );
    await assertCodexDriverCompatibility({ cliPath: installedCliPath, cwd: installDir });
    const installedSessionProject = path.join(outDir, "installed-session-project");
    const installedSessionRuntime = path.join(outDir, "installed-session-runtime");
    await fs.mkdir(installedSessionProject, { recursive: true });
    execFileSync(
      process.execPath,
      [installedCliPath, "init", "--name", "Installed Session Smoke", "--planning", "false"],
      { cwd: installedSessionProject, stdio: "pipe" },
    );
    const installedClientPath = path.join(
      installDir,
      "node_modules",
      "@veewo",
      "claw-client",
      "dist",
      "index.js",
    );
    const installedDaemonPath = path.join(
      installDir,
      "node_modules",
      "@veewo",
      "claw",
      "dist",
      "session-daemon-entry.js",
    );
    const { ClawClient } = await import(`${pathToFileURL(installedClientPath).href}?release=${Date.now()}`);
    const previousIdleTtl = process.env.CLAW_SESSION_DAEMON_IDLE_TTL_MS;
    process.env.CLAW_SESSION_DAEMON_IDLE_TTL_MS = "100";
    try {
      const installedSession = await new ClawClient({
        runtimeRoot: installedSessionRuntime,
        daemonEntryPath: installedDaemonPath,
        startupTimeoutMs: 10_000,
      }).open("release-smoke-agent", installedSessionProject);
      await installedSession.command({
        operation: "plan.create",
        input: {
          taskName: "release-session-plan",
          title: "Release session plan",
          goalText: "Verify installed client and daemon",
        },
      });
      const simple = await installedSession.command({
        operation: "plan.show",
        input: { simple: true },
      });
      assert(simple.goal?.text === "Verify installed client and daemon", "Installed client/daemon command smoke failed.");
      await installedSession.close();
      await new Promise((resolve) => setTimeout(resolve, 250));
    } finally {
      if (previousIdleTtl === undefined) delete process.env.CLAW_SESSION_DAEMON_IDLE_TTL_MS;
      else process.env.CLAW_SESSION_DAEMON_IDLE_TTL_MS = previousIdleTtl;
    }
    if (includePlatformArtifacts) {
    const smokeHome = path.join(outDir, "home");
    const smokeProject = path.join(outDir, "project");
    await fs.mkdir(smokeProject, { recursive: true });
    await installCodexPluginBundle({
      sourceRoot: repoRoot,
      cacheRoot: path.join(smokeHome, ".codex", "plugins", "cache", "claw-kit"),
    });
    const cliPath = path.join(repoRoot, "packages", "cli", "dist", "bin.js");
    const smokeEnv = { ...process.env, HOME: smokeHome, USERPROFILE: smokeHome };
    execFileSync(process.execPath, [cliPath, "init", "--name", "Release Template Smoke"], {
      cwd: smokeProject,
      env: smokeEnv,
      stdio: "pipe",
    });
    for (const templateName of ["update", "create-claw-skill"]) {
      const output = execFileSync(process.execPath, [cliPath, "template", "validate", "--template", templateName], {
        cwd: smokeProject,
        env: smokeEnv,
        encoding: "utf8",
      });
      const validation = JSON.parse(output);
      assert(validation.ok === true && validation.templateId === templateName, `Bundled template ${templateName} failed isolated CLI validation.`);
    }
    for (const templateName of [
      "release-claw-cli",
      "release-codex-plugin",
      "release-cindy-plugin",
      "release-openclaw-plugin",
      "release-opencode-plugin",
    ]) {
      const projectTemplateOutput = execFileSync(
        process.execPath,
        [cliPath, "template", "validate", "--template", templateName],
        { cwd: repoRoot, env: smokeEnv, encoding: "utf8" },
      );
      const projectTemplateValidation = JSON.parse(projectTemplateOutput);
      assert(
        projectTemplateValidation.ok === true && projectTemplateValidation.templateId === templateName,
        `Repository-local ${templateName} template failed CLI validation.`,
      );
    }
    }
  } finally {
    await fs.rm(outDir, { recursive: true, force: true });
  }

  return { cliVersion };
}

const release = await verifyReleaseReadiness();
console.log(`Release CLI ${release.cliVersion} is committed, pushed, version-aligned, and package-smoke verified.`);
if (includePlatformArtifacts) console.log("The coordinated platform-artifact gate also passed.");

if (!publish) {
  console.log("Dry run complete. Re-run with --publish to publish @veewo/claw-core, @veewo/claw-client, and @veewo/claw.");
  process.exit(0);
}

for (const workspace of ["@veewo/claw-core", "@veewo/claw-client", "@veewo/claw"]) {
  assert(npmExecPath, "Release publishing must run through an npm script so npm_execpath is available.");
  const result = spawnSync(process.execPath, [npmExecPath, "publish", "--workspace", workspace, "--access", "public"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

assertCleanWorktree("After publishing");
console.log(`Published @veewo/claw-core, @veewo/claw-client, and @veewo/claw ${release.cliVersion}.`);
console.log("Next: refresh the global CLI. Refresh a platform plugin only when that platform artifact was separately released.");
