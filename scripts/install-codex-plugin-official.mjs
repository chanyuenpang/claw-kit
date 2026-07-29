import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  activateOfficialCodexPluginIdentity,
  installCodexPluginBundle,
} from "./codex-plugin-bundle.mjs";

const officialMarketplace = "https://github.com/chanyuenpang/claw-kit.git";
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "claw-kit-marketplace-"));

console.log("Cloning the published claw-kit GitHub marketplace...");
try {
  const clone = spawnSync(
    "git",
    ["clone", "--depth", "1", "--branch", "main", officialMarketplace, tempRoot],
    { stdio: "inherit" },
  );
  if (clone.error) throw clone.error;
  if (clone.status !== 0) {
    throw new Error("Unable to clone the published claw-kit GitHub marketplace.");
  }

  const result = await installCodexPluginBundle({
    sourceDir: path.join(tempRoot, "packages", "codex-adapter"),
  });
  const identity = await activateOfficialCodexPluginIdentity();

  console.log(`Installed GitHub marketplace plugin cache at ${result.installDir}`);
  console.log(`Enabled ${identity.enabledIdentity} and disabled ${identity.disabledIdentity}.`);
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}

console.log("Codex GitHub marketplace plugin update completed. Restart Codex and start a new task to load the refreshed skills.");
