import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const operation = process.argv[2];
const forwardedArgs = process.argv.slice(3);
function fail(code, message, details = {}) { process.stdout.write(`${JSON.stringify({ ok: false, code, message, details })}\n`); process.exit(1); }
function readSpec() { try { const spec = JSON.parse(fs.readFileSync(path.join(skillDir, "runtime.json"), "utf8")); if (spec.schemaVersion !== 1 || spec.package !== "@veewo/claw" || !/^\d+\.\d+\.\d+$/.test(spec.version ?? "")) throw new Error("Expected exact claw runtime."); return spec; } catch (error) { fail("KNOWLEDGE_CAPTURE_RUNTIME_SPEC_INVALID", "The bundled knowledge-capture runtime specification is invalid.", { cause: error instanceof Error ? error.message : String(error) }); } }
function find(name) { const result = spawnSync(process.platform === "win32" ? "where.exe" : "which", [name], { encoding: "utf8", windowsHide: true }); return result.status === 0 ? result.stdout.split(/\r?\n/).find(Boolean)?.trim() ?? null : null; }
function invoke(args) { return spawnSync(process.execPath, args, { encoding: "utf8", windowsHide: true }); }
function globalEntry() { const launcher = find(process.platform === "win32" ? "claw.cmd" : "claw"); if (!launcher) return null; const entry = process.platform === "win32" ? path.join(path.dirname(launcher), "node_modules", "@veewo", "claw", "dist", "bin.js") : path.resolve(path.dirname(launcher), "..", "lib", "node_modules", "@veewo", "claw", "dist", "bin.js"); return fs.existsSync(entry) ? entry : null; }
function supports(args, spec) { return invoke([...args, "--version"]).status === 0 && invoke([...args, "--version"]).stdout.trim() === spec.version && ["prepare", "complete"].every((name) => invoke([...args, "help", "knowledge", name]).status === 0); }
function runtime(spec) { const entry = globalEntry(); if (entry && supports([entry], spec)) return [entry]; const npm = find(process.platform === "win32" ? "npm.cmd" : "npm"); if (!npm) return null; const npmCli = path.join(path.dirname(npm), "node_modules", "npm", "bin", "npm-cli.js"); const args = [npmCli, "exec", "--yes", `--package=${spec.package}@${spec.version}`, "--", "claw"]; return fs.existsSync(npmCli) && supports(args, spec) ? args : null; }
function take(name) { const index = forwardedArgs.indexOf(name); if (index < 0 || index === forwardedArgs.length - 1) return null; return forwardedArgs.splice(index, 2)[1]; }
if (!['prepare', 'complete'].includes(operation)) fail("KNOWLEDGE_CAPTURE_RUNTIME_SPEC_INVALID", "Use prepare or complete.");
const spec = readSpec(); const binding = `sha256:${createHash("sha256").update(JSON.stringify(spec)).digest("hex")}`;
if (operation === "complete" && take("--runtime-binding") !== binding) fail("KNOWLEDGE_CAPTURE_RUNTIME_CHANGED", "The knowledge-capture runtime changed after prepare; run prepare again before completing.", { expectedBinding: binding });
const args = runtime(spec); if (!args) fail("KNOWLEDGE_CAPTURE_RUNTIME_UNAVAILABLE", "A compatible pinned knowledge-capture CLI runtime is unavailable.", { package: spec.package, version: spec.version });
const result = invoke([...args, "knowledge", operation, ...forwardedArgs]); let payload; for (const output of [result.stdout, result.stderr]) { try { payload = JSON.parse(output); break; } catch {} }
if (!payload) fail("KNOWLEDGE_CAPTURE_RUNTIME_MISMATCH", "The selected knowledge-capture CLI did not return JSON.", { cause: result.stderr.trim() || result.stdout.trim() || `exit ${result.status}` });
payload.captureRuntime = { schemaVersion: 1, package: spec.package, version: spec.version, source: args.length === 1 ? "global" : "npm-exec", binding }; process.stdout.write(`${JSON.stringify(payload)}\n`); process.exitCode = result.status ?? (payload.ok === false ? 1 : 0);
