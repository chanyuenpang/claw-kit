import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inventory } from "./release-candidate.mjs";
import { auditReleaseVersions, compareReleaseVersions } from "./release-version-audit.mjs";

const sourceVersions = { cli: ["0.2.50", "0.2.50", "0.2.50", "0.2.50"], codex: ["0.2.50.1", "0.2.50.1"], dsh: ["0.2.50.0"], cindy: ["0.2.50.1", "0.2.50.1"], openclaw: ["0.2.49.0", "0.2.49.0"], opencode: ["0.2.49.0"] };
const audit = options => compareReleaseVersions({ cliBase: "0.2.50", sourceVersions, artifacts: ["codex"], ...options });

test("partial beta reports unselected lag without expanding or blocking scope", () => {
  const report = audit({ phase: "beta" });
  assert.equal(report.ok, true);
  assert.equal(report.rows.find(r => r.family === "openclaw").status, "not-selected");
  assert.ok(report.rows.find(r => r.family === "openclaw").problems.length);
  assert.equal(report.rows.find(r => r.family === "codex").status, "aligned");
});
test("formal release requires an explicit frozen candidate, not just reset source manifests", () => {
  const report = audit({ phase: "release" });
  assert.equal(report.ok, false);
  assert.match(report.rows.find(r => r.family === "codex").problems.join(" "), /No selected frozen candidate/);
});
test("old platform beta cannot masquerade as current formal release by publishing old CLI pins", () => {
  const report = audit({ phase: "release", candidates: { codex: { version: "0.2.49.1", cliPins: ["0.2.49"] } } });
  assert.equal(report.ok, false);
  assert.match(report.rows.find(r => r.family === "codex").problems.join(" "), /different CLI base.*runtime pin/);
});
test("aligned family fourth segments need not equal each other", () => {
  assert.equal(audit({ phase: "release", artifacts: ["codex", "dsh", "cindy"], candidates: { codex: { version: "0.2.50.1", cliPins: ["0.2.50"] }, dsh: { version: "0.2.50.0", npmVersion: "0.2.50-rc.0" }, cindy: { version: "0.2.50.1" } } }).ok, true);
});
test("detect manifest disagreement, stale same-base candidate and invalid DSH encoding", () => {
  assert.equal(audit({ sourceVersions: { ...sourceVersions, codex: ["0.2.50.1", "0.2.50.2"] } }).ok, false);
  assert.equal(audit({ candidates: { codex: { version: "0.2.50.0" } } }).ok, false);
  assert.equal(audit({ candidates: { codex: { version: "0.2.50.1", pluginPins: ["0.2.49.1"] } } }).ok, false);
  assert.equal(audit({ artifacts: ["dsh"], candidates: { dsh: { version: "0.2.50.0", npmVersion: "0.2.50.0" } } }).ok, false);
});
test("frozen candidate audit reads the declared runtime pin, not only manifest versions", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "claw-version-audit-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = await auditReleaseVersions({ artifacts: ["codex"] });
  const version = source.rows.find(r => r.family === "codex").sourceVersion;
  const artifacts = path.join(root, "artifacts");
  const plugin = path.join(artifacts, "marketplace/packages/codex-adapter");
  await fs.mkdir(path.join(plugin, ".codex-plugin"), { recursive: true });
  await fs.mkdir(path.join(plugin, "skills/knowledge-capture"), { recursive: true });
  await fs.writeFile(path.join(plugin, ".codex-plugin/plugin.json"), JSON.stringify({ version }));
  await fs.writeFile(path.join(plugin, "skills/knowledge-capture/runtime.json"), JSON.stringify({ package: "@veewo/claw", version: "0.0.1" }));
  const entry = { version, directory: "marketplace" };
  await fs.writeFile(path.join(root, "candidate.json"), JSON.stringify({ schemaVersion: 2, state: "frozen", version: source.cliBase, sourceRevision: "a".repeat(40), packages: [], selected: ["codex"], codex: entry, versions: { codex: { version } }, artifacts: { codex: entry }, files: await inventory(artifacts) }));
  const report = await auditReleaseVersions({ artifacts: ["codex"], candidateDirectories: [root], phase: "release" });
  assert.equal(report.ok, false);
  assert.match(report.rows.find(r => r.family === "codex").problems.join(" "), /runtime pin/);
});

test("read-only repository source worksheet resolves current baseline", async () => {
  const result = await auditReleaseVersions({ artifacts: ["cli", "codex", "dsh", "cindy"] });
  assert.equal(result.cliBase, result.rows.find(r => r.family === "cli").sourceVersion);
  assert.equal(result.ok, true);
});
