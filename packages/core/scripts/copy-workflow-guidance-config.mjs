import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, "..");

const configFiles = [
  "workflow-guidance.codex.config.json",
  "workflow-guidance.qoder.config.json",
];

for (const configFile of configFiles) {
  const sourcePath = path.join(packageDir, "src", configFile);
  const destPath = path.join(packageDir, "dist", "src", configFile);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(sourcePath, destPath);
}
