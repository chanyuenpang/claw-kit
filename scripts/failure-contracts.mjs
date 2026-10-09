import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export async function failureContractOutputs(sourceRoot = root) {
  const source = await fs.readFile(path.join(sourceRoot, "packages/core/src/errors.ts"), "utf8");
  const marker = "// Generated from packages/core/src/errors.ts; do not edit.\n";
  return [
    ["packages/cindy-adapter/plugin/node/failure-diagnostics.cjs", marker + ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText],
    ["packages/opencode-adapter/plugin/failure-diagnostics.ts", marker + source],
  ];
}
export async function checkFailureContracts(sourceRoot = root, host) {
  // Only owners whose actual inputs consume this contract need its check.
  // Artificial/minimal artifact fixtures without that import remain valid.
  if (host) {
    const runtime = path.join(sourceRoot, host === "cindy" ? "packages/cindy-adapter/plugin/node/claw-worker.cjs" : "packages/opencode-adapter/plugin/index.ts");
    const body = await fs.readFile(runtime, "utf8").catch(() => "");
    if (!body.includes("failure-diagnostics")) return;
  }
  for (const [name, content] of await failureContractOutputs(sourceRoot)) {
    if (host && !name.includes("/" + host + "-adapter/")) continue;
    if (await fs.readFile(path.join(sourceRoot, name), "utf8").catch(() => "") !== content) throw new Error(name + " is stale; run node scripts/failure-contracts.mjs");
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--check")) await checkFailureContracts();
  else for (const [name, content] of await failureContractOutputs()) await fs.writeFile(path.join(root, name), content);
}
