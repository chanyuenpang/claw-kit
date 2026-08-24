import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { exportCodexPluginBundle, installCodexPluginBundle } from "./codex-plugin-bundle.mjs";
import { assertSharedSkillsSynced } from "./sync-shared-skills.mjs";
import { assertTemplateVersionsAligned } from "./update-template-versions.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publish = process.argv.includes("--publish");
const requiredPluginSkills = ["planning", "config", "update", "create-claw-skill", "feature-architecture", "claw-kit-doc"];
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

function assertRepositoryMarketplaceSnapshot({ pluginVersion }) {
  const marketplace = readHeadJson(".agents/plugins/marketplace.json");
  const entry = marketplace.plugins?.find((candidate) => candidate.name === "claw-kit");
  assert(entry?.source?.source === "local", "Committed Codex marketplace entry must use a local repository source.");
  assert(entry?.source?.path === "./packages/codex-adapter", "Committed Codex marketplace must point claw-kit at ./packages/codex-adapter.");

  const sourceRoot = entry.source.path.replace(/^\.\//, "");
  const committedManifest = readHeadJson(`${sourceRoot}/.codex-plugin/plugin.json`);
  assert(committedManifest.version === pluginVersion, "Committed Codex plugin manifest must match the release plugin version.");

  for (const relativePath of [
    ".codex-plugin/plugin.json",
    "hooks/hooks.json",
    "package.json",
    "skills/using-claw-kit/SKILL.md",
    "skills/planning/SKILL.md",
    "skills/config/SKILL.md",
    "skills/claw-kit-doc/SKILL.md",
    "skills/claw-kit-doc/agents/openai.yaml",
    "skills/claw-kit-doc/references/update.md",
    "skills/claw-kit-doc/references/configuration.md",
    "skills/claw-kit-doc/references/knowledge-format.md",
    "skills/update/SKILL.md",
    "skills/update/TEMPLATE.json",
    "skills/create-claw-skill/SKILL.md",
    "skills/create-claw-skill/TEMPLATE.json",
    "skills/create-claw-skill/FALLBACK.md",
    "skills/create-claw-skill/CONTENT-COVERAGE.md",
    "skills/create-claw-skill/references/template-authoring.md",
    "skills/create-claw-skill/references/template-upgrade.md",
    "skills/create-claw-skill/scripts/create-claw-skill-stub.mjs",
    "skills/feature-architecture/SKILL.md",
    "skills/feature-architecture/references/design-artifacts.md",
  ]) {
    assertHeadPathExists(`${sourceRoot}/${relativePath}`);
  }
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(repoRoot, relativePath), "utf8"));
}

function isAdapterVersion(adapterVersion, cliVersion) {
  const prefix = `${cliVersion}.`;
  return adapterVersion.startsWith(prefix) && /^\d+\.\d+\.\d+\.\d+$/.test(adapterVersion) && adapterVersion.slice(prefix.length).length > 0;
}

