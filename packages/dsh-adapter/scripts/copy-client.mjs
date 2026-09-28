import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
fs.copyFileSync(path.join(root, "client.js"), path.join(root, "lib", "client.js"));
