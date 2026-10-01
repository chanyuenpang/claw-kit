import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const specPath = path.join(skillDir, "runtime.json");
const operation = process.argv[2];
const forwardedArgs = process.argv.slice(3);

function fail(code, message, details = {}) {
  process.stdout.write(`${JSON.stringify({ ok: false, code, message, details })}\n`);
  process.exit(1);
}

function readSpec() {
  try {
    const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
    if (spec.schemaVersion !== 1 || spec.package !== "@veewo/claw" || !/^\d+\.\d+\.\d+$/u.test(spec.version ?? "")) {
      throw new Error("Expected schemaVersion 1, package @veewo/claw, and an exact version.");
    }
    return spec;
  } catch (error) {
    fail("KNOWLEDGE_CAPTURE_RUNTIME_SPEC_INVALID", "The bundled knowledge-capture runtime specification is invalid.", {
      specPath,
      cause: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function findOnPath(name) {
  const result = spawnSync(process.platform === "win32" ? "where.exe" : "which", [name], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) return null;
  return result.stdout.split(/\r?\n/u).find(Boolean)?.trim() ?? null;
}

function globalCliEntry() {
  if (process.platform === "win32") {
    const launcher = findOnPath("claw.cmd");
    if (!launcher) return null;
    const entry = path.join(path.dirname(launcher), "node_modules", "@veewo", "claw", "dist", "bin.js");
    return fs.existsSync(entry) ? entry : null;
  }
  const launcher = findOnPath("claw");
  if (!launcher) return null;
  const entry = path.resolve(path.dirname(launcher), "..", "lib", "node_modules", "@veewo", "claw", "dist", "bin.js");
  return fs.existsSync(entry) ? entry : null;
}

function npmCliEntry() {
  if (typeof process.env.npm_execpath === "string" && fs.existsSync(process.env.npm_execpath)) return process.env.npm_execpath;
  const launcher = findOnPath(process.platform === "win32" ? "npm.cmd" : "npm");
  if (!launcher) return null;
  const entry = path.join(path.dirname(launcher), "node_modules", "npm", "bin", "npm-cli.js");
  return fs.existsSync(entry) ? entry : null;
}

function invoke(args) {
  return spawnSync(process.execPath, args, { encoding: "utf8", windowsHide: true });
}

function parseJson(result) {
  for (const output of [result.stdout, result.stderr]) {
    try { return JSON.parse(output); } catch { /* Try the other stream. */ }
  }
  return null;
}

function supports(entry, spec) {
  const version = invoke([entry, "--version"]);
  if (version.status !== 0 || version.stdout.trim() !== spec.version) return false;
  return ["prepare", "complete"].every((subcommand) => invoke([entry, "help", "knowledge", subcommand]).status === 0);
}

function resolveRuntime(spec) {
  const globalEntry = globalCliEntry();
  if (globalEntry && supports(globalEntry, spec)) return { source: "global", invokeArgs: (args) => [globalEntry, ...args] };
  const npmCli = npmCliEntry();
  if (!npmCli) return null;
  const baseArgs = [npmCli, "exec", "--yes", `--package=${spec.package}@${spec.version}`, "--", "claw"];
  const version = invoke([...baseArgs, "--version"]);
  if (version.status !== 0 || version.stdout.trim() !== spec.version) return null;
  if (!["prepare", "complete"].every((subcommand) => invoke([...baseArgs, "help", "knowledge", subcommand]).status === 0)) return null;
  return { source: "npm-exec", invokeArgs: (args) => [...baseArgs, ...args] };
}

function bindingFor(spec) {
  return `sha256:${createHash("sha256").update(JSON.stringify(spec)).digest("hex")}`;
}

function takeOption(name) {
  const index = forwardedArgs.indexOf(name);
  if (index < 0 || index === forwardedArgs.length - 1) return null;
  const [, value] = forwardedArgs.splice(index, 2);
  return value;
}

if (!["prepare", "complete"].includes(operation)) {
  fail("KNOWLEDGE_CAPTURE_RUNTIME_SPEC_INVALID", "Use the knowledge-capture runner with prepare or complete.");
} else {
  const spec = readSpec();
  if (spec) {
    const expectedBinding = bindingFor(spec);
    if (operation === "complete") {
      const suppliedBinding = takeOption("--runtime-binding");
      if (suppliedBinding !== expectedBinding) {
        fail("KNOWLEDGE_CAPTURE_RUNTIME_CHANGED", "The knowledge-capture runtime changed after prepare; run prepare again before completing.", { expectedBinding, suppliedBinding });
      }
    }
    const runtime = resolveRuntime(spec);
    if (!runtime) {
      fail("KNOWLEDGE_CAPTURE_RUNTIME_UNAVAILABLE", "A compatible pinned knowledge-capture CLI runtime is unavailable.", { package: spec.package, version: spec.version });
    } else {
      const result = invoke(runtime.invokeArgs(["knowledge", operation, ...forwardedArgs]));
      const payload = parseJson(result);
      if (!payload) {
        fail("KNOWLEDGE_CAPTURE_RUNTIME_MISMATCH", "The selected knowledge-capture CLI did not return a successful JSON response.", {
          source: runtime.source,
          package: spec.package,
          version: spec.version,
          cause: result.error?.message ?? result.stderr?.trim() ?? result.stdout?.trim() ?? `exit ${result.status}`,
        });
      } else {
        payload.captureRuntime = { schemaVersion: 1, package: spec.package, version: spec.version, source: runtime.source, binding: expectedBinding };
        process.stdout.write(`${JSON.stringify(payload)}\n`);
        process.exitCode = result.status ?? (payload.ok === false ? 1 : 0);
      }
    }
  }
}