async function verifyReleaseReadiness() {
  const root = await readJson("package.json");
  const core = await readJson("packages/core/package.json");
  const client = await readJson("packages/client/package.json");
  const cli = await readJson("packages/cli/package.json");
  const codex = await readJson("packages/codex-adapter/package.json");
  const openclaw = await readJson("packages/openclaw-adapter/package.json");
  const openclawManifest = await readJson("packages/openclaw-adapter/openclaw.plugin.json");
  const opencode = await readJson("packages/opencode-adapter/package.json");
  const marketplace = await readJson(".agents/plugins/marketplace.json");
  const plugin = await readJson("packages/codex-adapter/.codex-plugin/plugin.json");

  const cliVersion = root.version;

  assert(core.version === cliVersion, `@veewo/claw-core version ${core.version} must equal the CLI release version ${cliVersion}.`);
  assert(client.version === cliVersion, `@veewo/claw-client version ${client.version} must equal the CLI release version ${cliVersion}.`);
  assert(client.peerDependencies?.["@veewo/claw"] === cliVersion, "Client optional CLI peer must match the release version.");
  assert(cli.version === cliVersion, `@veewo/claw version ${cli.version} must equal the CLI release version ${cliVersion}.`);
  assert(cli.dependencies?.["@veewo/claw-client"] === cliVersion, "CLI must pin the exact @veewo/claw-client version.");
  assert(cli.dependencies?.["@veewo/claw-core"] === cliVersion, "CLI must pin the exact @veewo/claw-core version.");
  assert(openclaw.dependencies?.["@veewo/claw-core"] === cliVersion, "OpenClaw adapter must pin the exact @veewo/claw-core version.");
  assert(openclawManifest.id === "claw-kit", "OpenClaw native plugin manifest must use the claw-kit id.");
  assert(openclawManifest.version === openclaw.version, "OpenClaw native plugin manifest version must match the adapter package.");
  assert(
    Array.isArray(openclawManifest.skills) && openclawManifest.skills.includes("skills"),
    "OpenClaw native plugin manifest must declare its skills root.",
  );
  for (const relativePath of [
    "packages/openclaw-adapter/skills/claw-kit-doc/SKILL.md",
    "packages/openclaw-adapter/skills/claw-kit-doc/references/update.md",
    "packages/openclaw-adapter/skills/claw-kit-doc/references/configuration.md",
    "packages/openclaw-adapter/skills/claw-kit-doc/references/knowledge-format.md",
  ]) {
    await fs.access(path.join(repoRoot, relativePath));
  }

  for (const [name, pkg] of [
    ["codex-adapter", codex],
    ["openclaw-adapter", openclaw],
    ["opencode-adapter", opencode],
  ]) {
    assert(
      isAdapterVersion(pkg.version, cliVersion),
      `${name} version ${pkg.version} must start with ${cliVersion}. and use four segments (e.g. ${cliVersion}.0).`,
    );
  }

  assert(
    plugin.version === codex.version,
    `Codex plugin manifest version ${plugin.version} must match codex-adapter version ${codex.version}.`,
  );

  assert(marketplace.plugins?.some((entry) => entry.name === "claw-kit" && entry.source?.path === "./packages/codex-adapter"), "Codex marketplace must point claw-kit at ./packages/codex-adapter.");
  await assertTemplateVersionsAligned({ repoRoot, expectedVersion: cliVersion });
  await assertSharedSkillsSynced({ adapterDirs: [path.join(repoRoot, "packages", "codex-adapter")] });
  assertCleanWorktree("Before publishing");
  assertDirectMainCheckout();
  assertRepositoryMarketplaceSnapshot({ pluginVersion: plugin.version });

  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "claw-kit-release-plugin-"));
  try {
    const bundle = await exportCodexPluginBundle({ outDir });
    for (const skillName of requiredPluginSkills) {
      await fs.access(path.join(bundle.bundleDir, "skills", skillName, "SKILL.md"));
    }
    await fs.access(path.join(bundle.bundleDir, "skills", "update", "TEMPLATE.json"));
    for (const referenceName of ["update.md", "configuration.md", "knowledge-format.md"]) {
      await fs.access(path.join(bundle.bundleDir, "skills", "claw-kit-doc", "references", referenceName));
    }
    await fs.access(path.join(bundle.bundleDir, "skills", "create-claw-skill", "TEMPLATE.json"));
    await fs.access(path.join(bundle.bundleDir, "skills", "create-claw-skill", "FALLBACK.md"));

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
    const smokeHome = path.join(outDir, "home");
    const smokeProject = path.join(outDir, "project");
    await fs.mkdir(smokeProject, { recursive: true });
    await installCodexPluginBundle({
      sourceDir: path.join(repoRoot, "packages", "codex-adapter"),
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
  } finally {
    await fs.rm(outDir, { recursive: true, force: true });
  }

  return { cliVersion, codexPluginVersion: plugin.version };
}

const release = await verifyReleaseReadiness();
console.log(`Release CLI ${release.cliVersion} is committed, pushed, version-aligned, and exposes a complete Git marketplace plugin snapshot.`);
console.log(`Codex plugin version: ${release.codexPluginVersion}`);
console.log("The committed repository marketplace is the Codex release artifact; no GitHub Release ZIP is required.");

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
console.log("Next: invoke the claw-kit update skill to refresh the global CLI and the official GitHub marketplace plugin. Do not install from local workspace content.");
