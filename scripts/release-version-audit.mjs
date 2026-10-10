import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { families } from "./candidate-versions.mjs";
import { verifyCandidate } from "./release-candidate.mjs";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const read = async file => JSON.parse(await fs.readFile(file, "utf8"));
const manifests = {
  cli: ["package.json", "packages/core/package.json", "packages/client/package.json", "packages/cli/package.json"],
  codex: ["packages/codex-adapter/package.json", "packages/codex-adapter/.codex-plugin/plugin.json"],
  dsh: ["packages/dsh-adapter/package.json"],
  cindy: ["packages/cindy-adapter/package.json", "packages/cindy-adapter/plugin/ghost.json"],
  openclaw: ["packages/openclaw-adapter/package.json", "packages/openclaw-adapter/openclaw.plugin.json"],
  opencode: ["packages/opencode-adapter/package.json"],
};

// A read-only release worksheet, not publication permission or a remote-availability gate.
export function compareReleaseVersions({ cliBase, artifacts, sourceVersions, candidates = {}, phase = "beta" }) {
  if (!/^\d+\.\d+\.\d+$/.test(cliBase) || !["beta", "release"].includes(phase) || !artifacts.length || artifacts.some(f => !families.includes(f)) || new Set(artifacts).size !== artifacts.length) throw new Error("Specify a CLI base, beta/release phase and distinct supported artifact families.");
  const rows = families.map(family => {
    const selected = artifacts.includes(family);
    const versions = sourceVersions[family] ?? [];
    const sourceVersion = versions[0] ?? null;
    const entry = candidates[family];
    const problems = [];
    const aligned = version => family === "cli" ? version === cliBase : new RegExp("^" + cliBase.replaceAll(".", "\\.") + "\\.\\d+$").test(version);
    if (!sourceVersion || versions.some(v => v !== sourceVersion)) problems.push("Source manifests disagree or are missing.");
    if (sourceVersion && !aligned(sourceVersion)) problems.push("Source version does not use target CLI base.");
    if (entry) {
      if (!aligned(entry.version)) problems.push("Frozen candidate uses a different CLI base; prepare a new candidate, never relabel it.");
      if (entry.version !== sourceVersion) problems.push("Frozen version differs from current source target; review or prepare the latest candidate.");
      if (entry.cliPins?.some(pin => pin !== cliBase)) problems.push("Frozen CLI runtime pin differs from target CLI base.");
      if (entry.pluginPins?.some(pin => pin !== entry.version)) problems.push("Frozen Codex bridge plugin pin differs from its manifest version.");
      if (family === "dsh" && entry.npmVersion !== entry.version.replace(/^(\d+\.\d+\.\d+)\.(\d+)$/, "$1-rc.$2")) problems.push("DSH npm mapping differs.");
    } else if (phase === "release" || Object.keys(candidates).length) problems.push("No selected frozen candidate supplied; prepare/freeze it before promotion.");
    return { family, selected, sourceVersion, candidateVersion: entry?.version ?? null, candidateDirectory: entry?.directory ?? null, status: selected ? (problems.length ? "needs-preparation-or-review" : "aligned") : "not-selected", problems };
  });
  return { phase, cliBase, artifacts, ok: rows.every(row => !row.selected || !row.problems.length), rows,
    note: "Unselected rows and unknown publication status do not authorize or block unrelated releases. Review public npm/tags separately; this worksheet does not prove trial, retrieval or activation." };
}

export async function auditReleaseVersions({ sourceRoot = repoRoot, artifacts, cliBase, candidateDirectories = [], phase = "beta" } = {}) {
  const sourceVersions = {};
  for (const family of families) sourceVersions[family] = await Promise.all(manifests[family].map(async file => {
    try { return (await read(path.join(sourceRoot, file))).version; }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
  }));
  try {
    const route = await fs.readFile(path.join(sourceRoot, ".agents/skills/using-claw-kit/references/hosts/codex.md"), "utf8");
    sourceVersions.codex.push(...[...route.matchAll(/const pluginVersion = "([^"]+)";/g)].map(match => match[1]));
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  cliBase ??= sourceVersions.cli[0];
  const candidates = {};
  for (const directory of candidateDirectories) {
    const manifest = await read(path.join(directory, "candidate.json"));
    const selected = manifest.schemaVersion === 1 ? ["cli", "codex"] : manifest.selected ?? [];
    if (!selected.some(f => artifacts.includes(f))) continue;
    const verified = await verifyCandidate(directory);
    for (const family of selected.filter(f => artifacts.includes(f))) {
      if (candidates[family]) throw new Error("Choose exactly one candidate for " + family + "; do not silently select among batches.");
      const entry = manifest.artifacts?.[family] ?? (family === "cli" ? { version: manifest.version } : manifest.codex);
      const cliPins = [];
      if (entry.directory) {
        const prefix = entry.directory + "/";
        for (const file of Object.keys(manifest.files).filter(file => file.startsWith(prefix) && file.endsWith("/skills/knowledge-capture/runtime.json"))) {
          const runtime = await read(path.join(verified.directory, "artifacts", file));
          if (runtime.package === "@veewo/claw") cliPins.push(runtime.version);
        }
      }
      const pluginPins = [];
      if (family === "codex") {
        for (const file of Object.keys(manifest.files).filter(file => file.startsWith(entry.directory + "/") && file.endsWith("/skills/using-claw-kit/references/hosts/codex.md"))) {
          const route = await fs.readFile(path.join(verified.directory, "artifacts", file), "utf8");
          pluginPins.push(...[...route.matchAll(/const pluginVersion = "([^"]+)";/g)].map(match => match[1]));
        }
      }
      candidates[family] = { ...entry, directory: verified.directory, cliPins, pluginPins };
    }
  }
  return compareReleaseVersions({ cliBase, artifacts, sourceVersions, candidates, phase });
}

export async function main(args = process.argv.slice(2)) {
  const options = { candidateDirectories: [] };
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i], value = args[i + 1];
    if (!["--artifacts", "--cli-base", "--phase", "--candidate"].includes(key) || !value || value.startsWith("--")) throw new Error("Use --artifacts <families> [--cli-base <version>] [--phase beta|release] [--candidate <dir>] (repeat candidate per batch).");
    if (key === "--candidate") options.candidateDirectories.push(path.resolve(value));
    else { const field = { "--artifacts": "artifacts", "--cli-base": "cliBase", "--phase": "phase" }[key]; if (options[field]) throw new Error("Duplicate " + key); options[field] = key === "--artifacts" ? value.split(",") : value; }
  }
  if (!options.artifacts) throw new Error("Explicit --artifacts is required; auditing does not select release scope.");
  const result = await auditReleaseVersions(options);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
