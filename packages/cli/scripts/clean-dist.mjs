import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
for (const directory of ["dist", "dist-test"]) {
  fs.rmSync(path.resolve(scriptDir, "..", directory), { recursive: true, force: true });
}
