import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliVersion = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(cliVersion ?? "")) throw new Error("Usage: node scripts/verify-codex-registry-compatibility.mjs <cli-version>");
const skill = await fs.readFile(path.join(root, "packages/codex-adapter/skills/using-claw-kit/SKILL.md"), "utf8");
const cacheKey = /const cacheKey = "([^"]+)"/.exec(skill)?.[1];
const driverVersion = Number(/driverVersion !== (\d+)/.exec(skill)?.[1]);
if (!cacheKey || !Number.isInteger(driverVersion)) throw new Error("Codex plugin does not declare a driver contract.");
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "claw-registry-gate-"));
try {
  await fs.writeFile(path.join(temp, "package.json"), JSON.stringify({ private: true, dependencies: { "@veewo/claw": cliVersion } }));
  execFileSync(process.execPath, [process.env.npm_execpath, "install", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: temp, stdio: "inherit" });
  const bin = path.join(temp, "node_modules", "@veewo", "claw", "dist", "bin.js");
  const driver = JSON.parse(execFileSync(process.execPath, [bin, "codex", "driver"], { encoding: "utf8" }));
  if (driver.cacheKey !== cacheKey || driver.driverVersion !== driverVersion) throw new Error(`Registry CLI mismatch: expected ${cacheKey}/v${driverVersion}, got ${driver.cacheKey}/v${driver.driverVersion}.`);
  console.log(`Registry CLI ${cliVersion} satisfies Codex driver ${cacheKey}.`);
} finally { await fs.rm(temp, { recursive: true, force: true }); }
