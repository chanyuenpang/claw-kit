import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, "..");
const sourcePath = path.join(packageDir, "src", "workflow-guidance.config.json");
const destPath = path.join(packageDir, "dist", "src", "workflow-guidance.config.json");

fs.mkdirSync(path.dirname(destPath), { recursive: true });
fs.copyFileSync(sourcePath, destPath);
