// Bundle Core's pure policy without adding the heavyweight Core runtime dependency.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const adapterRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const coreOutput = path.resolve(adapterRoot, "../core/dist/src");
const check = process.argv.includes("--check");
await fs.mkdir(path.join(adapterRoot, "lib"), { recursive: true });
for (const suffix of ["js", "d.ts"]) {
  const name = `role-preferences.${suffix}`;
  const content = await fs.readFile(path.join(coreOutput, name), "utf8");
  const expected = "// Generated from packages/core/src/role-preferences.ts; do not edit this artifact.\n"
    + content.replace(/^\/\/# sourceMappingURL=.*$/gm, "");
  const target = path.join(adapterRoot, "lib", name);
  if (check) {
    const actual = await fs.readFile(target, "utf8").catch(() => "");
    if (actual !== expected) throw new Error(`${name} is stale; run npm run build -w @veewo/dsh-claw-kit.`);
  } else {
    await fs.writeFile(target, expected);
  }
}
